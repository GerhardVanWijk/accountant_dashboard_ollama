import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, TaxComputation } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post this draft income tax computation" operation.
 *
 * Tax & Compliance integrity audit (2026-09-12) — before this executor,
 * `TaxComputationService.postComputation()` made 2 separate,
 * independently-committing writes (post the DR Income Tax Expense / CR
 * Income Tax Payable journal, then update `tax_computations` to
 * status='posted'/journalEntryId) — a failure between them leaves a real
 * posted GL journal with the computation still showing 'draft', and a
 * retry would post a SECOND journal for the same year's tax liability,
 * doubling Income Tax Expense/Payable. Same defect class the Leases +
 * Payroll integrity audit found and fixed for `payroll_runs` (migration
 * 0091) — `RealPayrollRunPostingExecutor`/`FakePayrollRunPostingExecutor`
 * is this file's exact template.
 *
 * The real executor is the atomic Postgres RPC `post_income_tax_computation`
 * (migration 0100, AUTHORED NOT APPLIED). A tax computation posts at most
 * once, ever (createComputation()'s per-financial-year guard already makes
 * that structural) — the idempotency key is the computation's own stable
 * id, no separate caller-generated token needed.
 */
export interface PostIncomeTaxComputationInput {
  taxComputationId: ID;
  /** Financial year end date — income tax is accrued/recognized at year-close, not "today". */
  date: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced journal lines. Empty for a nil-liability (loss year / SBC 0% band) computation — nothing to post to the GL, but the computation still moves to 'posted'. */
  lines: NewJournalLineInput[];
  postedByUserId?: ID;
}

export interface PostIncomeTaxComputationResult {
  idempotent: boolean;
  journalEntryId?: ID;
  computation: TaxComputation;
}

export interface TaxComputationPostingExecutor {
  postComputation(input: PostIncomeTaxComputationInput): Promise<PostIncomeTaxComputationResult>;
}

interface TaxComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  status: string;
  accounting_profit: number;
  is_sbc_eligible: boolean;
  adjustments: TaxComputation['adjustments'];
  taxable_income: number;
  tax_config_id: string;
  tax_config_tax_year_label: string;
  tax_liability: number;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToComputation(row: TaxComputationRow): TaxComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    status: row.status as TaxComputation['status'],
    accountingProfit: row.accounting_profit,
    isSbcEligible: row.is_sbc_eligible,
    adjustments: row.adjustments ?? [],
    taxableIncome: row.taxable_income,
    taxConfigId: row.tax_config_id,
    taxConfigTaxYearLabel: row.tax_config_tax_year_label,
    taxLiability: row.tax_liability,
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

/** Production: the atomic `post_income_tax_computation` RPC (migration 0100). */
export class RealTaxComputationPostingExecutor implements TaxComputationPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postComputation(input: PostIncomeTaxComputationInput): Promise<PostIncomeTaxComputationResult> {
    const { data, error } = await this.client.rpc('post_income_tax_computation', {
      p_tax_computation_id: input.taxComputationId,
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
    if (error) throw new Error(`post_income_tax_computation: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string | null; computation: TaxComputationRow };
    return {
      idempotent: row.idempotent,
      journalEntryId: row.journal_entry_id ?? undefined,
      computation: rowToComputation(row.computation),
    };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeTaxComputationPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  computations: {
    getById(id: ID): Promise<TaxComputation | undefined>;
    update(id: ID, patch: Partial<TaxComputation>): Promise<TaxComputation>;
  };
  /** Fires after validation but before the journal would be posted — lets tests prove the "no partial state" contract, mirroring FakePayrollRunPostingExecutor. */
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_income_tax_computation` step for step — including de-duplication on the computation's own stable id and the draft-only re-validation. */
export class FakeTaxComputationPostingExecutor implements TaxComputationPostingExecutor {
  private readonly log = new Map<ID, PostIncomeTaxComputationResult>();

  constructor(private readonly deps: FakeTaxComputationPostingExecutorDeps) {}

  async postComputation(input: PostIncomeTaxComputationInput): Promise<PostIncomeTaxComputationResult> {
    const seen = this.log.get(input.taxComputationId);
    if (seen) return { ...seen, idempotent: true };

    const computation = await this.deps.computations.getById(input.taxComputationId);
    if (!computation) throw new Error(`post_income_tax_computation: tax computation ${input.taxComputationId} not found`);
    if (computation.status !== 'draft') {
      throw new Error(`post_income_tax_computation: tax computation for "${computation.financialYearLabel}" has already been posted`);
    }

    await this.deps.beforeCommit?.();

    if (input.lines.length === 0) {
      const updated = await this.deps.computations.update(input.taxComputationId, {
        status: 'posted',
        postedAt: new Date().toISOString(),
        postedByUserId: input.postedByUserId,
      });
      const result: PostIncomeTaxComputationResult = { idempotent: false, computation: updated };
      this.log.set(input.taxComputationId, result);
      return result;
    }

    const entry = await this.deps.journal.postJournalEntry({ date: input.date, memo: input.memo, source: input.source, lines: input.lines });

    const updated = await this.deps.computations.update(input.taxComputationId, {
      status: 'posted',
      journalEntryId: entry.id,
      postedAt: new Date().toISOString(),
      postedByUserId: input.postedByUserId,
    });

    const result: PostIncomeTaxComputationResult = { idempotent: false, journalEntryId: entry.id, computation: updated };
    this.log.set(input.taxComputationId, result);
    return result;
  }
}
