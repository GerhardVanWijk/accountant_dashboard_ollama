import { SupabaseEmployeeRepository } from './SupabaseEmployeeRepository';
import { SupabasePayrollRunRepository } from './SupabasePayrollRunRepository';
import { SupabasePayrollTaxConfigRepository } from './SupabasePayrollTaxConfigRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole employees/payroll
 * feature — same "one source of truth per entity type for the lifetime of
 * the app session" rationale as src/features/assets/repositories/instances.ts.
 * `employeeRepository` Supabase-backed since Phase D; `payrollRunRepository`/
 * `payrollTaxConfigRepository` Supabase-backed as of
 * docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const employeeRepository = new SupabaseEmployeeRepository(supabase);
export const payrollRunRepository = new SupabasePayrollRunRepository(supabase);
export const payrollTaxConfigRepository = new SupabasePayrollTaxConfigRepository(supabase);
