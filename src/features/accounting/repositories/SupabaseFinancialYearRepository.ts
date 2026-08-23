import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinancialYear, ID } from '@/types';
import type { IFinancialYearRepository } from './IFinancialYearRepository';

interface FinancialYearRow {
  id: string;
  company_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFinancialYear(row: FinancialYearRow): FinancialYear {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as FinancialYear['status'],
    closedAt: row.closed_at ?? undefined,
    closedBy: row.closed_by ?? undefined,
  };
}

function financialYearToRow(entity: Partial<FinancialYear>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.startDate !== undefined) row.start_date = entity.startDate;
  if (entity.endDate !== undefined) row.end_date = entity.endDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.closedAt !== undefined) row.closed_at = entity.closedAt;
  if (entity.closedBy !== undefined) row.closed_by = entity.closedBy;
  return row;
}

/** Supabase-backed IFinancialYearRepository (docs/SUPABASE_MIGRATION_GUIDE.md Phase B). */
export class SupabaseFinancialYearRepository implements IFinancialYearRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<FinancialYear[]> {
    const { data, error } = await this.client.from('financial_years').select('*').order('start_date', { ascending: true });
    if (error) throw new Error(`SupabaseFinancialYearRepository.getAll: ${error.message}`);
    return (data as FinancialYearRow[]).map(rowToFinancialYear);
  }

  async getById(id: ID): Promise<FinancialYear | undefined> {
    const { data, error } = await this.client.from('financial_years').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseFinancialYearRepository.getById: ${error.message}`);
    return data ? rowToFinancialYear(data as FinancialYearRow) : undefined;
  }

  async create(entity: FinancialYear): Promise<FinancialYear> {
    const { data, error } = await this.client.from('financial_years').insert(financialYearToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseFinancialYearRepository.create: ${error.message}`);
    return rowToFinancialYear(data as FinancialYearRow);
  }

  async update(id: ID, patch: Partial<FinancialYear>): Promise<FinancialYear> {
    const { data, error } = await this.client.from('financial_years').update(financialYearToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseFinancialYearRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseFinancialYearRepository: financial year "${id}" not found`);
    return rowToFinancialYear(data as FinancialYearRow);
  }
}
