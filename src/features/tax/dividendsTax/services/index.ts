import { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
import { DividendDeclarationService } from './dividendDeclarationService';
import { dividendsWithholdingTaxConfigRepository, dividendDeclarationRepository } from '../repositories/instances';
import { journalEntryService } from '@/features/accounting/services';

export type { CreateDividendsWithholdingTaxRateConfigDTO } from './dividendsWithholdingTaxConfigService';
export type {
  CreateDividendDeclarationInput,
  UpdateDraftDividendDeclarationInput,
  JournalPoster,
  DividendsRateResolver,
} from './dividendDeclarationService';
export { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
export { DividendDeclarationService, getRemittanceDueDateHint } from './dividendDeclarationService';

/**
 * Wires the dividendsTax feature's services to their mock repositories
 * and to the shared journalEntryService singleton (the SAME singleton
 * billService/invoiceService/assetDisposalService post through) —
 * mirrors src/features/assets/services/index.ts.
 */
export const dividendsWithholdingTaxConfigService = new DividendsWithholdingTaxConfigService(dividendsWithholdingTaxConfigRepository);
export const dividendDeclarationService = new DividendDeclarationService(
  dividendDeclarationRepository,
  journalEntryService,
  dividendsWithholdingTaxConfigService,
);
