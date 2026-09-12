import { DeferredTaxComputationService } from './deferredTaxComputationService';
import { RealDeferredTaxPostingExecutor } from './deferredTaxPostingExecutor';
import { deferredTaxComputationRepository } from '../repositories/instances';
import { financialYearService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { incomeTaxConfigService } from '@/features/tax/incomeTax/services';
import { taxRegisterService } from '@/features/assets/services';
import { supabase } from '@/config/supabase';

export type { PreparedDeferredTaxComputation, FinancialYearLookup, CompanyLookup, TaxRegisterLookup } from './deferredTaxComputationService';
export { DeferredTaxComputationService } from './deferredTaxComputationService';
export type { DeferredTaxPostingExecutor } from './deferredTaxPostingExecutor';
export {
  calculateDeferredTaxTotals,
  calculateItemDeferredTax,
  classifyTemporaryDifference,
  findMostRecentPostedBefore,
  recalculateItem,
  suggestFixedAssetTemporaryDifferences,
} from './deferredTaxCalculations';
export type { DeferredTaxControlAccountCheck, DeferredTaxReconciliation } from './deferredTaxReconciliationService';
export { reconcileDeferredTaxToGl } from './deferredTaxReconciliationService';

/**
 * Wires the Deferred Tax feature's service to its shared mock repository
 * and the real atomic posting RPC (migration 0103) / cross-feature
 * lookups (journalEntryService, financialYearService, companyService,
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
  new RealDeferredTaxPostingExecutor(supabase),
  accountMappingService,
);
