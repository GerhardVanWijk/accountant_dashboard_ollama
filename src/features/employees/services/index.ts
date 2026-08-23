import { EmployeeService } from './employeeService';
import { PayrollTaxConfigService } from './payrollTaxConfigService';
import { PayrollRunService } from './payrollRunService';
import { employeeRepository, payrollRunRepository, payrollTaxConfigRepository } from '../repositories/instances';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';

export type { CreateEmployeeDTO, UpdateEmployeeDTO } from './employeeService';
export type { CreatePayrollTaxYearConfigDTO } from './payrollTaxConfigService';
export type { PayslipOverrideInput } from './payrollCalculations';
export {
  calculateAge,
  calculateAnnualPaye,
  calculatePeriodPaye,
  calculateSdl,
  calculateUifEmployee,
  calculateUifEmployer,
  computePayslipLine,
  periodsPerYear,
} from './payrollCalculations';
export type { Emp201Report, PayrollControlAccountCheck, PayrollReconciliation } from './emp201Service';
export { computeEmp201Report, reconcilePayrollLiabilities } from './emp201Service';
export type { Emp501MonthRow, Emp501Report } from './emp501Service';
export { computeEmp501Report } from './emp501Service';
export { EmployeeService } from './employeeService';
export { PayrollTaxConfigService } from './payrollTaxConfigService';
export { PayrollRunService } from './payrollRunService';

/**
 * Wires the services to their shared mock repositories and the real GL
 * posting engine (journalEntryService) — the same singleton every other
 * posting module uses, so a payroll run is immediately visible in the
 * trial balance and subject to accountingPeriodService's period-open rule.
 * Hooks depend on these singletons instead of importing repositories
 * directly.
 */
export const payrollTaxConfigService = new PayrollTaxConfigService(payrollTaxConfigRepository);
export const employeeService = new EmployeeService(employeeRepository, payrollRunRepository);
export const payrollRunService = new PayrollRunService(
  payrollRunRepository,
  employeeService,
  payrollTaxConfigService,
  companyService,
  journalEntryService,
  accountMappingService,
);
