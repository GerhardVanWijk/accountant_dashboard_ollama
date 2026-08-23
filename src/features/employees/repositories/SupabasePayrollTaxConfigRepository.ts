import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, PayeBracket, PayrollTaxYearConfig } from '@/types';
import type { IPayrollTaxConfigRepository } from './IPayrollTaxConfigRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface PayrollTaxYearConfigRow {
  id: string;
  tax_year_label: string;
  tax_year_start: string;
  tax_year_end: string;
  pay_brackets: PayeBracket[];
  primary_rebate_annual: number;
  secondary_rebate_annual: number;
  tertiary_rebate_annual: number;
  uif_employee_rate_percent: number;
  uif_employer_rate_percent: number;
  uif_monthly_ceiling: number;
  sdl_rate_percent: number;
  sdl_annual_payroll_exemption_threshold: number;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToPayrollTaxYearConfig(row: PayrollTaxYearConfigRow): PayrollTaxYearConfig {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taxYearLabel: row.tax_year_label,
    taxYearStart: row.tax_year_start,
    taxYearEnd: row.tax_year_end,
    payeBrackets: row.pay_brackets ?? [],
    primaryRebateAnnual: Number(row.primary_rebate_annual),
    secondaryRebateAnnual: Number(row.secondary_rebate_annual),
    tertiaryRebateAnnual: Number(row.tertiary_rebate_annual),
    uifEmployeeRatePercent: Number(row.uif_employee_rate_percent),
    uifEmployerRatePercent: Number(row.uif_employer_rate_percent),
    uifMonthlyCeiling: Number(row.uif_monthly_ceiling),
    sdlRatePercent: Number(row.sdl_rate_percent),
    sdlAnnualPayrollExemptionThreshold: Number(row.sdl_annual_payroll_exemption_threshold),
    sourceReference: row.source_reference,
  };
}

function payrollTaxYearConfigToRow(entity: Partial<PayrollTaxYearConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.taxYearLabel !== undefined) row.tax_year_label = entity.taxYearLabel;
  if (entity.taxYearStart !== undefined) row.tax_year_start = entity.taxYearStart;
  if (entity.taxYearEnd !== undefined) row.tax_year_end = entity.taxYearEnd;
  if (entity.payeBrackets !== undefined) row.pay_brackets = entity.payeBrackets;
  if (entity.primaryRebateAnnual !== undefined) row.primary_rebate_annual = entity.primaryRebateAnnual;
  if (entity.secondaryRebateAnnual !== undefined) row.secondary_rebate_annual = entity.secondaryRebateAnnual;
  if (entity.tertiaryRebateAnnual !== undefined) row.tertiary_rebate_annual = entity.tertiaryRebateAnnual;
  if (entity.uifEmployeeRatePercent !== undefined) row.uif_employee_rate_percent = entity.uifEmployeeRatePercent;
  if (entity.uifEmployerRatePercent !== undefined) row.uif_employer_rate_percent = entity.uifEmployerRatePercent;
  if (entity.uifMonthlyCeiling !== undefined) row.uif_monthly_ceiling = entity.uifMonthlyCeiling;
  if (entity.sdlRatePercent !== undefined) row.sdl_rate_percent = entity.sdlRatePercent;
  if (entity.sdlAnnualPayrollExemptionThreshold !== undefined) row.sdl_annual_payroll_exemption_threshold = entity.sdlAnnualPayrollExemptionThreshold;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed IPayrollTaxConfigRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Resolves "the" company internally at create() time.
 */
export class SupabasePayrollTaxConfigRepository implements IPayrollTaxConfigRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabasePayrollTaxConfigRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<PayrollTaxYearConfig[]> {
    const { data, error } = await this.client.from('payroll_tax_year_configs').select('*').order('tax_year_start', { ascending: true });
    if (error) throw new Error(`SupabasePayrollTaxConfigRepository.getAll: ${error.message}`);
    return (data as PayrollTaxYearConfigRow[]).map(rowToPayrollTaxYearConfig);
  }

  async getById(id: ID): Promise<PayrollTaxYearConfig | undefined> {
    const { data, error } = await this.client.from('payroll_tax_year_configs').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabasePayrollTaxConfigRepository.getById: ${error.message}`);
    }
    return data ? rowToPayrollTaxYearConfig(data as PayrollTaxYearConfigRow) : undefined;
  }

  async create(entity: PayrollTaxYearConfig): Promise<PayrollTaxYearConfig> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('payroll_tax_year_configs')
      .insert({ ...payrollTaxYearConfigToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabasePayrollTaxConfigRepository.create: ${error.message}`);
    return rowToPayrollTaxYearConfig(data as PayrollTaxYearConfigRow);
  }

  async update(id: ID, patch: Partial<PayrollTaxYearConfig>): Promise<PayrollTaxYearConfig> {
    const { data, error } = await this.client
      .from('payroll_tax_year_configs')
      .update(payrollTaxYearConfigToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabasePayrollTaxConfigRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabasePayrollTaxConfigRepository: payroll tax config "${id}" not found`);
    return rowToPayrollTaxYearConfig(data as PayrollTaxYearConfigRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('payroll_tax_year_configs').delete().eq('id', id);
    if (error) throw new Error(`SupabasePayrollTaxConfigRepository.delete: ${error.message}`);
  }
}
