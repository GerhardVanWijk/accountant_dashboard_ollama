import type { SupabaseClient } from '@supabase/supabase-js';
import type { DepreciationEntry, FixedAssetStatus, ID } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post one accounting period's depreciation" operation.
 *
 * The real executor is the atomic Postgres RPC `post_asset_depreciation_period`
 * (migration 0081): one implicit transaction that posts the period's journal,
 * inserts every asset's `depreciation_entries` row, and updates every asset's
 * accumulated-depreciation/status snapshot — all or nothing.
 * `RealDepreciationPeriodExecutor` calls it; `FakeDepreciationPeriodExecutor`
 * mirrors its exact contract over the in-memory mocks for tests. Same
 * Real/Fake split as `DepositAllocationExecutor`
 * (src/features/sales/services/depositAllocationExecutor.ts).
 */
export interface DepreciationPeriodLineInput {
  assetId: ID;
  /** This period's charge for this asset — already computed by depreciationMath.ts. */
  amount: number;
  accumulatedDepreciationAfter: number;
  carryingValueAfter: number;
  newStatus: FixedAssetStatus;
  glDepreciationExpenseAccountId: ID;
  glAccumulatedDepreciationAccountId: ID;
  description: string;
}

export interface PostDepreciationPeriodInput {
  /**
   * Stable, immutable identity of this logical period-posting — a UUID
   * generated client-side BEFORE the RPC runs. A retry of the same intent
   * re-uses it; a genuinely new period-posting gets a fresh one. Never
   * derived from mutable state. De-duplicated by
   * `fixed_asset_period_posting_log`'s UNIQUE (company_id, run_id).
   */
  runId: ID;
  /** Posting date for this bucket's journal — the month-end (or a final clipped catch-up date). */
  periodEnd: string;
  memo: string;
  source: string;
  lines: DepreciationPeriodLineInput[];
  createdBy?: ID;
}

export interface PostDepreciationPeriodResult {
  /** true when this exact run id was already posted — nothing new happened. */
  idempotent: boolean;
  journalEntryId: ID;
  entries: DepreciationEntry[];
}

export interface DepreciationPeriodExecutor {
  postPeriod(input: PostDepreciationPeriodInput): Promise<PostDepreciationPeriodResult>;
}

interface DepreciationEntryRow {
  id: string;
  asset_id: string;
  period_end: string;
  amount: number | string;
  accumulated_depreciation_after: number | string;
  carrying_value_after: number | string;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: DepreciationEntryRow): DepreciationEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetId: row.asset_id,
    periodEnd: row.period_end,
    amount: Number(row.amount),
    accumulatedDepreciationAfter: Number(row.accumulated_depreciation_after),
    carryingValueAfter: Number(row.carrying_value_after),
    journalEntryId: row.journal_entry_id,
  };
}

/** Production: the atomic `post_asset_depreciation_period` RPC (migration 0081). */
export class RealDepreciationPeriodExecutor implements DepreciationPeriodExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postPeriod(input: PostDepreciationPeriodInput): Promise<PostDepreciationPeriodResult> {
    const { data, error } = await this.client.rpc('post_asset_depreciation_period', {
      p_run_id: input.runId,
      p_period_end: input.periodEnd,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        asset_id: line.assetId,
        amount: line.amount,
        accumulated_depreciation_after: line.accumulatedDepreciationAfter,
        carrying_value_after: line.carryingValueAfter,
        new_status: line.newStatus,
        gl_depreciation_expense_account_id: line.glDepreciationExpenseAccountId,
        gl_accumulated_depreciation_account_id: line.glAccumulatedDepreciationAccountId,
        description: line.description,
      })),
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_asset_depreciation_period: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; entries: DepreciationEntryRow[] };
    return {
      idempotent: row.idempotent,
      journalEntryId: row.journal_entry_id,
      entries: (row.entries ?? []).map(rowToEntry),
    };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeDepreciationPeriodExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  assets: {
    getById(id: ID): Promise<{ status: FixedAssetStatus } | undefined>;
    update(id: ID, patch: { accumulatedDepreciation: number; status: FixedAssetStatus }): Promise<unknown>;
  };
  depreciationEntries: {
    create(entity: Omit<DepreciationEntry, 'id' | 'createdAt' | 'updatedAt'> & { id: ''; createdAt: ''; updatedAt: '' }): Promise<DepreciationEntry>;
  };
  /**
   * Test-only hook: fired after every line has been validated (asset exists,
   * is active, has no prior entry for this month) but BEFORE any write. A
   * test that throws from this hook proves the fake's "no partial state"
   * contract exactly like a mid-transaction Postgres error would — nothing
   * in `journal`/`depreciationEntries`/`assets` has been touched yet at that
   * point, matching the real RPC's single-implicit-transaction guarantee.
   */
  beforeCommit?: () => void | Promise<void>;
}

