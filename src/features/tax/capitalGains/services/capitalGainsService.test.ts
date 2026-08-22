import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalGainsService, computeCapitalGainsReport, resolveEntityTypeBucket } from './capitalGainsService';
import { CgtConfigService } from './cgtConfigService';
import { MockCgtInclusionRateConfigRepository } from '../repositories/MockCgtInclusionRateConfigRepository';
import { MockCgtAnnualExclusionConfigRepository } from '../repositories/MockCgtAnnualExclusionConfigRepository';
import { MockCgtDisposalAdjustmentRepository } from '../repositories/MockCgtDisposalAdjustmentRepository';
import type { AssetDisposalLookup, FixedAssetLookup } from './capitalGainsService';
import type { AssetDisposal, CgtAnnualExclusionConfig, CgtInclusionRateConfig, FixedAsset } from '@/types';

const NATURAL_RATE: CgtInclusionRateConfig = {
  id: 'cgt_incl_natural',
  entityTypeBucket: 'natural_person_like',
  inclusionRatePercent: 40,
  effectiveFrom: '2026-03-01T00:00:00.000Z',
  effectiveTo: '2027-02-28T23:59:59.999Z',
  sourceReference: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COMPANY_RATE: CgtInclusionRateConfig = { ...NATURAL_RATE, id: 'cgt_incl_company', entityTypeBucket: 'company', inclusionRatePercent: 80 };
const TRUST_RATE: CgtInclusionRateConfig = { ...NATURAL_RATE, id: 'cgt_incl_trust', entityTypeBucket: 'trust', inclusionRatePercent: 80 };

const EXCLUSION: CgtAnnualExclusionConfig = {
  id: 'cgt_excl',
  amount: 50000,
  effectiveFrom: '2026-03-01T00:00:00.000Z',
  effectiveTo: '2027-02-28T23:59:59.999Z',
  sourceReference: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function asset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'fa_1',
    assetNumber: 'FA-0001',
    name: 'Delivery Van',
    category: 'motor_vehicles',
    acquisitionDate: '2020-01-01',
    cost: 100000,
    residualValue: 0,
    usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 100000,
    status: 'disposed',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function disposal(overrides: Partial<AssetDisposal> = {}): AssetDisposal {
  return {
    id: 'disp_1',
    assetId: 'fa_1',
    disposalDate: '2026-06-15',
    proceeds: 130000,
    carryingValueAtDisposal: 0,
    accumulatedDepreciationAtDisposal: 100000,
    gainLoss: 130000,
    journalEntryId: 'je_1',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveEntityTypeBucket', () => {
  it('maps sole_proprietor and partnership to natural_person_like', () => {
    expect(resolveEntityTypeBucket('sole_proprietor')).toBe('natural_person_like');
    expect(resolveEntityTypeBucket('partnership')).toBe('natural_person_like');
  });

  it('maps trust to trust', () => {
    expect(resolveEntityTypeBucket('trust')).toBe('trust');
  });

  it('maps every company-like entity type to company', () => {
    expect(resolveEntityTypeBucket('private_company')).toBe('company');
    expect(resolveEntityTypeBucket('public_company')).toBe('company');
    expect(resolveEntityTypeBucket('personal_liability_company')).toBe('company');
    expect(resolveEntityTypeBucket('state_owned_company')).toBe('company');
    expect(resolveEntityTypeBucket('non_profit_company')).toBe('company');
    expect(resolveEntityTypeBucket('close_corporation')).toBe('company');
    expect(resolveEntityTypeBucket('external_company')).toBe('company');
    expect(resolveEntityTypeBucket('other')).toBe('company');
  });
});

describe('computeCapitalGainsReport', () => {
  const periodStart = new Date('2026-03-01T00:00:00.000Z');
  const periodEnd = new Date('2027-02-28T23:59:59.999Z');

  it('computes base cost from FixedAsset.cost, not carryingValueAtDisposal, and separates it from the accounting gain', () => {
    const d = disposal({ proceeds: 130000, carryingValueAtDisposal: 0, gainLoss: 130000 });
    const a = asset({ cost: 100000 });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [d],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });

    const row = report.disposals[0];
    expect(row.baseCost).toBe(100000);
    expect(row.accountingGainLoss).toBe(130000); // proceeds - carryingValueAtDisposal
    expect(row.capitalGainLoss).toBe(30000); // proceeds - baseCost - sellingCosts(0)
  });

  it('applies the annual exclusion only for natural-person-like entities', () => {
    const d = disposal({ proceeds: 130000 });
    const a = asset({ cost: 100000 });
    const base = {
      periodStart,
      periodEnd,
      disposals: [d],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map(),
    };

    const naturalReport = computeCapitalGainsReport({
      ...base,
      entityTypeBucket: 'natural_person_like',
      inclusionRateConfig: NATURAL_RATE,
      annualExclusionConfig: EXCLUSION,
    });
    expect(naturalReport.annualExclusionEligible).toBe(true);
    expect(naturalReport.annualExclusionApplied).toBe(30000); // capped at the R30,000 gain
    expect(naturalReport.taxableCapitalGain).toBe(0); // (30000 - 30000) * 40% = 0

    const companyReport = computeCapitalGainsReport({
      ...base,
      entityTypeBucket: 'company',
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });
    expect(companyReport.annualExclusionEligible).toBe(false);
    expect(companyReport.annualExclusionApplied).toBe(0);
    expect(companyReport.taxableCapitalGain).toBe(24000); // 30000 * 80%

    const trustReport = computeCapitalGainsReport({
      ...base,
      entityTypeBucket: 'trust',
      inclusionRateConfig: TRUST_RATE,
      annualExclusionConfig: undefined,
    });
    expect(trustReport.annualExclusionEligible).toBe(false);
    expect(trustReport.taxableCapitalGain).toBe(24000); // 30000 * 80%, same as company
  });

  it('nets the aggregate capital gain/loss across multiple disposals in the same period', () => {
    const d1 = disposal({ id: 'disp_1', assetId: 'fa_1', proceeds: 130000 }); // base 100000 -> +30000
    const d2 = disposal({ id: 'disp_2', assetId: 'fa_2', proceeds: 20000 }); // base 50000 -> -30000
    const a1 = asset({ id: 'fa_1', cost: 100000 });
    const a2 = asset({ id: 'fa_2', cost: 50000 });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [d1, d2],
      assetsById: new Map([
        ['fa_1', a1],
        ['fa_2', a2],
      ]),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });

    expect(report.disposals).toHaveLength(2);
    expect(report.netCapitalGainLoss).toBe(0); // +30000 and -30000 net to zero
    expect(report.taxableCapitalGain).toBe(0);
    expect(report.netCapitalLossForPeriod).toBe(0);
  });

  it('floors the taxable capital gain at zero and reports the net loss separately when the aggregate position is a loss', () => {
    const d = disposal({ proceeds: 20000 });
    const a = asset({ cost: 100000 }); // 20000 - 100000 = -80000

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'natural_person_like',
      disposals: [d],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: NATURAL_RATE,
      annualExclusionConfig: EXCLUSION,
    });

    expect(report.netCapitalGainLoss).toBe(-80000);
    expect(report.taxableCapitalGain).toBe(0);
    expect(report.annualExclusionApplied).toBe(0); // exclusion never applies to a loss
    expect(report.netCapitalLossForPeriod).toBe(80000);
  });

  it('subtracts a per-disposal selling-costs override from the capital gain', () => {
    const d = disposal({ proceeds: 130000 });
    const a = asset({ cost: 100000 });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [d],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map([[d.id, 5000]]),
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });

    expect(report.disposals[0].capitalGainLoss).toBe(25000); // 130000 - 100000 - 5000
  });

  it('excludes disposals outside the chosen period', () => {
    const inside = disposal({ id: 'disp_in', disposalDate: '2026-06-01', proceeds: 130000 });
    const outside = disposal({ id: 'disp_out', disposalDate: '2025-01-01', proceeds: 999999 });
    const a = asset({ cost: 100000 });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [inside, outside],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });

    expect(report.disposals).toHaveLength(1);
    expect(report.disposals[0].disposalId).toBe('disp_in');
  });

  it('flags disposals whose asset could not be resolved instead of guessing a base cost', () => {
    const d = disposal({ assetId: 'missing_asset' });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [d],
      assetsById: new Map(),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: COMPANY_RATE,
      annualExclusionConfig: undefined,
    });

    expect(report.disposals).toHaveLength(0);
    expect(report.unresolvedDisposalCount).toBe(1);
    expect(report.netCapitalGainLoss).toBe(0);
  });

  it('warns when no inclusion rate config covers the bucket/period, and does not fabricate a rate', () => {
    const d = disposal({ proceeds: 130000 });
    const a = asset({ cost: 100000 });

    const report = computeCapitalGainsReport({
      periodStart,
      periodEnd,
      entityTypeBucket: 'company',
      disposals: [d],
      assetsById: new Map([[a.id, a]]),
      sellingCostsByDisposalId: new Map(),
      inclusionRateConfig: undefined,
      annualExclusionConfig: undefined,
    });

    expect(report.inclusionRatePercent).toBe(0);
    expect(report.taxableCapitalGain).toBe(0);
    expect(report.configWarnings.length).toBeGreaterThan(0);
  });
});

