import { EmployeeService } from './employeeService';
import { PayrollTaxConfigService } from './payrollTaxConfigService';
import { PayrollRunService } from './payrollRunService';
import { RealPayrollRunPostingExecutor } from './payrollRunPostingExecutor';
import { RealPayrollRunCorrectionExecutor } from './payrollRunCorrectionExecutor';
import { RealPayrollSettlementExecutor } from './payrollSettlementExecutor';
import { employeeRepository, payrollRunRepository, payrollTaxConfigRepository } from '../repositories/instances';
import { accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { supabase } from '@/config/supabase';

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
 * Wires the services to their shared Supabase repositories and the atomic
 * RPC executors (Leases + Payroll integrity audit, PART 2 — migrations
 * 0091/0093) — a payroll run's post and its (rare) reversal each commit
 * their journal and mutate `payroll_runs` in ONE database transaction, so
 * a run is never left half-posted by a partial write. Hooks depend on
 * these singletons instead of importing repositories directly.
 */
export const payrollTaxConfigService = new PayrollTaxConfigService(payrollTaxConfigRepository);
export const employeeService = new EmployeeService(employeeRepository, payrollRunRepository);
export const payrollRunService = new PayrollRunService(
  payrollRunRepository,
  employeeService,
  payrollTaxConfigService,
  companyService,
  new RealPayrollRunPostingExecutor(supabase),
  accountMappingService,
  new RealPayrollRunCorrectionExecutor(supabase),
  new RealPayrollSettlementExecutor(supabase),
);
