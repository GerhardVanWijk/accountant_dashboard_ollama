import type { SupabaseClient } from '@supabase/supabase-js';
import type { DividendDeclaration, ID } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * The three atomic "post this dividend lifecycle transition" operations.
 *
 * Tax & Compliance integrity audit, continuation (2026-09-12) — before
 * this executor, `DividendDeclarationService.declare()`/`pay()`/
 * `remitToSars()` each made 2 separate, independently-committing writes
 * (post the journal, then separately update `dividend_declarations.status`
 * + the relevant journal-entry-id/date column). A failure between them
 * leaves a real posted GL journal with the declaration still showing its
 * PRIOR status, and a retry posts a SECOND journal for the same
 * transition. Same defect class as Income Tax
 * (`taxComputationPostingExecutor.ts`) and Provisional Tax
 * (`provisionalTaxPostingExecutor.ts`) — this file is their template,
 * adapted for the one real difference: a DividendDeclaration has THREE
 * independent, sequential lifecycle transitions (declare -> pay -> remit),
 * each its own posting event, so the idempotency key is
 * (declaration id, transition) — see `declare_dividend`/`pay_dividend`/
 * `remit_dividend_to_sars`, migration 0102's comment.
 *
 * The real executors are the atomic Postgres RPCs `declare_dividend`,
 * `pay_dividend`, `remit_dividend_to_sars` (migration 0102, AUTHORED NOT
 * APPLIED).
 */
export interface PostDividendTransitionInput {
  dividendDeclarationId: ID;
  date: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced journal lines. Empty for remit() on a fully-exempt declaration — nothing to post to the GL, but the transition still commits. */
  lines: NewJournalLineInput[];
  postedByUserId?: ID;
}

export interface PostDividendTransitionResult {
  idempotent: boolean;
  journalEntryId?: ID;
  declaration: DividendDeclaration;
}

export interface DividendDeclarationPostingExecutor {
  declareDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult>;
  payDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult>;
  remitDividendToSars(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult>;
}

interface DividendDeclarationRow {
  id: string;
  declaration_date: string;
  total_amount: number;
  exempt_portion: number;
  exemption_reason: string | null;
  status: string;
  taxable_amount: number;
  rate_percent_applied: number;
  withholding_tax_config_id: string | null;
  dividends_tax_withheld: number;
  net_payable_to_shareholders: number;
  declaration_journal_entry_id: string | null;
  payment_journal_entry_id: string | null;
  paid_date: string | null;
  remittance_journal_entry_id: string | null;
  remitted_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDeclaration(row: DividendDeclarationRow): DividendDeclaration {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    declarationDate: row.declaration_date,
    totalAmount: Number(row.total_amount),
    exemptPortion: Number(row.exempt_portion),
    exemptionReason: row.exemption_reason ?? undefined,
    status: row.status as DividendDeclaration['status'],
    taxableAmount: Number(row.taxable_amount),
    ratePercentApplied: Number(row.rate_percent_applied),
    withholdingTaxConfigId: row.withholding_tax_config_id ?? undefined,
    dividendsTaxWithheld: Number(row.dividends_tax_withheld),
    netPayableToShareholders: Number(row.net_payable_to_shareholders),
    declarationJournalEntryId: row.declaration_journal_entry_id ?? undefined,
    paymentJournalEntryId: row.payment_journal_entry_id ?? undefined,
    paidDate: row.paid_date ?? undefined,
    remittanceJournalEntryId: row.remittance_journal_entry_id ?? undefined,
    remittedDate: row.remitted_date ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function linesForRpc(lines: NewJournalLineInput[]) {
  return lines.map((line) => ({
    account_id: line.accountId,
    description: line.description ?? null,
    debit: line.debit,
    credit: line.credit,
  }));
}

/** Production: the atomic `declare_dividend`/`pay_dividend`/`remit_dividend_to_sars` RPCs (migration 0102). */
export class RealDividendDeclarationPostingExecutor implements DividendDeclarationPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  private async call(fn: string, input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    const { data, error } = await this.client.rpc(fn, {
      p_dividend_declaration_id: input.dividendDeclarationId,
      p_date: input.date,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: linesForRpc(input.lines),
      p_posted_by: input.postedByUserId ?? null,
    });
    if (error) throw new Error(`${fn}: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string | null; declaration: DividendDeclarationRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id ?? undefined, declaration: rowToDeclaration(row.declaration) };
  }

  declareDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.call('declare_dividend', input);
  }

  payDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.call('pay_dividend', input);
  }

  remitDividendToSars(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.call('remit_dividend_to_sars', input);
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeDividendDeclarationPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  declarations: {
    getById(id: ID): Promise<DividendDeclaration | undefined>;
    update(id: ID, patch: Partial<DividendDeclaration>): Promise<DividendDeclaration>;
  };
  /** Fires after validation but before the journal would be posted — mirrors every other Fake*PostingExecutor in this codebase. */
  beforeCommit?: () => void | Promise<void>;
}

type Transition = 'declare' | 'pay' | 'remit';

/** Test double. Mirrors the three RPCs step for step — including de-duplication keyed on (declaration id, transition), not the declaration alone. */
export class FakeDividendDeclarationPostingExecutor implements DividendDeclarationPostingExecutor {
  private readonly log = new Map<string, PostDividendTransitionResult>();

  constructor(private readonly deps: FakeDividendDeclarationPostingExecutorDeps) {}

  private logKey(id: ID, transition: Transition): string {
    return `${id}::${transition}`;
  }

  private async run(
    transition: Transition,
    input: PostDividendTransitionInput,
    requiredStatus: DividendDeclaration['status'],
    nextStatus: DividendDeclaration['status'],
    applyPatch: (declaration: DividendDeclaration, journalEntryId: ID | undefined) => Partial<DividendDeclaration>,
  ): Promise<PostDividendTransitionResult> {
    const key = this.logKey(input.dividendDeclarationId, transition);
    const seen = this.log.get(key);
    if (seen) return { ...seen, idempotent: true };

    const declaration = await this.deps.declarations.getById(input.dividendDeclarationId);
    if (!declaration) throw new Error(`${transition}_dividend: dividend declaration ${input.dividendDeclarationId} not found`);
    if (declaration.status !== requiredStatus) {
      throw new Error(`${transition}_dividend: dividend declaration "${input.dividendDeclarationId}" has status "${declaration.status}", expected "${requiredStatus}"`);
    }

    await this.deps.beforeCommit?.();

    let journalEntryId: ID | undefined;
    if (input.lines.length > 0) {
      const entry = await this.deps.journal.postJournalEntry({ date: input.date, memo: input.memo, source: input.source, lines: input.lines });
      journalEntryId = entry.id;
    }

    const updated = await this.deps.declarations.update(input.dividendDeclarationId, {
      status: nextStatus,
      ...applyPatch(declaration, journalEntryId),
    });

    const result: PostDividendTransitionResult = { idempotent: false, journalEntryId, declaration: updated };
    this.log.set(key, result);
    return result;
  }

  declareDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.run('declare', input, 'draft', 'declared', (_d, journalEntryId) => ({ declarationJournalEntryId: journalEntryId }));
  }

  payDividend(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.run('pay', input, 'declared', 'paid', (_d, journalEntryId) => ({ paymentJournalEntryId: journalEntryId, paidDate: input.date }));
  }

  remitDividendToSars(input: PostDividendTransitionInput): Promise<PostDividendTransitionResult> {
    return this.run('remit', input, 'paid', 'remitted', (_d, journalEntryId) => ({ remittanceJournalEntryId: journalEntryId, remittedDate: input.date }));
  }
}
