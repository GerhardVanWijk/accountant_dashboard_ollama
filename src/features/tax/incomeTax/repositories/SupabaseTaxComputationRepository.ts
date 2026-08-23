import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, TaxAdjustment, TaxComputation } from '@/types';
import type { ITaxComputationRepository } from './ITaxComputationRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface TaxComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  status: string;
  accounting_profit: number;
  is_sbc_eligible: boolean;
  adjustments: TaxAdjustment[];
  taxable_income: number;
  tax_config_id: string;
  tax_config_tax_year_label: string;
  tax_liability: number;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTaxComputation(row: TaxComputationRow): TaxComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    status: row.status as TaxComputation['status'],
    accountingProfit: Number(row.accounting_profit),
    isSbcEligible: row.is_sbc_eligible,
    adjustments: row.adjustments ?? [],
    taxableIncome: Number(row.taxable_income),
    taxConfigId: row.tax_config_id,
    taxConfigTaxYearLabel: row.tax_config_tax_year_label,
    taxLiability: Number(row.tax_liability),
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

function taxComputationToRow(entity: Partial<TaxComputation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.financialYearId !== undefined) row.financial_year_id = entity.financialYearId;
  if (entity.financialYearLabel !== undefined) row.financial_year_label = entity.financialYearLabel;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.accountingProfit !== undefined) row.accounting_profit = entity.accountingProfit;
  if (entity.isSbcEligible !== undefined) row.is_sbc_eligible = entity.isSbcEligible;
  if (entity.adjustments !== undefined) row.adjustments = entity.adjustments;
  if (entity.taxableIncome !== undefined) row.taxable_income = entity.taxableIncome;
  if (entity.taxConfigId !== undefined) row.tax_config_id = entity.taxConfigId;
  if (entity.taxConfigTaxYearLabel !== undefined) row.tax_config_tax_year_label = entity.taxConfigTaxYearLabel;
  if (entity.taxLiability !== undefined) row.tax_liability = entity.taxLiability;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.postedAt !== undefined) row.posted_at = entity.postedAt;
  if (entity.postedByUserId !== undefined) row.posted_by_user_id = entity.postedByUserId;
  return row;
}

/**
 * Supabase-backed ITaxComputationRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Unlike most Phase B-E repositories, `TaxComputation` carries a
 * real `companyId` field (like `FinancialYear`/`AccountingPeriod`, Phase B)
 * — taken directly from the entity, no internal resolveDefaultCompanyId().
 */
export class SupabaseTaxComputationRepository implements ITaxComputationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<TaxComputation[]> {
    const { data, error } = await this.client.from('tax_computations').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseTaxComputationRepository.getAll: ${error.message}`);
    return (data as TaxComputationRow[]).map(rowToTaxComputation);
  }

  async getById(id: ID): Promise<TaxComputation | undefined> {
    const { data, error } = await this.client.from('tax_computations').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseTaxComputationRepository.getById: ${error.message}`);
    }
    return data ? rowToTaxComputation(data as TaxComputationRow) : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<TaxComputation | undefined> {
    const { data, error } = await this.client.from('tax_computations').select('*').eq('financial_year_id', financialYearId).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseTaxComputationRepository.getByFinancialYear: ${error.message}`);
    }
    return data ? rowToTaxComputation(data as TaxComputationRow) : undefined;
  }

  async create(entity: TaxComputation): Promise<TaxComputation> {
    const { data, error } = await this.client.from('tax_computations').insert(taxComputationToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseTaxComputationRepository.create: ${error.message}`);
    return rowToTaxComputation(data as TaxComputationRow);
  }

  async update(id: ID, patch: Partial<TaxComputation>): Promise<TaxComputation> {
    const { data, error } = await this.client.from('tax_computations').update(taxComputationToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseTaxComputationRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseTaxComputationRepository: tax computation "${id}" not found`);
    return rowToTaxComputation(data as TaxComputationRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('tax_computations').delete().eq('id', id);
    if (error) throw new Error(`SupabaseTaxComputationRepository.delete: ${error.message}`);
  }
}
