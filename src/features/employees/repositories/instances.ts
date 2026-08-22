import { MockEmployeeRepository } from './MockEmployeeRepository';
import { MockPayrollRunRepository } from './MockPayrollRunRepository';
import { MockPayrollTaxConfigRepository } from './MockPayrollTaxConfigRepository';

/**
 * Single shared in-memory repository instances for the whole employees/
 * payroll feature — same "one source of truth per entity type for the
 * lifetime of the app session" rationale as
 * src/features/assets/repositories/instances.ts.
 */
export const employeeRepository = new MockEmployeeRepository();
export const payrollRunRepository = new MockPayrollRunRepository();
export const payrollTaxConfigRepository = new MockPayrollTaxConfigRepository();
