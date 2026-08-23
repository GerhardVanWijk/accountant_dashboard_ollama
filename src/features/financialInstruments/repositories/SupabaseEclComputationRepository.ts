import type { SupabaseClient } from '@supabase/supabase-js';
import type { EclBucketLine, EclComputation, ID } from '@/types';
import type { IEclComputationRepository } from './IEclComputationRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface EclComputationRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  financial_year_label: string;
  as_of_date: string;
  status: string;
  buckets: EclBucketLine[];
  total_gross_receivable: number;
  total_expected_credit_loss: number;
  prior_total_expected_credit_loss: number | null;
  movement_amount: number | null;
  journal_entry_id: string | null;
  posted_at: string | null;
  posted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEclComputation(row: EclComputationRow): EclComputation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    asOfDate: row.as_of_date,
    status: row.status as EclComputation['status'],
    buckets: row.buckets ?? [],
    totalGrossReceivable: Number(row.total_gross_receivable),
    totalExpectedCreditLoss: Number(row.total_expected_credit_loss),
    priorTotalExpectedCreditLoss: row.prior_total_expected_credit_loss === null ? undefined : Number(row.prior_total_expected_credit_loss),
    movementAmount: row.movement_amount === null ? undefined : Number(row.movement_amount),
    journalEntryId: row.journal_entry_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedByUserId: row.posted_by_user_id ?? undefined,
  };
}

function eclComputationToRow(entity: Partial<EclComputation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.financialYearId !== undefined) row.financial_year_id = entity.financialYearId;
  if (entity.financialYearLabel !== undefined) row.financial_year_label = entity.financialYearLabel;
  if (entity.asOfDate !== undefined) row.as_of_date = entity.asOfDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.buckets !== undefined) row.buckets = entity.buckets;
  if (entity.totalGrossReceivable !== undefined) row.total_gross_receivable = entity.totalGrossReceivable;
  if (entity.totalExpectedCreditLoss !== undefined) row.total_expected_credit_loss = entity.totalExpectedCreditLoss;
  if (entity.priorTotalExpectedCreditLoss !== undefined) row.prior_total_expected_credit_loss = entity.priorTotalExpectedCreditLoss;
  if (entity.movementAmount !== undefined) row.movement_amount = entity.movementAmount;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.postedAt !== undefined) row.posted_at = entity.postedAt;
  if (entity.postedByUserId !== undefined) row.posted_by_user_id = entity.postedByUserId;
  return row;
}

/**
 * Supabase-backed IEclComputationRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). `EclComputation` carries a real `companyId` field — taken
 * directly from the entity.
 */
export class SupabaseEclComputationRepository implements IEclComputationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<EclComputation[]> {
    const { data, error } = await this.client.from('ecl_computations').select('*').order('as_of_date', { ascending: true });
    if (error) throw new Error(`SupabaseEclComputationRepository.getAll: ${error.message}`);
    return (data as EclComputationRow[]).map(rowToEclComputation);
  }

  async getById(id: ID): Promise<EclComputation | undefined> {
    const { data, error } = await this.client.from('ecl_computations').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseEclComputationRepository.getById: ${error.message}`);
    }
    return data ? rowToEclComputation(data as EclComputationRow) : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<EclComputation | undefined> {
    const { data, error } = await this.client.from('ecl_computations').select('*').eq('financial_year_id', financialYearId).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseEclComputationRepository.getByFinancialYear: ${error.message}`);
    }
    return data ? rowToEclComputation(data as EclComputationRow) : undefined;
  }

  async getByCompany(companyId: ID): Promise<EclComputation[]> {
    const { data, error } = await this.client.from('ecl_computations').select('*').eq('company_id', companyId).order('as_of_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseEclComputationRepository.getByCompany: ${error.message}`);
    }
    return (data as EclComputationRow[]).map(rowToEclComputation);
  }

  async create(entity: EclComputation): Promise<EclComputation> {
    const { data, error } = await this.client.from('ecl_computations').insert(eclComputationToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseEclComputationRepository.create: ${error.message}`);
    return rowToEclComputation(data as EclComputationRow);
  }

  async update(id: ID, patch: Partial<EclComputation>): Promise<EclComputation> {
    const { data, error } = await this.client.from('ecl_computations').update(eclComputationToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseEclComputationRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseEclComputationRepository: ECL computation "${id}" not found`);
    return rowToEclComputation(data as EclComputationRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('ecl_computations').delete().eq('id', id);
    if (error) throw new Error(`SupabaseEclComputationRepository.delete: ${error.message}`);
  }
}
