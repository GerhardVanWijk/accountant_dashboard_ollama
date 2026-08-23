import { ProvisionalTaxService } from './provisionalTaxService';
import { provisionalTaxPeriodRepository } from '../repositories/instances';
import { financialYearService, journalEntryService, accountMappingService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { incomeTaxConfigService, taxComputationService } from '@/features/tax/incomeTax/services';

export type {
  CompanyLookup,
  FinancialYearLookup,
  IncomeTaxConfigLookup,
  JournalPoster,
  TaxComputationLookup,
} from './provisionalTaxService';
export { ProvisionalTaxService } from './provisionalTaxService';

/**
 * Wires the Provisional Tax feature's service to its shared mock
 * repository and the real GL posting engine / cross-feature lookups
 * (financialYearService, companyService, and the real Income Tax module's
 * incomeTaxConfigService/taxComputationService) — same "singletons wired
 * here, components/hooks never import a repository directly" pattern as
 * every other feature's services/index.ts.
 */
export const provisionalTaxService = new ProvisionalTaxService(
  provisionalTaxPeriodRepository,
  financialYearService,
  companyService,
  incomeTaxConfigService,
  journalEntryService,
  taxComputationService,
  accountMappingService,
);
