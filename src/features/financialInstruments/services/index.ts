import { EclComputationService } from './eclComputationService';
import { eclComputationRepository } from '../repositories/instances';
import { financialYearService, journalEntryService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { getCustomerAgingReport } from '@/features/reports/aging/services/customerAgingReportService';

export type { FinancialYearLookup, CompanyLookup, AgingLookup, JournalPoster } from './eclComputationService';
export { EclComputationService } from './eclComputationService';
export {
  aggregateReceivablesByBucket,
  buildEclBucketLines,
  calculateBucketExpectedCreditLoss,
  calculateEclTotals,
  findMostRecentPostedEclBefore,
  recalculateBucketLine,
} from './eclCalculations';

/**
 * Wires the Financial Instruments (ECL) feature's service to its shared
 * mock repository and the real GL posting engine / cross-feature lookups
 * (journalEntryService, financialYearService, companyService, the Reports
 * module's real getCustomerAgingReport()) — same "singletons wired here,
 * components/hooks never import a repository directly" pattern as every
 * other feature's services/index.ts.
 */
export const eclComputationService = new EclComputationService(
  eclComputationRepository,
  financialYearService,
  companyService,
  { getCustomerAgingReport },
  journalEntryService,
  accountMappingService,
);
