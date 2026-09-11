import { FixedAssetService } from './fixedAssetService';
import { DepreciationService } from './depreciationService';
import { AssetDisposalService } from './assetDisposalService';
import { TaxRegisterService } from './taxRegisterService';
import { RealDepreciationPeriodExecutor } from './depreciationPeriodExecutor';
import { RealDisposalExecutor } from './disposalExecutor';
import { RealEstimateRevisionExecutor } from './estimateRevisionExecutor';
import {
  fixedAssetRepository,
  depreciationEntryRepository,
  assetDisposalRepository,
  estimateRevisionRepository,
} from '../repositories/instances';
import { journalEntryService, accountMappingService, accountingPeriodService } from '@/features/accounting/services';
import { taxRateService } from '@/features/tax/services';
import { auditLogService } from '@/services/auditLogService';
import { supabase } from '@/config/supabase';

export type { CreateFixedAssetDTO, UpdateFixedAssetDTO, CapitalizeFromBillLineInput, ReviseEstimateInput } from './fixedAssetService';
export type {
  DepreciationRunResult,
  DepreciationPreview,
  DepreciationPreviewRow,
  DepreciationPeriodGroup,
  DepreciationPeriodStatus,
} from './depreciationService';
export { calculateMonthlyDepreciation, toEstimateTimeline } from './depreciationService';
export {
  planAssetDepreciation,
  estimateAsOf,
  round2,
  type AssetDepreciationPlan,
  type AssetDepreciationInput,
  type PlannedDepreciationPeriod,
  type EstimateRevisionSnapshot,
} from './depreciationMath';
export type { DisposeAssetInput, DisposalBreakdown, DisposalVatTreatment, DisposalTaxRateResolver } from './assetDisposalService';
export { splitProceeds, DEFAULT_DISPOSAL_VAT_CODE } from './assetDisposalService';
export type { RevisionResolver } from './depreciationService';
export type { TaxRegisterRow } from './taxRegisterService';
export { FixedAssetService } from './fixedAssetService';
export { DepreciationService } from './depreciationService';
export { AssetDisposalService } from './assetDisposalService';
export { TaxRegisterService } from './taxRegisterService';
export {
  reconcileAssetRegisterToGl,
  type AssetRegisterReconciliation,
  type AssetGlAccountLine,
} from './assetRegisterReconciliationService';
export {
  auditAssetRegisterIntegrity,
  type AssetIntegrityReport,
  type AssetIntegrityException,
  type AssetIntegritySeverity,
} from './assetRegisterIntegrityService';

/**
 * Wires the services to their shared Supabase repositories and the real GL
 * posting engine (journalEntryService) — the same singleton every other
 * posting module uses, so an asset acquisition / depreciation run / disposal
 * is immediately visible in the trial balance and subject to the period-open
 * rule. FixedAssetService also writes asset lifecycle events to the shared
 * audit trail; AssetDisposalService is handed DepreciationService so a
 * disposal brings depreciation current to the disposal date first.
 */
export const fixedAssetService = new FixedAssetService(
  fixedAssetRepository,
  journalEntryService,
  accountMappingService,
  estimateRevisionRepository,
  depreciationEntryRepository,
  new RealEstimateRevisionExecutor(supabase),
  auditLogService,
);
export const depreciationService = new DepreciationService(
  depreciationEntryRepository,
  fixedAssetRepository,
  new RealDepreciationPeriodExecutor(supabase),
  { getAll: () => accountingPeriodService.getPeriods() },
  estimateRevisionRepository,
);
export const assetDisposalService = new AssetDisposalService(
  assetDisposalRepository,
  fixedAssetRepository,
  new RealDisposalExecutor(supabase),
  accountMappingService,
  depreciationService,
  taxRateService,
);
export const taxRegisterService = new TaxRegisterService(fixedAssetRepository);