/**
 * Test double. Mirrors `post_asset_depreciation_period` step for step —
 * including de-duplication on the stable `runId` and the hard
 * "one asset, one entry per month" rule the DB enforces via
 * UNIQUE (company_id, asset_id, period_end) — so DepreciationService tests
 * exercise the same observable contract the production RPC provides.
 */
export class FakeDepreciationPeriodExecutor implements DepreciationPeriodExecutor {
  private readonly log = new Map<ID, PostDepreciationPeriodResult>();
  private readonly posted = new Set<string>();

  constructor(private readonly deps: FakeDepreciationPeriodExecutorDeps) {}

  async postPeriod(input: PostDepreciationPeriodInput): Promise<PostDepreciationPeriodResult> {
    const seen = this.log.get(input.runId);
    if (seen) return { ...seen, idempotent: true };

    if (input.lines.length === 0) {
      throw new Error('post_asset_depreciation_period: at least one line is required');
    }

    const monthKey = input.periodEnd.slice(0, 7);
    for (const line of input.lines) {
      const asset = await this.deps.assets.getById(line.assetId);
      if (!asset) throw new Error(`post_asset_depreciation_period: asset ${line.assetId} not found in company`);
      if (asset.status !== 'active') {
        throw new Error(`post_asset_depreciation_period: asset ${line.assetId} is ${asset.status} — depreciation can only be posted for an active asset`);
      }
      const key = `${line.assetId}|${monthKey}`;
      if (this.posted.has(key)) {
        throw new Error(`post_asset_depreciation_period: asset ${line.assetId} already has a depreciation entry for ${input.periodEnd}`);
      }
    }

    await this.deps.beforeCommit?.();

    const journalLines: NewJournalLineInput[] = [];
    for (const line of input.lines) {
      journalLines.push({ accountId: line.glDepreciationExpenseAccountId, description: line.description, debit: line.amount, credit: 0 });
      journalLines.push({ accountId: line.glAccumulatedDepreciationAccountId, description: line.description, debit: 0, credit: line.amount });
    }
    const entry = await this.deps.journal.postJournalEntry({ date: input.periodEnd, memo: input.memo, source: input.source, lines: journalLines });

    const entries: DepreciationEntry[] = [];
    for (const line of input.lines) {
      const created = await this.deps.depreciationEntries.create({
        id: '',
        assetId: line.assetId,
        periodEnd: input.periodEnd,
        amount: line.amount,
        accumulatedDepreciationAfter: line.accumulatedDepreciationAfter,
        carryingValueAfter: line.carryingValueAfter,
        journalEntryId: entry.id,
        createdAt: '',
        updatedAt: '',
      });
      entries.push(created);
      this.posted.add(`${line.assetId}|${monthKey}`);
      await this.deps.assets.update(line.assetId, { accumulatedDepreciation: line.accumulatedDepreciationAfter, status: line.newStatus });
    }

    const result: PostDepreciationPeriodResult = { idempotent: false, journalEntryId: entry.id, entries };
    this.log.set(input.runId, result);
    return result;
  }
}
