import type { SupabaseClient } from '@supabase/supabase-js';
import type { CgtAnnualExclusionConfig, ID } from '@/types';
import type { ICgtAnnualExclusionConfigRepository } from './ICgtAnnualExclusionConfigRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface CgtAnnualExclusionConfigRow {
  id: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: CgtAnnualExclusionConfigRow): CgtAnnualExclusionConfig {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    amount: Number(row.amount),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    sourceReference: row.source_reference,
  };
}

function configToRow(entity: Partial<CgtAnnualExclusionConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.effectiveTo !== undefined) row.effective_to = entity.effectiveTo;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed ICgtAnnualExclusionConfigRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase F). Resolves "the" company
 * internally at create() time.
 */
export class SupabaseCgtAnnualExclusionConfigRepository implements ICgtAnnualExclusionConfigRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCgtAnnualExclusionConfigRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<CgtAnnualExclusionConfig[]> {
    const { data, error } = await this.client.from('cgt_annual_exclusion_configs').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseCgtAnnualExclusionConfigRepository.getAll: ${error.message}`);
    return (data as CgtAnnualExclusionConfigRow[]).map(rowToConfig);
  }

  async getById(id: ID): Promise<CgtAnnualExclusionConfig | undefined> {
    const { data, error } = await this.client.from('cgt_annual_exclusion_configs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCgtAnnualExclusionConfigRepository.getById: ${error.message}`);
    }
    return data ? rowToConfig(data as CgtAnnualExclusionConfigRow) : undefined;
  }

  async create(entity: CgtAnnualExclusionConfig): Promise<CgtAnnualExclusionConfig> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('cgt_annual_exclusion_configs')
      .insert({ ...configToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCgtAnnualExclusionConfigRepository.create: ${error.message}`);
    return rowToConfig(data as CgtAnnualExclusionConfigRow);
  }

  async update(id: ID, patch: Partial<CgtAnnualExclusionConfig>): Promise<CgtAnnualExclusionConfig> {
    const { data, error } = await this.client
      .from('cgt_annual_exclusion_configs')
      .update(configToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseCgtAnnualExclusionConfigRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCgtAnnualExclusionConfigRepository: config "${id}" not found`);
    return rowToConfig(data as CgtAnnualExclusionConfigRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('cgt_annual_exclusion_configs').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCgtAnnualExclusionConfigRepository.delete: ${error.message}`);
  }
}
