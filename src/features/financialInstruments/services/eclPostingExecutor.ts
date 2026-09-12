import type { SupabaseClient } from '@supabase/supabase-js';
import type { EclComputation, ID } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post this draft expected credit loss computation" operation.
 *
 * Tax & Compliance integrity audit, continuation (2026-09-12) — same
 * defect class as Deferred Tax (`deferredTaxPostingExecutor.ts`): before
 * this executor, `EclComputationService.postComputation()` posted the
 * movement journal, then separately updated the computation row. The real
 * executor is the atomic Postgres RPC `post_ecl_computation` (migration
 * 0104, AUTHORED NOT APPLIED).
 */
export interface PostEclComputationInput {
  eclComputationId: ID;
  date: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced movement journal lines. Empty when there is no real movement. */
  lines: NewJournalLineInput[];
  movementAmount: number;
  priorTotalExpectedCreditLoss: number | undefined;
  postedByUserId?: ID;
}

export interface PostEclComputationResult {
  idempotent: boolean;
  journalEntryId?: ID;
  computation: EclComputation;
}

export interface EclPostingExecutor {
  postComputation(input: PostEclComputationInput): Promise<PostEclComputationResult>;
}

interface EclComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  as_of_date: string;
  status: string;
  buckets: EclComputation['buckets'];
  total_gross_receivable: number;
  total_expected_credit_loss: number;
  prior_total_expected_credit_loss: number | null;
  movement_amount: number | null;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToComputation(row: EclComputationRow): EclComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    asOfDate: row.as_of_date,
    status: row.status as EclComputation['status'],
    buckets: row.buckets ?? [],
    totalGrossReceivable: row.total_gross_receivable,
    totalExpectedCreditLoss: row.total_expected_credit_loss,
    priorTotalExpectedCreditLoss: row.prior_total_expected_credit_loss ?? undefined,
    movementAmount: row.movement_amount ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

/** Production: the atomic `post_ecl_computation` RPC (migration 0104). */
export class RealEclPostingExecutor implements EclPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postComputation(input: PostEclComputationInput): Promise<PostEclComputationResult> {
    const { data, error } = await this.client.rpc('post_ecl_computation', {
      p_ecl_computation_id: input.eclComputationId,
      p_date: input.date,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_movement_amount: input.movementAmount,
      p_prior_total_expected_credit_loss: input.priorTotalExpectedCreditLoss ?? null,
      p_posted_by: input.postedByUserId ?? null,
    });
    if (error) throw new Error(`post_ecl_computation: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string | null; computation: EclComputationRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id ?? undefined, computation: rowToComputation(row.computation) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeEclPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  computations: {
    getById(id: ID): Promise<EclComputation | undefined>;
    update(id: ID, patch: Partial<EclComputation>): Promise<EclComputation>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_ecl_computation` step for step. */
export class FakeEclPostingExecutor implements EclPostingExecutor {
  private readonly log = new Map<ID, PostEclComputationResult>();

  constructor(private readonly deps: FakeEclPostingExecutorDeps) {}

  async postComputation(input: PostEclComputationInput): Promise<PostEclComputationResult> {
    const seen = this.log.get(input.eclComputationId);
    if (seen) return { ...seen, idempotent: true };

    const computation = await this.deps.computations.getById(input.eclComputationId);
    if (!computation) throw new Error(`post_ecl_computation: expected credit loss computation ${input.eclComputationId} not found`);
    if (computation.status !== 'draft') {
      throw new Error(`post_ecl_computation: expected credit loss computation for "${computation.financialYearLabel}" has already been posted`);
    }

    await this.deps.beforeCommit?.();

    if (input.lines.length === 0) {
      const updated = await this.deps.computations.update(input.eclComputationId, {
        status: 'posted',
        priorTotalExpectedCreditLoss: input.priorTotalExpectedCreditLoss,
        movementAmount: 0,
        postedAt: new Date().toISOString(),
        postedByUserId: input.postedByUserId,
      });
      const result: PostEclComputationResult = { idempotent: false, computation: updated };
      this.log.set(input.eclComputationId, result);
      return result;
    }

    const entry = await this.deps.journal.postJournalEntry({ date: input.date, memo: input.memo, source: input.source, lines: input.lines });

    const updated = await this.deps.computations.update(input.eclComputationId, {
      status: 'posted',
      journalEntryId: entry.id,
      priorTotalExpectedCreditLoss: input.priorTotalExpectedCreditLoss,
      movementAmount: input.movementAmount,
      postedAt: new Date().toISOString(),
      postedByUserId: input.postedByUserId,
    });

    const result: PostEclComputationResult = { idempotent: false, journalEntryId: entry.id, computation: updated };
    this.log.set(input.eclComputationId, result);
    return result;
  }
}
