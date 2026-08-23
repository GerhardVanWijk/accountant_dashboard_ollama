import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountingPeriod, ID } from '@/types';
import type { IAccountingPeriodRepository } from './IAccountingPeriodRepository';

interface AccountingPeriodRow {
  id: string;
  company_id: string;
  financial_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToAccountingPeriod(row: AccountingPeriodRow): AccountingPeriod {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyId: row.company_id,
    financialYearId: row.financial_year_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as AccountingPeriod['status'],
  };
}

function accountingPeriodToRow(entity: Partial<AccountingPeriod>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.companyId !== undefined) row.company_id = entity.companyId;
  if (entity.financialYearId !== undefined) row.financial_year_id = entity.financialYearId;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.startDate !== undefined) row.start_date = entity.startDate;
  if (entity.endDate !== undefined) row.end_date = entity.endDate;
  if (entity.status !== undefined) row.status = entity.status;
  return row;
}

/** Supabase-backed IAccountingPeriodRepository (docs/SUPABASE_MIGRATION_GUIDE.md Phase B). */
export class SupabaseAccountingPeriodRepository implements IAccountingPeriodRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<AccountingPeriod[]> {
    const { data, error } = await this.client.from('accounting_periods').select('*').order('start_date', { ascending: true });
    if (error) throw new Error(`SupabaseAccountingPeriodRepository.getAll: ${error.message}`);
    return (data as AccountingPeriodRow[]).map(rowToAccountingPeriod);
  }

  async getById(id: ID): Promise<AccountingPeriod | undefined> {
    const { data, error } = await this.client.from('accounting_periods').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseAccountingPeriodRepository.getById: ${error.message}`);
    return data ? rowToAccountingPeriod(data as AccountingPeriodRow) : undefined;
  }

  async create(entity: AccountingPeriod): Promise<AccountingPeriod> {
    const { data, error } = await this.client.from('accounting_periods').insert(accountingPeriodToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseAccountingPeriodRepository.create: ${error.message}`);
    return rowToAccountingPeriod(data as AccountingPeriodRow);
  }

  async update(id: ID, patch: Partial<AccountingPeriod>): Promise<AccountingPeriod> {
    const { data, error } = await this.client
      .from('accounting_periods')
      .update(accountingPeriodToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseAccountingPeriodRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseAccountingPeriodRepository: accounting period "${id}" not found`);
    return rowToAccountingPeriod(data as AccountingPeriodRow);
  }
}
