import type { SupabaseClient } from '@supabase/supabase-js';
import type { DividendsWithholdingTaxRateConfig, ID } from '@/types';
import type { IDividendsWithholdingTaxConfigRepository } from './IDividendsWithholdingTaxConfigRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface DividendsWithholdingTaxConfigRow {
  id: string;
  rate_percent: number;
  effective_from: string;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: DividendsWithholdingTaxConfigRow): DividendsWithholdingTaxRateConfig {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ratePercent: Number(row.rate_percent),
    effectiveFrom: row.effective_from,
    sourceReference: row.source_reference,
  };
}

function configToRow(entity: Partial<DividendsWithholdingTaxRateConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.ratePercent !== undefined) row.rate_percent = entity.ratePercent;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed IDividendsWithholdingTaxConfigRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase F). Resolves "the" company
 * internally at create() time.
 */
export class SupabaseDividendsWithholdingTaxConfigRepository implements IDividendsWithholdingTaxConfigRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseDividendsWithholdingTaxConfigRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<DividendsWithholdingTaxRateConfig[]> {
    const { data, error } = await this.client.from('dividends_withholding_tax_configs').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository.getAll: ${error.message}`);
    return (data as DividendsWithholdingTaxConfigRow[]).map(rowToConfig);
  }

  async getById(id: ID): Promise<DividendsWithholdingTaxRateConfig | undefined> {
    const { data, error } = await this.client.from('dividends_withholding_tax_configs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository.getById: ${error.message}`);
    }
    return data ? rowToConfig(data as DividendsWithholdingTaxConfigRow) : undefined;
  }

  async create(entity: DividendsWithholdingTaxRateConfig): Promise<DividendsWithholdingTaxRateConfig> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('dividends_withholding_tax_configs')
      .insert({ ...configToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository.create: ${error.message}`);
    return rowToConfig(data as DividendsWithholdingTaxConfigRow);
  }

  async update(id: ID, patch: Partial<DividendsWithholdingTaxRateConfig>): Promise<DividendsWithholdingTaxRateConfig> {
    const { data, error } = await this.client
      .from('dividends_withholding_tax_configs')
      .update(configToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository: config "${id}" not found`);
    return rowToConfig(data as DividendsWithholdingTaxConfigRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('dividends_withholding_tax_configs').delete().eq('id', id);
    if (error) throw new Error(`SupabaseDividendsWithholdingTaxConfigRepository.delete: ${error.message}`);
  }
}
