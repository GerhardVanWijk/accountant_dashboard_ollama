import type { DeferredTaxComputation, ID } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

export interface IDeferredTaxComputationRepository extends IRepository<DeferredTaxComputation> {
  /** At most one DeferredTaxComputation (draft or posted) exists per financial year — see DeferredTaxComputationService.createComputation()'s idempotency guard, mirrors ITaxComputationRepository.getByFinancialYear(). */
  getByFinancialYear(financialYearId: ID): Promise<DeferredTaxComputation | undefined>;
  getByCompany(companyId: ID): Promise<DeferredTaxComputation[]>;
}
