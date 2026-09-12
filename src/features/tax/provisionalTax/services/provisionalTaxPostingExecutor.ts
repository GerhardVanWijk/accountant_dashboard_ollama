import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import type { ProvisionalPaymentSlot, ProvisionalPaymentSlotName, ProvisionalTaxPeriod } from '@/types/provisionalTax';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "pay this provisional tax slot" operation.
 *
 * Tax & Compliance integrity audit, continuation (2026-09-12) — before this
 * executor, `ProvisionalTaxService.payProvisionalTax()` made 2 separate,
 * independently-committing writes (post the DR Income Tax Payable / CR Cash
 * and Bank journal, then update the relevant jsonb payment slot) — a
 * failure between them leaves a real posted GL payment with the slot still
 * showing unpaid, and a retry would post a SECOND payment for the same
 * slot. Same defect class as Income Tax (`taxComputationPostingExecutor.ts`)
 * and `post_payroll_run` (migration 0091) — this file is their exact
 * template, adapted for the one real difference: a ProvisionalTaxPeriod has
 * THREE independent, legitimate payment events (first/second/topUp), so the
 * idempotency key is (period id, slot) — see `post_provisional_tax`
 * migration 0101's comment.
 *
 * The real executor is the atomic Postgres RPC `pay_provisional_tax`
 * (migration 0101, AUTHORED NOT APPLIED).
 */
export interface PayProvisionalTaxInput {
  periodId: ID;
  slot: ProvisionalPaymentSlotName;
  amountPaid: number;
  date: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced journal lines (DR Income Tax Payable / CR Cash and Bank). */
  lines: NewJournalLineInput[];
  postedByUserId?: ID;
}

export interface PayProvisionalTaxResult {
  idempotent: boolean;
  journalEntryId?: ID;
  period: ProvisionalTaxPeriod;
}

export interface ProvisionalTaxPostingExecutor {
  payProvisionalTax(input: PayProvisionalTaxInput): Promise<PayProvisionalTaxResult>;
}

interface ProvisionalTaxPeriodRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  first_slot: ProvisionalPaymentSlot;
  second_slot: ProvisionalPaymentSlot;
  top_up_slot: ProvisionalPaymentSlot;
  created_at: string;
  updated_at: string;
}

function rowToPeriod(row: ProvisionalTaxPeriodRow): ProvisionalTaxPeriod {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    first: row.first_slot,
    second: row.second_slot,
    topUp: row.top_up_slot,
  };
}

/** Production: the atomic `pay_provisional_tax` RPC (migration 0101). */
export class RealProvisionalTaxPostingExecutor implements ProvisionalTaxPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async payProvisionalTax(input: PayProvisionalTaxInput): Promise<PayProvisionalTaxResult> {
    const { data, error } = await this.client.rpc('pay_provisional_tax', {
      p_period_id: input.periodId,
      p_slot: input.slot,
      p_amount_paid: input.amountPaid,
      p_date: input.date,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_posted_by: input.postedByUserId ?? null,
    });
    if (error) throw new Error(`pay_provisional_tax: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string | null; period: ProvisionalTaxPeriodRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id ?? undefined, period: rowToPeriod(row.period) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeProvisionalTaxPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  periods: {
    getById(id: ID): Promise<ProvisionalTaxPeriod | undefined>;
    update(id: ID, patch: Partial<ProvisionalTaxPeriod>): Promise<ProvisionalTaxPeriod>;
  };
  /** Fires after validation but before the journal would be posted — mirrors FakeTaxComputationPostingExecutor. */
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `pay_provisional_tax` step for step — including de-duplication keyed on (period id, slot), not the period alone. */
export class FakeProvisionalTaxPostingExecutor implements ProvisionalTaxPostingExecutor {
  private readonly log = new Map<string, PayProvisionalTaxResult>();

  constructor(private readonly deps: FakeProvisionalTaxPostingExecutorDeps) {}

  private logKey(periodId: ID, slot: ProvisionalPaymentSlotName): string {
    return `${periodId}::${slot}`;
  }

  async payProvisionalTax(input: PayProvisionalTaxInput): Promise<PayProvisionalTaxResult> {
    const key = this.logKey(input.periodId, input.slot);
    const seen = this.log.get(key);
    if (seen) return { ...seen, idempotent: true };

    const period = await this.deps.periods.getById(input.periodId);
    if (!period) throw new Error(`pay_provisional_tax: provisional tax period ${input.periodId} not found`);
    const currentSlot = period[input.slot];
    if (currentSlot.paidDate) {
      throw new Error(`pay_provisional_tax: the "${input.slot}" slot for "${period.financialYearLabel}" has already been recorded as paid`);
    }

    await this.deps.beforeCommit?.();

    const entry = await this.deps.journal.postJournalEntry({ date: input.date, memo: input.memo, source: input.source, lines: input.lines });

    const updatedSlot: ProvisionalPaymentSlot = { ...currentSlot, amountPaid: input.amountPaid, paidDate: input.date, journalEntryId: entry.id };
    const updated = await this.deps.periods.update(input.periodId, { [input.slot]: updatedSlot } as Partial<ProvisionalTaxPeriod>);

    const result: PayProvisionalTaxResult = { idempotent: false, journalEntryId: entry.id, period: updated };
    this.log.set(key, result);
    return result;
  }
}
