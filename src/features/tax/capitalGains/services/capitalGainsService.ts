import type {
  AssetDisposal,
  CapitalGainsPeriodReport,
  CgtAnnualExclusionConfig,
  CgtDisposalAdjustment,
  CgtEntityTypeBucket,
  CgtInclusionRateConfig,
  FixedAsset,
  ID,
  SALegalEntityType,
} from '@/types';
import type { ICgtDisposalAdjustmentRepository } from '../repositories/ICgtDisposalAdjustmentRepository';
import type { CgtConfigService } from './cgtConfigService';

/** Half a cent — same rounding tolerance as journalEntryService.ts / assetDisposalService.ts. */
const EPSILON = 0.005;

/** Structural surface of AssetDisposalService this feature consumes (read-only). */
export interface AssetDisposalLookup {
  getDisposals(): Promise<AssetDisposal[]>;
}

/** Structural surface of FixedAssetService this feature consumes (read-only). */
export interface FixedAssetLookup {
  getFixedAsset(id: ID): Promise<FixedAsset | undefined>;
}

/**
 * Maps a company's SALegalEntityType (src/types/company.ts) to the broad
 * CGT treatment bucket SARS's inclusion-rate page distinguishes between.
 * `sole_proprietor` and `partnership` are treated as natural-person-like
 * — a documented simplification for `partnership` (see
 * CgtEntityTypeBucket's doc comment), not a SARS rule.
 */
export function resolveEntityTypeBucket(legalEntityType: SALegalEntityType): CgtEntityTypeBucket {
  if (legalEntityType === 'trust') return 'trust';
  if (legalEntityType === 'sole_proprietor' || legalEntityType === 'partnership') return 'natural_person_like';
  return 'company';
}

const SIMPLIFICATION_NOTES: readonly string[] = [
  'Base cost uses the disposed asset\'s original cost only — capital improvements are not tracked on the ' +
    'Fixed Asset Register in this app, so any capital improvement that should increase base cost per §55 is not ' +
    'reflected here.',
  'Sole proprietors and partnerships are both treated as natural-person-like for inclusion rate/annual exclusion ' +
    'purposes — a partnership itself is not really the CGT taxpayer (gains flow through to individual partners), ' +
    'but that flow-through is not modeled in this single-entity-scope app.',
  'Trusts always use the standard 80% inclusion rate — the "special trust" 40% sub-case is not modeled (no ' +
    'special-trust flag exists on Company).',
  'A net capital loss for the period is floored to a taxable capital gain of zero and shown separately, but is ' +
    'not carried forward into any future period\'s computation — full assessed-capital-loss carryforward tracking ' +
    'is an open gap.',
  'Every figure here requires professional/accounting review before being relied on for a real return ' +
    '(SA_ACCOUNTING_MASTER_SPEC.md §110/§111).',
];

interface ComputeInputs {
  periodStart: Date;
  periodEnd: Date;
  entityTypeBucket: CgtEntityTypeBucket;
  disposals: AssetDisposal[];
  assetsById: Map<ID, FixedAsset>;
  sellingCostsByDisposalId: Map<ID, number>;
  inclusionRateConfig: CgtInclusionRateConfig | undefined;
  annualExclusionConfig: CgtAnnualExclusionConfig | undefined;
}

function inPeriod(dateIso: string, periodStart: Date, periodEnd: Date): boolean {
  const d = new Date(dateIso);
  return d >= periodStart && d <= periodEnd;
}

/**
 * Pure computation — separated from the async data-fetching in
 * CapitalGainsService below so the netting/exclusion/inclusion-rate math
 * is directly unit-testable without mocking repositories, same
 * "computeX is pure, wrap it in a service for the async parts" idiom as
 * vatReportService.ts's computeVatReport().
 */
