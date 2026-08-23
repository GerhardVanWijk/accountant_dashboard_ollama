import type { SupabaseClient } from '@supabase/supabase-js';
import type { CgtInclusionRateConfig, ID } from '@/types';
import type { ICgtInclusionRateConfigRepository } from './ICgtInclusionRateConfigRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface CgtInclusionRateConfigRow {
  id: string;
  entity_type_bucket: string;
  inclusion_rate_percent: number;
  effective_from: string;
  effective_to: string | null;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: CgtInclusionRateConfigRow): CgtInclusionRateConfig {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entityTypeBucket: row.entity_type_bucket as CgtInclusionRateConfig['entityTypeBucket'],
    inclusionRatePercent: Number(row.inclusion_rate_percent),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    sourceReference: row.source_reference,
  };
}

function configToRow(entity: Partial<CgtInclusionRateConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.entityTypeBucket !== undefined) row.entity_type_bucket = entity.entityTypeBucket;
  if (entity.inclusionRatePercent !== undefined) row.inclusion_rate_percent = entity.inclusionRatePercent;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.effectiveTo !== undefined) row.effective_to = entity.effectiveTo;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed ICgtInclusionRateConfigRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase F). Resolves "the" company
 * internally at create() time.
 */
export class SupabaseCgtInclusionRateConfigRepository implements ICgtInclusionRateConfigRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCgtInclusionRateConfigRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<CgtInclusionRateConfig[]> {
    const { data, error } = await this.client.from('cgt_inclusion_rate_configs').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseCgtInclusionRateConfigRepository.getAll: ${error.message}`);
    return (data as CgtInclusionRateConfigRow[]).map(rowToConfig);
  }

  async getById(id: ID): Promise<CgtInclusionRateConfig | undefined> {
    const { data, error } = await this.client.from('cgt_inclusion_rate_configs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCgtInclusionRateConfigRepository.getById: ${error.message}`);
    }
    return data ? rowToConfig(data as CgtInclusionRateConfigRow) : undefined;
  }

  async create(entity: CgtInclusionRateConfig): Promise<CgtInclusionRateConfig> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('cgt_inclusion_rate_configs')
      .insert({ ...configToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCgtInclusionRateConfigRepository.create: ${error.message}`);
    return rowToConfig(data as CgtInclusionRateConfigRow);
  }

  async update(id: ID, patch: Partial<CgtInclusionRateConfig>): Promise<CgtInclusionRateConfig> {
    const { data, error } = await this.client.from('cgt_inclusion_rate_configs').update(configToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseCgtInclusionRateConfigRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCgtInclusionRateConfigRepository: config "${id}" not found`);
    return rowToConfig(data as CgtInclusionRateConfigRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('cgt_inclusion_rate_configs').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCgtInclusionRateConfigRepository.delete: ${error.message}`);
  }
}
