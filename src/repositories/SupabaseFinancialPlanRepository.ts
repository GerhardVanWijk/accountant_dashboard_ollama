import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinancialPlanLine, FinancialPlanType, ID } from '@/types';
import type { IFinancialPlanRepository } from './IFinancialPlanRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface FinancialPlanLineRow {
  id: string;
  plan_type: FinancialPlanType;
  account_id: string;
  period_year: number;
  period_month: number;
  amount: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLine(row: FinancialPlanLineRow): FinancialPlanLine {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planType: row.plan_type,
    accountId: row.account_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    amount: Number(row.amount),
    notes: row.notes ?? undefined,
  };
}

function lineToRow(entity: Partial<FinancialPlanLine>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.planType !== undefined) row.plan_type = entity.planType;
  if (entity.accountId !== undefined) row.account_id = entity.accountId;
  if (entity.periodYear !== undefined) row.period_year = entity.periodYear;
  if (entity.periodMonth !== undefined) row.period_month = entity.periodMonth;
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/** Supabase-backed IFinancialPlanRepository (Part 11, migration 0060). */
export class SupabaseFinancialPlanRepository implements IFinancialPlanRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseFinancialPlanRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<FinancialPlanLine[]> {
    const { data, error } = await this.client.from('financial_plan_lines').select('*');
    if (error) throw new Error(`SupabaseFinancialPlanRepository.getAll: ${error.message}`);
    return (data as FinancialPlanLineRow[]).map(rowToLine);
  }

  async getById(id: ID): Promise<FinancialPlanLine | undefined> {
    const { data, error } = await this.client.from('financial_plan_lines').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseFinancialPlanRepository.getById: ${error.message}`);
    }
    return data ? rowToLine(data as FinancialPlanLineRow) : undefined;
  }

  async getByPlanTypeAndYear(planType: FinancialPlanType, year: number): Promise<FinancialPlanLine[]> {
    const { data, error } = await this.client
      .from('financial_plan_lines')
      .select('*')
      .eq('plan_type', planType)
      .eq('period_year', year);
    if (error) throw new Error(`SupabaseFinancialPlanRepository.getByPlanTypeAndYear: ${error.message}`);
    return (data as FinancialPlanLineRow[]).map(rowToLine);
  }

  async create(entity: FinancialPlanLine): Promise<FinancialPlanLine> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('financial_plan_lines')
      .insert({ ...lineToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseFinancialPlanRepository.create: ${error.message}`);
    return rowToLine(data as FinancialPlanLineRow);
  }

  async update(id: ID, patch: Partial<FinancialPlanLine>): Promise<FinancialPlanLine> {
    const { data, error } = await this.client
      .from('financial_plan_lines')
      .update(lineToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseFinancialPlanRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseFinancialPlanRepository: plan line "${id}" not found`);
    return rowToLine(data as FinancialPlanLineRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('financial_plan_lines').delete().eq('id', id);
    if (error) throw new Error(`SupabaseFinancialPlanRepository.delete: ${error.message}`);
  }
}
