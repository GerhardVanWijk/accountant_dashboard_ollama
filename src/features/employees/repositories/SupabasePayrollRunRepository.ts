import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, PayrollRun, PayslipLine } from '@/types';
import type { IPayrollRunRepository } from './IPayrollRunRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface PayrollRunRow {
  id: string;
  run_number: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
  payslips: PayslipLine[];
  journal_entry_id: string | null;
  contra_account_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPayrollRun(row: PayrollRunRow): PayrollRun {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runNumber: row.run_number,
    payPeriodStart: row.pay_period_start,
    payPeriodEnd: row.pay_period_end,
    payDate: row.pay_date,
    status: row.status as PayrollRun['status'],
    payslips: row.payslips ?? [],
    journalEntryId: row.journal_entry_id ?? undefined,
    contraAccountId: row.contra_account_id ?? undefined,
  };
}

function payrollRunToRow(entity: Partial<PayrollRun>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.runNumber !== undefined) row.run_number = entity.runNumber;
  if (entity.payPeriodStart !== undefined) row.pay_period_start = entity.payPeriodStart;
  if (entity.payPeriodEnd !== undefined) row.pay_period_end = entity.payPeriodEnd;
  if (entity.payDate !== undefined) row.pay_date = entity.payDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.payslips !== undefined) row.payslips = entity.payslips;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.contraAccountId !== undefined) row.contra_account_id = entity.contraAccountId;
  return row;
}

/**
 * Supabase-backed IPayrollRunRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Resolves "the" company internally at create() time — PayrollRun
 * has no companyId field.
 */
export class SupabasePayrollRunRepository implements IPayrollRunRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabasePayrollRunRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<PayrollRun[]> {
    const { data, error } = await this.client.from('payroll_runs').select('*').order('pay_date', { ascending: true });
    if (error) throw new Error(`SupabasePayrollRunRepository.getAll: ${error.message}`);
    return (data as PayrollRunRow[]).map(rowToPayrollRun);
  }

  async getById(id: ID): Promise<PayrollRun | undefined> {
    const { data, error } = await this.client.from('payroll_runs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabasePayrollRunRepository.getById: ${error.message}`);
    }
    return data ? rowToPayrollRun(data as PayrollRunRow) : undefined;
  }

  async create(entity: PayrollRun): Promise<PayrollRun> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('payroll_runs')
      .insert({ ...payrollRunToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabasePayrollRunRepository.create: ${error.message}`);
    return rowToPayrollRun(data as PayrollRunRow);
  }

  async update(id: ID, patch: Partial<PayrollRun>): Promise<PayrollRun> {
    const { data, error } = await this.client.from('payroll_runs').update(payrollRunToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabasePayrollRunRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabasePayrollRunRepository: payroll run "${id}" not found`);
    return rowToPayrollRun(data as PayrollRunRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('payroll_runs').delete().eq('id', id);
    if (error) throw new Error(`SupabasePayrollRunRepository.delete: ${error.message}`);
  }
}
