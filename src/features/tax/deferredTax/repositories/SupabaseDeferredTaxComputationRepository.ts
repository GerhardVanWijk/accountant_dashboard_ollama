import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeferredTaxComputation, DeferredTaxTemporaryDifference, ID } from '@/types';
import type { IDeferredTaxComputationRepository } from './IDeferredTaxComputationRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface DeferredTaxComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  as_of_date: string;
  status: string;
  tax_rate_percent: number;
  tax_config_id: string;
  tax_config_tax_year_label: string;
  items: DeferredTaxTemporaryDifference[];
  total_deferred_tax_liability: number;
  total_deferred_tax_asset: number;
  net_deferred_tax_liability: number;
  prior_net_deferred_tax_liability: number | null;
  movement_amount: number | null;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDeferredTaxComputation(row: DeferredTaxComputationRow): DeferredTaxComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    asOfDate: row.as_of_date,
    status: row.status as DeferredTaxComputation['status'],
    taxRatePercent: Number(row.tax_rate_percent),
    taxConfigId: row.tax_config_id,
    taxConfigTaxYearLabel: row.tax_config_tax_year_label,
    items: row.items ?? [],
    totalDeferredTaxLiability: Number(row.total_deferred_tax_liability),
    totalDeferredTaxAsset: Number(row.total_deferred_tax_asset),
    netDeferredTaxLiability: Number(row.net_deferred_tax_liability),
    priorNetDeferredTaxLiability: row.prior_net_deferred_tax_liability === null ? undefined : Number(row.prior_net_deferred_tax_liability),
    movementAmount: row.movement_amount === null ? undefined : Number(row.movement_amount),
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

function deferredTaxComputationToRow(entity: Partial<DeferredTaxComputation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.financialYearId !== undefined) row.financial_year_id = entity.financialYearId;
  if (entity.financialYearLabel !== undefined) row.financial_year_label = entity.financialYearLabel;
  if (entity.asOfDate !== undefined) row.as_of_date = entity.asOfDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.taxRatePercent !== undefined) row.tax_rate_percent = entity.taxRatePercent;
  if (entity.taxConfigId !== undefined) row.tax_config_id = entity.taxConfigId;
  if (entity.taxConfigTaxYearLabel !== undefined) row.tax_config_tax_year_label = entity.taxConfigTaxYearLabel;
  if (entity.items !== undefined) row.items = entity.items;
  if (entity.totalDeferredTaxLiability !== undefined) row.total_deferred_tax_liability = entity.totalDeferredTaxLiability;
  if (entity.totalDeferredTaxAsset !== undefined) row.total_deferred_tax_asset = entity.totalDeferredTaxAsset;
  if (entity.netDeferredTaxLiability !== undefined) row.net_deferred_tax_liability = entity.netDeferredTaxLiability;
  if (entity.priorNetDeferredTaxLiability !== undefined) row.prior_net_deferred_tax_liability = entity.priorNetDeferredTaxLiability;
  if (entity.movementAmount !== undefined) row.movement_amount = entity.movementAmount;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.postedAt !== undefined) row.posted_at = entity.postedAt;
  if (entity.postedByUserId !== undefined) row.posted_by_user_id = entity.postedByUserId;
  return row;
}

/**
 * Supabase-backed IDeferredTaxComputationRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase F). `DeferredTaxComputation`
 * carries a real `companyId` field — taken directly from the entity.
 */
export class SupabaseDeferredTaxComputationRepository implements IDeferredTaxComputationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<DeferredTaxComputation[]> {
    const { data, error } = await this.client.from('deferred_tax_computations').select('*').order('as_of_date', { ascending: true });
    if (error) throw new Error(`SupabaseDeferredTaxComputationRepository.getAll: ${error.message}`);
    return (data as DeferredTaxComputationRow[]).map(rowToDeferredTaxComputation);
  }

  async getById(id: ID): Promise<DeferredTaxComputation | undefined> {
    const { data, error } = await this.client.from('deferred_tax_computations').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDeferredTaxComputationRepository.getById: ${error.message}`);
    }
    return data ? rowToDeferredTaxComputation(data as DeferredTaxComputationRow) : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<DeferredTaxComputation | undefined> {
    const { data, error } = await this.client
      .from('deferred_tax_computations')
      .select('*')
      .eq('financial_year_id', financialYearId)
      .maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDeferredTaxComputationRepository.getByFinancialYear: ${error.message}`);
    }
    return data ? rowToDeferredTaxComputation(data as DeferredTaxComputationRow) : undefined;
  }

  async getByCompany(companyId: ID): Promise<DeferredTaxComputation[]> {
    const { data, error } = await this.client
      .from('deferred_tax_computations')
      .select('*')
      .eq('company_id', companyId)
      .order('as_of_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseDeferredTaxComputationRepository.getByCompany: ${error.message}`);
    }
    return (data as DeferredTaxComputationRow[]).map(rowToDeferredTaxComputation);
  }

  async create(entity: DeferredTaxComputation): Promise<DeferredTaxComputation> {
    const { data, error } = await this.client.from('deferred_tax_computations').insert(deferredTaxComputationToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseDeferredTaxComputationRepository.create: ${error.message}`);
    return rowToDeferredTaxComputation(data as DeferredTaxComputationRow);
  }

  async update(id: ID, patch: Partial<DeferredTaxComputation>): Promise<DeferredTaxComputation> {
    const { data, error } = await this.client
      .from('deferred_tax_computations')
      .update(deferredTaxComputationToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseDeferredTaxComputationRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseDeferredTaxComputationRepository: deferred tax computation "${id}" not found`);
    return rowToDeferredTaxComputation(data as DeferredTaxComputationRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('deferred_tax_computations').delete().eq('id', id);
    if (error) throw new Error(`SupabaseDeferredTaxComputationRepository.delete: ${error.message}`);
  }
}
