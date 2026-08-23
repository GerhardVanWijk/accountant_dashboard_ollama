import { FixedAssetService } from './fixedAssetService';
import { DepreciationService } from './depreciationService';
import { AssetDisposalService } from './assetDisposalService';
import { TaxRegisterService } from './taxRegisterService';
import { fixedAssetRepository, depreciationEntryRepository, assetDisposalRepository } from '../repositories/instances';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

export type { CreateFixedAssetDTO, UpdateFixedAssetDTO, CapitalizeFromBillLineInput } from './fixedAssetService';
export type { DepreciationRunResult } from './depreciationService';
export { calculateMonthlyDepreciation } from './depreciationService';
export type { DisposeAssetInput } from './assetDisposalService';
export type { TaxRegisterRow } from './taxRegisterService';
export { FixedAssetService } from './fixedAssetService';
export { DepreciationService } from './depreciationService';
export { AssetDisposalService } from './assetDisposalService';
export { TaxRegisterService } from './taxRegisterService';

/**
 * Wires the services to their shared mock repositories and the real GL
 * posting engine (journalEntryService) — the same singleton every other
 * posting module uses, so an asset acquisition/depreciation run/disposal
 * is immediately visible in the trial balance and subject to
 * accountingPeriodService's period-open rule. Hooks depend on these
 * singletons instead of importing repositories directly.
 */
export const fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMappingService);
export const depreciationService = new DepreciationService(depreciationEntryRepository, fixedAssetRepository, journalEntryService);
export const assetDisposalService = new AssetDisposalService(assetDisposalRepository, fixedAssetRepository, journalEntryService, accountMappingService);
export const taxRegisterService = new TaxRegisterService(fixedAssetRepository);
