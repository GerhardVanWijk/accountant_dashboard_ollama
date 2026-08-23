import { IncomeTaxConfigService } from './incomeTaxConfigService';
import { TaxComputationService } from './taxComputationService';
import { incomeTaxConfigRepository, taxComputationRepository } from '../repositories/instances';
import { journalEntryService, accountService, financialYearService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { fixedAssetService, assetDisposalService } from '@/features/assets/services';
import { capitalGainsService } from '@/features/tax/capitalGains/services';

export type { CreateIncomeTaxYearConfigDTO } from './incomeTaxConfigService';
export { IncomeTaxConfigService } from './incomeTaxConfigService';
export type {
  AccountLookup,
  AssetDisposalLookup,
  CompanyLookup,
  FinancialYearLookup,
  FixedAssetLookup,
  JournalEntryLookup,
  JournalPoster,
  PreparedTaxComputation,
} from './taxComputationService';
export { TaxComputationService } from './taxComputationService';
export {
  calculateAccountingProfit,
  calculateDepreciationAddback,
  calculateFlatTaxLiability,
  calculateSbcTaxLiability,
  calculateTaxLiability,
  calculateTaxableIncome,
  calculateWearAndTearAllowanceForPeriod,
  netAdjustmentAmount,
  suggestDisposalAddbackAdjustments,
} from './taxComputationCalculations';

/**
 * Wires the Income Tax feature's services to their shared mock
 * repositories and the real GL posting engine / cross-feature lookups
 * (journalEntryService, accountService, financialYearService,
 * companyService, fixedAssetService, assetDisposalService) — same
 * "singletons wired here, components/hooks never import a repository
 * directly" pattern as every other feature's services/index.ts.
 *
 * Also wires the real capitalGainsService (src/features/tax/capitalGains/)
 * in as TaxComputationService's optional CapitalGainsLookup — a Queen Bee
 * integration pass done after both the income-tax and capital-gains bees
 * (dispatched in parallel) finished, so the §55 taxable-capital-gain
 * adjustment line is pre-filled from the real module instead of the
 * zero-amount manual placeholder each bee necessarily left in place while
 * the other's module didn't exist yet.
 */
export const incomeTaxConfigService = new IncomeTaxConfigService(incomeTaxConfigRepository);

export const taxComputationService = new TaxComputationService(
  taxComputationRepository,
  journalEntryService,
  accountService,
  financialYearService,
  companyService,
  fixedAssetService,
  assetDisposalService,
  incomeTaxConfigService,
  journalEntryService,
  accountMappingService,
  capitalGainsService,
);
