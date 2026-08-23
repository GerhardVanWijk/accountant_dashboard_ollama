import type { SupabaseClient } from '@supabase/supabase-js';
import type { FixedAsset, ID } from '@/types';
import type { IFixedAssetRepository } from './IFixedAssetRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface FixedAssetRow {
  id: string;
  asset_number: string;
  name: string;
  description: string | null;
  category: string;
  acquisition_date: string;
  cost: number;
  residual_value: number;
  useful_life_years: number;
  depreciation_method: string;
  reducing_balance_rate_percent: number | null;
  gl_asset_account_id: string;
  gl_accumulated_depreciation_account_id: string;
  gl_depreciation_expense_account_id: string;
  accumulated_depreciation: number;
  status: string;
  journal_entry_id: string | null;
  source_bill_id: string | null;
  tax_wear_tear_rate_percent: number | null;
  tax_wear_tear_rate_source: string | null;
  disposal_date: string | null;
  disposal_proceeds: number | null;
  disposal_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFixedAsset(row: FixedAssetRow): FixedAsset {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetNumber: row.asset_number,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category as FixedAsset['category'],
    acquisitionDate: row.acquisition_date,
    cost: Number(row.cost),
    residualValue: Number(row.residual_value),
    usefulLifeYears: Number(row.useful_life_years),
    depreciationMethod: row.depreciation_method as FixedAsset['depreciationMethod'],
    reducingBalanceRatePercent: row.reducing_balance_rate_percent === null ? undefined : Number(row.reducing_balance_rate_percent),
    glAssetAccountId: row.gl_asset_account_id,
    glAccumulatedDepreciationAccountId: row.gl_accumulated_depreciation_account_id,
    glDepreciationExpenseAccountId: row.gl_depreciation_expense_account_id,
    accumulatedDepreciation: Number(row.accumulated_depreciation),
    status: row.status as FixedAsset['status'],
    journalEntryId: row.journal_entry_id ?? undefined,
    sourceBillId: row.source_bill_id ?? undefined,
    taxWearTearRatePercent: row.tax_wear_tear_rate_percent === null ? undefined : Number(row.tax_wear_tear_rate_percent),
    taxWearTearRateSource: row.tax_wear_tear_rate_source ?? undefined,
    disposalDate: row.disposal_date ?? undefined,
    disposalProceeds: row.disposal_proceeds === null ? undefined : Number(row.disposal_proceeds),
    disposalJournalEntryId: row.disposal_journal_entry_id ?? undefined,
  };
}

function fixedAssetToRow(entity: Partial<FixedAsset>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.assetNumber !== undefined) row.asset_number = entity.assetNumber;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.category !== undefined) row.category = entity.category;
  if (entity.acquisitionDate !== undefined) row.acquisition_date = entity.acquisitionDate;
  if (entity.cost !== undefined) row.cost = entity.cost;
  if (entity.residualValue !== undefined) row.residual_value = entity.residualValue;
  if (entity.usefulLifeYears !== undefined) row.useful_life_years = entity.usefulLifeYears;
  if (entity.depreciationMethod !== undefined) row.depreciation_method = entity.depreciationMethod;
  if (entity.reducingBalanceRatePercent !== undefined) row.reducing_balance_rate_percent = entity.reducingBalanceRatePercent;
  if (entity.glAssetAccountId !== undefined) row.gl_asset_account_id = entity.glAssetAccountId;
  if (entity.glAccumulatedDepreciationAccountId !== undefined) row.gl_accumulated_depreciation_account_id = entity.glAccumulatedDepreciationAccountId;
  if (entity.glDepreciationExpenseAccountId !== undefined) row.gl_depreciation_expense_account_id = entity.glDepreciationExpenseAccountId;
  if (entity.accumulatedDepreciation !== undefined) row.accumulated_depreciation = entity.accumulatedDepreciation;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.sourceBillId !== undefined) row.source_bill_id = entity.sourceBillId;
  if (entity.taxWearTearRatePercent !== undefined) row.tax_wear_tear_rate_percent = entity.taxWearTearRatePercent;
  if (entity.taxWearTearRateSource !== undefined) row.tax_wear_tear_rate_source = entity.taxWearTearRateSource;
  if (entity.disposalDate !== undefined) row.disposal_date = entity.disposalDate;
  if (entity.disposalProceeds !== undefined) row.disposal_proceeds = entity.disposalProceeds;
  if (entity.disposalJournalEntryId !== undefined) row.disposal_journal_entry_id = entity.disposalJournalEntryId;
  return row;
}

/**
 * Supabase-backed IFixedAssetRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Resolves "the" company internally at create() time — FixedAsset
 * has no companyId field, same single-tenant pattern as SupabaseAccountRepository.
 */
export class SupabaseFixedAssetRepository implements IFixedAssetRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseFixedAssetRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<FixedAsset[]> {
    const { data, error } = await this.client.from('fixed_assets').select('*').order('asset_number', { ascending: true });
    if (error) throw new Error(`SupabaseFixedAssetRepository.getAll: ${error.message}`);
    return (data as FixedAssetRow[]).map(rowToFixedAsset);
  }

  async getById(id: ID): Promise<FixedAsset | undefined> {
    const { data, error } = await this.client.from('fixed_assets').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseFixedAssetRepository.getById: ${error.message}`);
    }
    return data ? rowToFixedAsset(data as FixedAssetRow) : undefined;
  }

  async create(entity: FixedAsset): Promise<FixedAsset> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('fixed_assets')
      .insert({ ...fixedAssetToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseFixedAssetRepository.create: ${error.message}`);
    return rowToFixedAsset(data as FixedAssetRow);
  }

  async update(id: ID, patch: Partial<FixedAsset>): Promise<FixedAsset> {
    const { data, error } = await this.client.from('fixed_assets').update(fixedAssetToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseFixedAssetRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseFixedAssetRepository: fixed asset "${id}" not found`);
    return rowToFixedAsset(data as FixedAssetRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('fixed_assets').delete().eq('id', id);
    if (error) throw new Error(`SupabaseFixedAssetRepository.delete: ${error.message}`);
  }
}
