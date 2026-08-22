import type { ID } from '@/types';
import type { IRepository } from '@/repositories/IRepository';
import type { ProvisionalTaxPeriod } from '@/types/provisionalTax';

export interface IProvisionalTaxPeriodRepository extends IRepository<ProvisionalTaxPeriod> {
  /** At most one ProvisionalTaxPeriod exists per financial year — see ProvisionalTaxService.getOrCreatePeriod()'s idempotency guard. */
  getByFinancialYear(financialYearId: ID): Promise<ProvisionalTaxPeriod | undefined>;
}