describe('CapitalGainsService', () => {
  let service: CapitalGainsService;
  let disposalLookup: AssetDisposalLookup;
  let assetLookup: FixedAssetLookup;
  let adjustmentRepository: MockCgtDisposalAdjustmentRepository;

  beforeEach(() => {
    const inclusionRateRepository = new MockCgtInclusionRateConfigRepository([NATURAL_RATE, COMPANY_RATE, TRUST_RATE]);
    const annualExclusionRepository = new MockCgtAnnualExclusionConfigRepository([EXCLUSION]);
    adjustmentRepository = new MockCgtDisposalAdjustmentRepository([]);
    const configService = new CgtConfigService(inclusionRateRepository, annualExclusionRepository);

    const disposals = [disposal({ proceeds: 130000 })];
    const assets = new Map([['fa_1', asset({ cost: 100000 })]]);
    disposalLookup = { getDisposals: async () => disposals };
    assetLookup = { getFixedAsset: async (id) => assets.get(id) };

    service = new CapitalGainsService(disposalLookup, assetLookup, adjustmentRepository, configService);
  });

  it('builds a full period report for a company using real disposal/asset/config lookups', async () => {
    const report = await service.getPeriodReport(new Date('2026-03-01T00:00:00.000Z'), new Date('2027-02-28T23:59:59.999Z'), 'private_company');

    expect(report.entityTypeBucket).toBe('company');
    expect(report.inclusionRatePercent).toBe(80);
    expect(report.disposals[0].capitalGainLoss).toBe(30000);
    expect(report.taxableCapitalGain).toBe(24000);
  });

  it('persists a selling-costs override and reflects it in the next report', async () => {
    expect(await service.getSellingCosts('disp_1')).toBe(0);

    await service.setSellingCosts('disp_1', 5000);
    expect(await service.getSellingCosts('disp_1')).toBe(5000);

    const report = await service.getPeriodReport(new Date('2026-03-01T00:00:00.000Z'), new Date('2027-02-28T23:59:59.999Z'), 'private_company');
    expect(report.disposals[0].sellingCosts).toBe(5000);
    expect(report.disposals[0].capitalGainLoss).toBe(25000);

    // Setting it again updates the same record rather than creating a second one.
    await service.setSellingCosts('disp_1', 8000);
    expect(await adjustmentRepository.getAll()).toHaveLength(1);
    expect(await service.getSellingCosts('disp_1')).toBe(8000);
  });

  it('rejects a negative selling-costs override', async () => {
    await expect(service.setSellingCosts('disp_1', -1)).rejects.toThrow(/negative/i);
  });
});
