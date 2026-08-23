import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import type { ProvisionalPaymentSlot, ProvisionalTaxPeriod } from '@/types/provisionalTax';
import type { IProvisionalTaxPeriodRepository } from './IProvisionalTaxPeriodRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ProvisionalTaxPeriodRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  first_slot: ProvisionalPaymentSlot;
  second_slot: ProvisionalPaymentSlot;
  top_up_slot: ProvisionalPaymentSlot;
  created_at: string;
  updated_at: string;
}

function rowToProvisionalTaxPeriod(row: ProvisionalTaxPeriodRow): ProvisionalTaxPeriod {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    first: row.first_slot,
    second: row.second_slot,
    topUp: row.top_up_slot,
  };
}

function provisionalTaxPeriodToRow(entity: Partial<ProvisionalTaxPeriod>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.financialYearId !== undefined) row.financial_year_id = entity.financialYearId;
  if (entity.financialYearLabel !== undefined) row.financial_year_label = entity.financialYearLabel;
  if (entity.first !== undefined) row.first_slot = entity.first;
  if (entity.second !== undefined) row.second_slot = entity.second;
  if (entity.topUp !== undefined) row.top_up_slot = entity.topUp;
  return row;
}

/**
 * Supabase-backed IProvisionalTaxPeriodRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). `ProvisionalTaxPeriod` carries a real `companyId` field — taken
 * directly from the entity, same pattern as SupabaseTaxComputationRepository.
 */
export class SupabaseProvisionalTaxPeriodRepository implements IProvisionalTaxPeriodRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<ProvisionalTaxPeriod[]> {
    const { data, error } = await this.client.from('provisional_tax_periods').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseProvisionalTaxPeriodRepository.getAll: ${error.message}`);
    return (data as ProvisionalTaxPeriodRow[]).map(rowToProvisionalTaxPeriod);
  }

  async getById(id: ID): Promise<ProvisionalTaxPeriod | undefined> {
    const { data, error } = await this.client.from('provisional_tax_periods').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseProvisionalTaxPeriodRepository.getById: ${error.message}`);
    }
    return data ? rowToProvisionalTaxPeriod(data as ProvisionalTaxPeriodRow) : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<ProvisionalTaxPeriod | undefined> {
    const { data, error } = await this.client
      .from('provisional_tax_periods')
      .select('*')
      .eq('financial_year_id', financialYearId)
      .maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseProvisionalTaxPeriodRepository.getByFinancialYear: ${error.message}`);
    }
    return data ? rowToProvisionalTaxPeriod(data as ProvisionalTaxPeriodRow) : undefined;
  }

  async create(entity: ProvisionalTaxPeriod): Promise<ProvisionalTaxPeriod> {
    const { data, error } = await this.client.from('provisional_tax_periods').insert(provisionalTaxPeriodToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseProvisionalTaxPeriodRepository.create: ${error.message}`);
    return rowToProvisionalTaxPeriod(data as ProvisionalTaxPeriodRow);
  }

  async update(id: ID, patch: Partial<ProvisionalTaxPeriod>): Promise<ProvisionalTaxPeriod> {
    const { data, error } = await this.client
      .from('provisional_tax_periods')
      .update(provisionalTaxPeriodToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseProvisionalTaxPeriodRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseProvisionalTaxPeriodRepository: provisional tax period "${id}" not found`);
    return rowToProvisionalTaxPeriod(data as ProvisionalTaxPeriodRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('provisional_tax_periods').delete().eq('id', id);
    if (error) throw new Error(`SupabaseProvisionalTaxPeriodRepository.delete: ${error.message}`);
  }
}
