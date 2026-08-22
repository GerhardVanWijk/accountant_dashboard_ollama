import type { PayrollRun } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/** Payroll run contract. The register itself is fully editable/deletable while a run is 'draft', subject to payrollRunService's own guards once posted — mirrors IFixedAssetRepository. */
export type IPayrollRunRepository = IRepository<PayrollRun>;
