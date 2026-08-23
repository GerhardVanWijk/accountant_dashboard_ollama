import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, IncomeTaxYearConfig, SbcTaxBracket } from '@/types';
import type { IIncomeTaxConfigRepository } from './IIncomeTaxConfigRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface IncomeTaxYearConfigRow {
  id: string;
  tax_year_label: string;
  effective_from: string;
  effective_to: string;
  corporate_tax_rate_percent: number;
  sbc_brackets: SbcTaxBracket[];
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToIncomeTaxYearConfig(row: IncomeTaxYearConfigRow): IncomeTaxYearConfig {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taxYearLabel: row.tax_year_label,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    corporateTaxRatePercent: Number(row.corporate_tax_rate_percent),
    sbcBrackets: row.sbc_brackets ?? [],
    sourceReference: row.source_reference,
  };
}

function incomeTaxYearConfigToRow(entity: Partial<IncomeTaxYearConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.taxYearLabel !== undefined) row.tax_year_label = entity.taxYearLabel;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.effectiveTo !== undefined) row.effective_to = entity.effectiveTo;
  if (entity.corporateTaxRatePercent !== undefined) row.corporate_tax_rate_percent = entity.corporateTaxRatePercent;
  if (entity.sbcBrackets !== undefined) row.sbc_brackets = entity.sbcBrackets;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed IIncomeTaxConfigRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Resolves "the" company internally at create() time.
 */
export class SupabaseIncomeTaxConfigRepository implements IIncomeTaxConfigRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseIncomeTaxConfigRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<IncomeTaxYearConfig[]> {
    const { data, error } = await this.client.from('income_tax_year_configs').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseIncomeTaxConfigRepository.getAll: ${error.message}`);
    return (data as IncomeTaxYearConfigRow[]).map(rowToIncomeTaxYearConfig);
  }

  async getById(id: ID): Promise<IncomeTaxYearConfig | undefined> {
    const { data, error } = await this.client.from('income_tax_year_configs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseIncomeTaxConfigRepository.getById: ${error.message}`);
    }
    return data ? rowToIncomeTaxYearConfig(data as IncomeTaxYearConfigRow) : undefined;
  }

  async create(entity: IncomeTaxYearConfig): Promise<IncomeTaxYearConfig> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('income_tax_year_configs')
      .insert({ ...incomeTaxYearConfigToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseIncomeTaxConfigRepository.create: ${error.message}`);
    return rowToIncomeTaxYearConfig(data as IncomeTaxYearConfigRow);
  }

  async update(id: ID, patch: Partial<IncomeTaxYearConfig>): Promise<IncomeTaxYearConfig> {
    const { data, error } = await this.client
      .from('income_tax_year_configs')
      .update(incomeTaxYearConfigToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseIncomeTaxConfigRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseIncomeTaxConfigRepository: income tax config "${id}" not found`);
    return rowToIncomeTaxYearConfig(data as IncomeTaxYearConfigRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('income_tax_year_configs').delete().eq('id', id);
    if (error) throw new Error(`SupabaseIncomeTaxConfigRepository.delete: ${error.message}`);
  }
}
