import type { SupabaseClient } from '@supabase/supabase-js';
import type { DepreciationMethod, EstimateRevision, FixedAssetStatus, ID } from '@/types';

/**
 * One logical "record a change-in-estimate" operation.
 *
 * The real executor is the atomic Postgres RPC `revise_fixed_asset_estimate`
 * (migration 0084): one implicit transaction that appends the
 * `fixed_asset_estimate_revisions` row (or no-ops if this exact
 * (asset, effective_date) revision already exists) and — on EITHER path —
 * unconditionally resyncs the `fixed_assets` "current estimate" cache to
 * whichever revision now has the latest effective_date. A failure between
 * the two writes can no longer happen; there is only one write.
 * `RealEstimateRevisionExecutor` calls it; `FakeEstimateRevisionExecutor`
 * mirrors its exact contract over the in-memory mocks for tests.
 */
export interface PostRevisionInput {
  assetId: ID;
  effectiveDate: string;
  usefulLifeYears: number;
  residualValue: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  previousUsefulLifeYears: number;
  previousResidualValue: number;
  previousDepreciationMethod: DepreciationMethod;
  previousReducingBalanceRatePercent?: number;
  reason?: string;
  createdBy?: ID;
}

export interface PostRevisionResult {
  /** true when a revision for this exact (asset, effective_date) already existed — nothing new was appended. */
  idempotent: boolean;
  revision: EstimateRevision;
}

export interface EstimateRevisionExecutor {
  postRevision(input: PostRevisionInput): Promise<PostRevisionResult>;
}

interface EstimateRevisionRow {
  id: string;
  asset_id: string;
  effective_date: string;
  useful_life_years: number | string;
  residual_value: number | string;
  depreciation_method: DepreciationMethod;
  reducing_balance_rate_percent: number | string | null;
  previous_useful_life_years: number | string;
  previous_residual_value: number | string;
  previous_depreciation_method: DepreciationMethod;
  previous_reducing_balance_rate_percent: number | string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRevision(row: EstimateRevisionRow): EstimateRevision {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetId: row.asset_id,
    effectiveDate: row.effective_date,
    usefulLifeYears: Number(row.useful_life_years),
    residualValue: Number(row.residual_value),
    depreciationMethod: row.depreciation_method,
    reducingBalanceRatePercent: row.reducing_balance_rate_percent === null ? undefined : Number(row.reducing_balance_rate_percent),
    previousUsefulLifeYears: Number(row.previous_useful_life_years),
    previousResidualValue: Number(row.previous_residual_value),
    previousDepreciationMethod: row.previous_depreciation_method,
    previousReducingBalanceRatePercent:
      row.previous_reducing_balance_rate_percent === null ? undefined : Number(row.previous_reducing_balance_rate_percent),
    reason: row.reason ?? undefined,
    createdBy: row.created_by ?? undefined,
  };
}

/** Production: the atomic `revise_fixed_asset_estimate` RPC (migration 0084). */
export class RealEstimateRevisionExecutor implements EstimateRevisionExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postRevision(input: PostRevisionInput): Promise<PostRevisionResult> {
    const { data, error } = await this.client.rpc('revise_fixed_asset_estimate', {
      p_asset_id: input.assetId,
      p_effective_date: input.effectiveDate,
      p_useful_life_years: input.usefulLifeYears,
      p_residual_value: input.residualValue,
      p_depreciation_method: input.depreciationMethod,
      p_reducing_balance_rate_percent: input.reducingBalanceRatePercent ?? null,
      p_previous_useful_life_years: input.previousUsefulLifeYears,
      p_previous_residual_value: input.previousResidualValue,
      p_previous_depreciation_method: input.previousDepreciationMethod,
      p_previous_reducing_balance_rate_percent: input.previousReducingBalanceRatePercent ?? null,
      p_reason: input.reason ?? null,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`revise_fixed_asset_estimate: ${error.message}`);
    const row = data as { idempotent: boolean; revision: EstimateRevisionRow };
    return { idempotent: row.idempotent, revision: rowToRevision(row.revision) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeEstimateRevisionExecutorDeps {
  assets: {
    getById(id: ID): Promise<{ status: FixedAssetStatus; cost: number; accumulatedDepreciation: number } | undefined>;
    update(id: ID, patch: Record<string, unknown>): Promise<unknown>;
  };
  revisions: {
    getByAsset(assetId: ID): Promise<EstimateRevision[]>;
    create(entity: Omit<EstimateRevision, 'id' | 'createdAt' | 'updatedAt'> & { id: ''; createdAt: ''; updatedAt: '' }): Promise<EstimateRevision>;
  };
  /** Same "prove all-or-nothing" hook as the other fake executors. */
  beforeCommit?: () => void | Promise<void>;
}

/**
 * Test double. Mirrors `revise_fixed_asset_estimate` step for step —
 * including de-duplication on the natural (asset, effective_date) key (no
 * synthetic id needed, same as the RPC) and the unconditional cache resync
 * to the latest revision — so FixedAssetService tests exercise the same
 * observable contract the production RPC provides.
 */
export class FakeEstimateRevisionExecutor implements EstimateRevisionExecutor {
  constructor(private readonly deps: FakeEstimateRevisionExecutorDeps) {}

  async postRevision(input: PostRevisionInput): Promise<PostRevisionResult> {
    const asset = await this.deps.assets.getById(input.assetId);
    if (!asset) throw new Error(`revise_fixed_asset_estimate: asset ${input.assetId} not found in company`);
    if (asset.status !== 'active' && asset.status !== 'fully_depreciated') {
      throw new Error(`revise_fixed_asset_estimate: asset ${input.assetId} is ${asset.status} — estimates can only be revised on a capitalized asset still on the books`);
    }

    const existing = await this.deps.revisions.getByAsset(input.assetId);
    const dup = existing.find((r) => r.effectiveDate.slice(0, 10) === input.effectiveDate.slice(0, 10));

    await this.deps.beforeCommit?.();

    let revision: EstimateRevision;
    let idempotent = false;
    if (dup) {
      revision = dup;
      idempotent = true;
    } else {
      revision = await this.deps.revisions.create({
        id: '',
        assetId: input.assetId,
        effectiveDate: input.effectiveDate,
        usefulLifeYears: input.usefulLifeYears,
        residualValue: input.residualValue,
        depreciationMethod: input.depreciationMethod,
        reducingBalanceRatePercent: input.reducingBalanceRatePercent,
        previousUsefulLifeYears: input.previousUsefulLifeYears,
        previousResidualValue: input.previousResidualValue,
        previousDepreciationMethod: input.previousDepreciationMethod,
        previousReducingBalanceRatePercent: input.previousReducingBalanceRatePercent,
        reason: input.reason,
        createdBy: input.createdBy,
        createdAt: '',
        updatedAt: '',
      });
    }

    // Unconditionally resync the cache to whichever revision now has the
    // latest effective_date — same rule on both the fresh-insert and the
    // idempotent-retry path (mirrors the RPC exactly).
    const all = await this.deps.revisions.getByAsset(input.assetId);
    const sorted = all.slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const latest = sorted[sorted.length - 1];
    const reactivate = asset.status === 'fully_depreciated' && asset.cost - latest.residualValue - asset.accumulatedDepreciation > 0.005;
    await this.deps.assets.update(input.assetId, {
      usefulLifeYears: latest.usefulLifeYears,
      residualValue: latest.residualValue,
      depreciationMethod: latest.depreciationMethod,
      reducingBalanceRatePercent: latest.reducingBalanceRatePercent,
      ...(reactivate ? { status: 'active' as const } : {}),
    });

    return { idempotent, revision };
  }
}