export function computeCapitalGainsReport(inputs: ComputeInputs): CapitalGainsPeriodReport {
  const { periodStart, periodEnd, entityTypeBucket, disposals, assetsById, sellingCostsByDisposalId, inclusionRateConfig, annualExclusionConfig } =
    inputs;

  const periodDisposals = disposals.filter((d) => inPeriod(d.disposalDate, periodStart, periodEnd));

  const computations: CapitalGainsPeriodReport['disposals'] = [];
  let unresolvedDisposalCount = 0;

  for (const disposal of periodDisposals) {
    const asset = assetsById.get(disposal.assetId);
    if (!asset) {
      unresolvedDisposalCount += 1;
      continue;
    }
    const sellingCosts = sellingCostsByDisposalId.get(disposal.id) ?? 0;
    const baseCost = asset.cost;
    const capitalGainLoss = disposal.proceeds - baseCost - sellingCosts;

    computations.push({
      disposalId: disposal.id,
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      assetName: asset.name,
      disposalDate: disposal.disposalDate,
      proceeds: disposal.proceeds,
      accountingCarryingValue: disposal.carryingValueAtDisposal,
      accountingGainLoss: disposal.gainLoss,
      baseCost,
      sellingCosts,
      capitalGainLoss,
    });
  }

  const netCapitalGainLoss = computations.reduce((sum, c) => sum + c.capitalGainLoss, 0);

  const configWarnings: string[] = [];

  const inclusionRatePercent = inclusionRateConfig?.inclusionRatePercent ?? 0;
  if (!inclusionRateConfig) {
    configWarnings.push(
      `No CgtInclusionRateConfig covers "${entityTypeBucket}" for this period — treating the inclusion rate as 0% ` +
        'pending configuration. Requires professional/accounting review before relying on this report.',
    );
  }

  const annualExclusionEligible = entityTypeBucket === 'natural_person_like';
  let annualExclusionAvailable = 0;
  let annualExclusionSourceReference: string | undefined;
  if (annualExclusionEligible) {
    if (annualExclusionConfig) {
      annualExclusionAvailable = annualExclusionConfig.amount;
      annualExclusionSourceReference = annualExclusionConfig.sourceReference;
    } else {
      configWarnings.push(
        'No CgtAnnualExclusionConfig covers this period for a natural-person-like entity — treating the annual ' +
          'exclusion as R0 pending configuration. Requires professional/accounting review before relying on this report.',
      );
    }
  }

  const annualExclusionApplied = annualExclusionEligible ? Math.min(annualExclusionAvailable, Math.max(0, netCapitalGainLoss)) : 0;

  const netAfterExclusion = netCapitalGainLoss - annualExclusionApplied;
  const taxableCapitalGain = Math.max(0, netAfterExclusion) * (inclusionRatePercent / 100);
  const netCapitalLossForPeriod = netCapitalGainLoss < -EPSILON ? Math.abs(netCapitalGainLoss) : 0;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    entityTypeBucket,
    disposals: computations,
    unresolvedDisposalCount,
    netCapitalGainLoss,
    inclusionRatePercent,
    inclusionRateSourceReference: inclusionRateConfig?.sourceReference,
    annualExclusionEligible,
    annualExclusionAvailable,
    annualExclusionApplied,
    annualExclusionSourceReference,
    taxableCapitalGain,
    netCapitalLossForPeriod,
    simplificationNotes: [...SIMPLIFICATION_NOTES],
    configWarnings,
  };
}

/**
 * Capital Gains Tax (SA_ACCOUNTING_MASTER_SPEC.md §55) — a read-only TAX
 * reconciliation layer over the fixed-asset disposal ledger. Posts
 * nothing to the GL: the accounting gain/loss is already posted by
 * assetDisposalService when the disposal happens. This service exists
 * purely to compute the separate TAXABLE CAPITAL GAIN figure and to let
 * a user record a per-disposal selling-costs override that this app has
 * nowhere else to capture.
 */
export class CapitalGainsService {
  constructor(
    private readonly disposalLookup: AssetDisposalLookup,
    private readonly assetLookup: FixedAssetLookup,
    private readonly adjustmentRepository: ICgtDisposalAdjustmentRepository,
    private readonly configService: CgtConfigService,
  ) {}

  async getSellingCosts(disposalId: ID): Promise<number> {
    const adjustment = await this.adjustmentRepository.getByDisposal(disposalId);
    return adjustment?.sellingCosts ?? 0;
  }

  async setSellingCosts(disposalId: ID, sellingCosts: number): Promise<CgtDisposalAdjustment> {
    if (sellingCosts < 0) {
      throw new Error('Selling costs cannot be negative.');
    }
    const existing = await this.adjustmentRepository.getByDisposal(disposalId);
    if (existing) {
      return this.adjustmentRepository.update(existing.id, { sellingCosts });
    }
    return this.adjustmentRepository.create({ id: '', disposalId, sellingCosts, createdAt: '', updatedAt: '' });
  }

  /**
   * Builds the full period reconciliation: fetches every disposal, looks
   * up each one's asset (for base cost) and selling-costs override, and
   * resolves the inclusion rate / annual exclusion config for the
   * company's legalEntityType as of periodEnd.
   */
  async getPeriodReport(periodStart: Date, periodEnd: Date, legalEntityType: SALegalEntityType): Promise<CapitalGainsPeriodReport> {
    const allDisposals = await this.disposalLookup.getDisposals();
    const periodDisposals = allDisposals.filter((d) => inPeriod(d.disposalDate, periodStart, periodEnd));

    const assetsById = new Map<ID, FixedAsset>();
    const sellingCostsByDisposalId = new Map<ID, number>();
    for (const disposal of periodDisposals) {
      if (!assetsById.has(disposal.assetId)) {
        const asset = await this.assetLookup.getFixedAsset(disposal.assetId);
        if (asset) assetsById.set(disposal.assetId, asset);
      }
      sellingCostsByDisposalId.set(disposal.id, await this.getSellingCosts(disposal.id));
    }

    const entityTypeBucket = resolveEntityTypeBucket(legalEntityType);
    const inclusionRateConfig = await this.configService.getInclusionRateConfig(entityTypeBucket, periodEnd);
    const annualExclusionConfig =
      entityTypeBucket === 'natural_person_like' ? await this.configService.getAnnualExclusionConfig(periodEnd) : undefined;

    return computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket,
      disposals: allDisposals,
      assetsById,
      sellingCostsByDisposalId,
      inclusionRateConfig,
      annualExclusionConfig,
    });
  }
}
