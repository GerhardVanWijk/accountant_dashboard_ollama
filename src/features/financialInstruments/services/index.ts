import { EclComputationService } from './eclComputationService';
import { RealEclPostingExecutor } from './eclPostingExecutor';
import { eclComputationRepository } from '../repositories/instances';
import { financialYearService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { getCustomerAgingReport } from '@/features/reports/aging/services/customerAgingReportService';
import { supabase } from '@/config/supabase';

export type { FinancialYearLookup, CompanyLookup, AgingLookup } from './eclComputationService';
export { EclComputationService } from './eclComputationService';
export type { EclPostingExecutor } from './eclPostingExecutor';
export {
  aggregateReceivablesByBucket,
  buildEclBucketLines,
  calculateBucketExpectedCreditLoss,
  calculateEclTotals,
  findMostRecentPostedEclBefore,
  recalculateBucketLine,
} from './eclCalculations';
export type { EclControlAccountCheck, EclReconciliation } from './eclReconciliationService';
export { reconcileEclToGl } from './eclReconciliationService';

/**
 * Wires the Financial Instruments (ECL) feature's service to its shared
 * mock repository and the real atomic posting RPC (migration 0104) /
 * cross-feature lookups (financialYearService, companyService, the
 * Reports module's real getCustomerAgingReport()) — same "singletons
 * wired here, components/hooks never import a repository directly"
 * pattern as every other feature's services/index.ts.
 */
export const eclComputationService = new EclComputationService(
  eclComputationRepository,
  financialYearService,
  companyService,
  { getCustomerAgingReport },
  new RealEclPostingExecutor(supabase),
  accountMappingService,
);
