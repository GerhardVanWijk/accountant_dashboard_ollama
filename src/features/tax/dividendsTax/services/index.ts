import { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
import { DividendDeclarationService } from './dividendDeclarationService';
import { RealDividendDeclarationPostingExecutor } from './dividendDeclarationPostingExecutor';
import { dividendsWithholdingTaxConfigRepository, dividendDeclarationRepository } from '../repositories/instances';
import { accountMappingService } from '@/features/accounting/services';
import { supabase } from '@/config/supabase';

export type {
  CreateDividendDeclarationInput,
  UpdateDraftDividendDeclarationInput,
  DividendsRateResolver,
} from './dividendDeclarationService';
export { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
export type { CreateDividendsWithholdingTaxRateConfigDTO } from './dividendsWithholdingTaxConfigService';
export { DividendDeclarationService, getRemittanceDueDateHint } from './dividendDeclarationService';
export type { DividendDeclarationPostingExecutor } from './dividendDeclarationPostingExecutor';
export type { DividendsTaxControlAccountCheck, DividendsTaxReconciliation, DividendsTaxRegisterEvent } from './dividendsTaxReconciliationService';
export { computeExpectedDividendsTaxMovements, reconcileDividendsTaxControlAccounts } from './dividendsTaxReconciliationService';

/**
 * Wires the dividendsTax feature's services to their mock repositories and
 * the real atomic posting RPCs (migration 0102) — mirrors
 * src/features/assets/services/index.ts.
 */
export const dividendsWithholdingTaxConfigService = new DividendsWithholdingTaxConfigService(dividendsWithholdingTaxConfigRepository);
export const dividendDeclarationService = new DividendDeclarationService(
  dividendDeclarationRepository,
  new RealDividendDeclarationPostingExecutor(supabase),
  dividendsWithholdingTaxConfigService,
  accountMappingService,
);
