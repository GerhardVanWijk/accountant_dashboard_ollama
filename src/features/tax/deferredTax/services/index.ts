import { DeferredTaxComputationService } from './deferredTaxComputationService';
import { deferredTaxComputationRepository } from '../repositories/instances';
import { financialYearService, journalEntryService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { incomeTaxConfigService } from '@/features/tax/incomeTax/services';
import { taxRegisterService } from '@/features/assets/services';

export type { PreparedDeferredTaxComputation, FinancialYearLookup, CompanyLookup, TaxRegisterLookup, JournalPoster } from './deferredTaxComputationService';
export { DeferredTaxComputationService } from './deferredTaxComputationService';
export {
  calculateDeferredTaxTotals,
  calculateItemDeferredTax,
  classifyTemporaryDifference,
  findMostRecentPostedBefore,
  recalculateItem,
  suggestFixedAssetTemporaryDifferences,
} from './deferredTaxCalculations';

/**
 * Wires the Deferred Tax feature's service to its shared mock repository
 * and the real GL posting engine / cross-feature lookups
 * (journalEntryService, financialYearService, companyService,
 * incomeTaxConfigService, taxRegisterService) — same "singletons wired
 * here, components/hooks never import a repository directly" pattern as
 * every other feature's services/index.ts.
 */
export const deferredTaxComputationService = new DeferredTaxComputationService(
  deferredTaxComputationRepository,
  financialYearService,
  companyService,
  taxRegisterService,
  incomeTaxConfigService,
  journalEntryService,
  accountMappingService,
);
