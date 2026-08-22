import type { ID, TaxComputation } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

export interface ITaxComputationRepository extends IRepository<TaxComputation> {
  /** At most one TaxComputation (draft or posted) exists per financial year — see TaxComputationService.createComputation()'s idempotency guard. */
  getByFinancialYear(financialYearId: ID): Promise<TaxComputation | undefined>;
}
