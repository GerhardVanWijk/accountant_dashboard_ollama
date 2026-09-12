import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeferredTaxComputation, ID } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post this draft deferred tax computation" operation.
 *
 * Tax & Compliance integrity audit, continuation (2026-09-12) — same
 * defect class as Income Tax (`taxComputationPostingExecutor.ts`): before
 * this executor, `DeferredTaxComputationService.postComputation()` posted
 * the movement journal, then separately updated the computation row. The
 * real executor is the atomic Postgres RPC `post_deferred_tax_computation`
 * (migration 0103, AUTHORED NOT APPLIED).
 */
export interface PostDeferredTaxComputationInput {
  deferredTaxComputationId: ID;
  date: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced movement journal lines. Empty when there is no real movement. */
  lines: NewJournalLineInput[];
  movementAmount: number;
  priorNetDeferredTaxLiability: number | undefined;
  postedByUserId?: ID;
}

export interface PostDeferredTaxComputationResult {
  idempotent: boolean;
  journalEntryId?: ID;
  computation: DeferredTaxComputation;
}

export interface DeferredTaxPostingExecutor {
  postComputation(input: PostDeferredTaxComputationInput): Promise<PostDeferredTaxComputationResult>;
}

interface DeferredTaxComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  as_of_date: string;
  status: string;
  tax_rate_percent: number;
  tax_config_id: string;
  tax_config_tax_year_label: string;
  items: DeferredTaxComputation['items'];
  total_deferred_tax_liability: number;
  total_deferred_tax_asset: number;
  net_deferred_tax_liability: number;
  prior_net_deferred_tax_liability: number | null;
  movement_amount: number | null;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToComputation(row: DeferredTaxComputationRow): DeferredTaxComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    asOfDate: row.as_of_date,
    status: row.status as DeferredTaxComputation['status'],
    taxRatePercent: row.tax_rate_percent,
    taxConfigId: row.tax_config_id,
    taxConfigTaxYearLabel: row.tax_config_tax_year_label,
    items: row.items ?? [],
    totalDeferredTaxLiability: row.total_deferred_tax_liability,
    totalDeferredTaxAsset: row.total_deferred_tax_asset,
    netDeferredTaxLiability: row.net_deferred_tax_liability,
    priorNetDeferredTaxLiability: row.prior_net_deferred_tax_liability ?? undefined,
    movementAmount: row.movement_amount ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

/** Production: the atomic `post_deferred_tax_computation` RPC (migration 0103). */
export class RealDeferredTaxPostingExecutor implements DeferredTaxPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postComputation(input: PostDeferredTaxComputationInput): Promise<PostDeferredTaxComputationResult> {
    const { data, error } = await this.client.rpc('post_deferred_tax_computation', {
      p_deferred_tax_computation_id: input.deferredTaxComputationId,
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
      p_prior_net_deferred_tax_liability: input.priorNetDeferredTaxLiability ?? null,
      p_posted_by: input.postedByUserId ?? null,
    });
    if (error) throw new Error(`post_deferred_tax_computation: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string | null; computation: DeferredTaxComputationRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id ?? undefined, computation: rowToComputation(row.computation) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeDeferredTaxPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  computations: {
    getById(id: ID): Promise<DeferredTaxComputation | undefined>;
    update(id: ID, patch: Partial<DeferredTaxComputation>): Promise<DeferredTaxComputation>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_deferred_tax_computation` step for step. */
export class FakeDeferredTaxPostingExecutor implements DeferredTaxPostingExecutor {
  private readonly log = new Map<ID, PostDeferredTaxComputationResult>();

  constructor(private readonly deps: FakeDeferredTaxPostingExecutorDeps) {}

  async postComputation(input: PostDeferredTaxComputationInput): Promise<PostDeferredTaxComputationResult> {
    const seen = this.log.get(input.deferredTaxComputationId);
    if (seen) return { ...seen, idempotent: true };

    const computation = await this.deps.computations.getById(input.deferredTaxComputationId);
    if (!computation) throw new Error(`post_deferred_tax_computation: deferred tax computation ${input.deferredTaxComputationId} not found`);
    if (computation.status !== 'draft') {
      throw new Error(`post_deferred_tax_computation: deferred tax computation for "${computation.financialYearLabel}" has already been posted`);
    }

    await this.deps.beforeCommit?.();

    if (input.lines.length === 0) {
      const updated = await this.deps.computations.update(input.deferredTaxComputationId, {
        status: 'posted',
        priorNetDeferredTaxLiability: input.priorNetDeferredTaxLiability,
        movementAmount: 0,
        postedAt: new Date().toISOString(),
        postedByUserId: input.postedByUserId,
      });
      const result: PostDeferredTaxComputationResult = { idempotent: false, computation: updated };
      this.log.set(input.deferredTaxComputationId, result);
      return result;
    }

    const entry = await this.deps.journal.postJournalEntry({ date: input.date, memo: input.memo, source: input.source, lines: input.lines });

    const updated = await this.deps.computations.update(input.deferredTaxComputationId, {
      status: 'posted',
      journalEntryId: entry.id,
      priorNetDeferredTaxLiability: input.priorNetDeferredTaxLiability,
      movementAmount: input.movementAmount,
      postedAt: new Date().toISOString(),
      postedByUserId: input.postedByUserId,
    });

    const result: PostDeferredTaxComputationResult = { idempotent: false, journalEntryId: entry.id, computation: updated };
    this.log.set(input.deferredTaxComputationId, result);
    return result;
  }
}
