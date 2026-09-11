import type { SupabaseClient } from '@supabase/supabase-js';
import type { DepreciationMethod, EstimateRevision, ID } from '@/types';
import type { IEstimateRevisionRepository } from './IEstimateRevisionRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface EstimateRevisionRow {
  id: string;
  asset_id: string;
  effective_date: string;
  useful_life_years: number;
  residual_value: number;
  depreciation_method: DepreciationMethod;
  reducing_balance_rate_percent: number | null;
  previous_useful_life_years: number;
  previous_residual_value: number;
  previous_depreciation_method: DepreciationMethod;
  previous_reducing_balance_rate_percent: number | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEstimateRevision(row: EstimateRevisionRow): EstimateRevision {
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

/**
 * Supabase-backed IEstimateRevisionRepository (migration 0079). Append-only
 * — no update()/delete(), matching the interface and the table's revoked
 * UPDATE/DELETE grants. Resolves "the" company internally at create() time.
 */
export class SupabaseEstimateRevisionRepository implements IEstimateRevisionRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseEstimateRevisionRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<EstimateRevision[]> {
    const { data, error } = await this.client
      .from('fixed_asset_estimate_revisions')
      .select('*')
      .order('effective_date', { ascending: true });
    if (error) throw new Error(`SupabaseEstimateRevisionRepository.getAll: ${error.message}`);
    return (data as EstimateRevisionRow[]).map(rowToEstimateRevision);
  }

  async getByAsset(assetId: ID): Promise<EstimateRevision[]> {
    const { data, error } = await this.client
      .from('fixed_asset_estimate_revisions')
      .select('*')
      .eq('asset_id', assetId)
      .order('effective_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseEstimateRevisionRepository.getByAsset: ${error.message}`);
    }
    return (data as EstimateRevisionRow[]).map(rowToEstimateRevision);
  }

  async create(entity: EstimateRevision): Promise<EstimateRevision> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('fixed_asset_estimate_revisions')
      .insert({
        company_id: companyId,
        asset_id: entity.assetId,
        effective_date: entity.effectiveDate,
        useful_life_years: entity.usefulLifeYears,
        residual_value: entity.residualValue,
        depreciation_method: entity.depreciationMethod,
        reducing_balance_rate_percent: entity.reducingBalanceRatePercent ?? null,
        previous_useful_life_years: entity.previousUsefulLifeYears,
        previous_residual_value: entity.previousResidualValue,
        previous_depreciation_method: entity.previousDepreciationMethod,
        previous_reducing_balance_rate_percent: entity.previousReducingBalanceRatePercent ?? null,
        reason: entity.reason ?? null,
        created_by: entity.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseEstimateRevisionRepository.create: ${error.message}`);
    return rowToEstimateRevision(data as EstimateRevisionRow);
  }
}
