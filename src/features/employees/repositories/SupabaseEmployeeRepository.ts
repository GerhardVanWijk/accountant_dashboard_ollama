import type { SupabaseClient } from '@supabase/supabase-js';
import type { Employee, EmployeeAllowance, EmployeeDeduction, ID } from '@/types';
import type { IEmployeeRepository } from './IEmployeeRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface EmployeeRow {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  id_number: string | null;
  tax_number: string | null;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  employment_type: string;
  pay_frequency: string;
  status: string;
  start_date: string;
  termination_date: string | null;
  basic_salary: number;
  standard_allowances: EmployeeAllowance[];
  standard_deductions: EmployeeDeduction[];
  bank_name: string | null;
  bank_account_number: string | null;
  uif_exempt: boolean;
  currency: string;
  created_at: string;
  updated_at: string;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    idNumber: row.id_number ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    employmentType: row.employment_type as Employee['employmentType'],
    payFrequency: row.pay_frequency as Employee['payFrequency'],
    status: row.status as Employee['status'],
    startDate: row.start_date,
    terminationDate: row.termination_date ?? undefined,
    basicSalary: Number(row.basic_salary),
    standardAllowances: row.standard_allowances ?? [],
    standardDeductions: row.standard_deductions ?? [],
    bankName: row.bank_name ?? undefined,
    bankAccountNumber: row.bank_account_number ?? undefined,
    uifExempt: row.uif_exempt,
    currency: row.currency,
  };
}

function employeeToRow(entity: Partial<Employee>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.employeeNumber !== undefined) row.employee_number = entity.employeeNumber;
  if (entity.firstName !== undefined) row.first_name = entity.firstName;
  if (entity.lastName !== undefined) row.last_name = entity.lastName;
  if (entity.idNumber !== undefined) row.id_number = entity.idNumber;
  if (entity.taxNumber !== undefined) row.tax_number = entity.taxNumber;
  if (entity.dateOfBirth !== undefined) row.date_of_birth = entity.dateOfBirth;
  if (entity.email !== undefined) row.email = entity.email;
  if (entity.phone !== undefined) row.phone = entity.phone;
  if (entity.employmentType !== undefined) row.employment_type = entity.employmentType;
  if (entity.payFrequency !== undefined) row.pay_frequency = entity.payFrequency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.startDate !== undefined) row.start_date = entity.startDate;
  if (entity.terminationDate !== undefined) row.termination_date = entity.terminationDate;
  if (entity.basicSalary !== undefined) row.basic_salary = entity.basicSalary;
  if (entity.standardAllowances !== undefined) row.standard_allowances = entity.standardAllowances;
  if (entity.standardDeductions !== undefined) row.standard_deductions = entity.standardDeductions;
  if (entity.bankName !== undefined) row.bank_name = entity.bankName;
  if (entity.bankAccountNumber !== undefined) row.bank_account_number = entity.bankAccountNumber;
  if (entity.uifExempt !== undefined) row.uif_exempt = entity.uifExempt;
  if (entity.currency !== undefined) row.currency = entity.currency;
  return row;
}

/**
 * Supabase-backed IEmployeeRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository. Payroll runs and
 * payroll tax config (the transactional/computed side, as opposed to this
 * master record) stay Mock — Phase F's scope, not this one.
 */
export class SupabaseEmployeeRepository implements IEmployeeRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseEmployeeRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Employee[]> {
    const { data, error } = await this.client.from('employees').select('*').order('employee_number', { ascending: true });
    if (error) throw new Error(`SupabaseEmployeeRepository.getAll: ${error.message}`);
    return (data as EmployeeRow[]).map(rowToEmployee);
  }

  async getById(id: ID): Promise<Employee | undefined> {
    const { data, error } = await this.client.from('employees').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseEmployeeRepository.getById: ${error.message}`);
    }
    return data ? rowToEmployee(data as EmployeeRow) : undefined;
  }

  async create(entity: Employee): Promise<Employee> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('employees')
      .insert({ ...employeeToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseEmployeeRepository.create: ${error.message}`);
    return rowToEmployee(data as EmployeeRow);
  }

  async update(id: ID, patch: Partial<Employee>): Promise<Employee> {
    const { data, error } = await this.client.from('employees').update(employeeToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseEmployeeRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseEmployeeRepository: employee "${id}" not found`);
    return rowToEmployee(data as EmployeeRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('employees').delete().eq('id', id);
    if (error) throw new Error(`SupabaseEmployeeRepository.delete: ${error.message}`);
  }
}
