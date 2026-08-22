import { CgtConfigService } from './cgtConfigService';
import { CapitalGainsService } from './capitalGainsService';
import {
  cgtInclusionRateConfigRepository,
  cgtAnnualExclusionConfigRepository,
  cgtDisposalAdjustmentRepository,
} from '../repositories/instances';
import { assetDisposalService, fixedAssetService } from '@/features/assets/services';

export type { CreateCgtInclusionRateConfigDTO, CreateCgtAnnualExclusionConfigDTO } from './cgtConfigService';
export type { AssetDisposalLookup, FixedAssetLookup } from './capitalGainsService';
export { CgtConfigService } from './cgtConfigService';
export { CapitalGainsService, computeCapitalGainsReport, resolveEntityTypeBucket } from './capitalGainsService';

/**
 * Wires the Capital Gains Tax services to their own mock config
 * repositories and to the REAL assets-feature singletons
 * (assetDisposalService / fixedAssetService) — read-only consumption of
 * the disposal ledger and asset register, no import of anything the
 * assets bee owns beyond its public service surface.
 */
export const cgtConfigService = new CgtConfigService(cgtInclusionRateConfigRepository, cgtAnnualExclusionConfigRepository);
export const capitalGainsService = new CapitalGainsService(
  assetDisposalService,
  fixedAssetService,
  cgtDisposalAdjustmentRepository,
  cgtConfigService,
);
