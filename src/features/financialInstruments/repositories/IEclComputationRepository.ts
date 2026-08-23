import type { EclComputation, ID } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

export interface IEclComputationRepository extends IRepository<EclComputation> {
  /** At most one EclComputation (draft or posted) exists per financial year — mirrors IDeferredTaxComputationRepository.getByFinancialYear(). */
  getByFinancialYear(financialYearId: ID): Promise<EclComputation | undefined>;
  getByCompany(companyId: ID): Promise<EclComputation[]>;
}
