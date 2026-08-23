import { describe, expect, it } from 'vitest';
import type { DeferredTaxComputation, DeferredTaxTemporaryDifference } from '@/types';
import type { TaxRegisterRow } from '@/features/assets/services/taxRegisterService';
import {
  calculateDeferredTaxTotals,
  calculateItemDeferredTax,
  classifyTemporaryDifference,
  findMostRecentPostedBefore,
  recalculateItem,
  suggestFixedAssetTemporaryDifferences,
} from './deferredTaxCalculations';

function item(overrides: Partial<DeferredTaxTemporaryDifference> = {}): DeferredTaxTemporaryDifference {
  return {
    id: 'item1',
    source: 'other',
    description: 'Test item',
    carryingAmount: 0,
    taxBase: 0,
    temporaryDifference: 0,
    classification: 'deductible',
    recognized: false,
    deferredTaxAmount: 0,
    ...overrides,
  };
}

describe('classifyTemporaryDifference', () => {
  it('classifies carrying > tax base as taxable', () => {
    expect(classifyTemporaryDifference(100, 60)).toBe('taxable');
  });
  it('classifies carrying <= tax base as deductible', () => {
    expect(classifyTemporaryDifference(60, 100)).toBe('deductible');
    expect(classifyTemporaryDifference(50, 50)).toBe('deductible');
  });
});

describe('calculateItemDeferredTax', () => {
  it('always computes an amount for a taxable item regardless of recognized', () => {
    const amount = calculateItemDeferredTax({ classification: 'taxable', temporaryDifference: -1000, recognized: false }, 27);
    expect(amount).toBe(270);
  });
  it('computes 0 for an unrecognized deductible item', () => {
    const amount = calculateItemDeferredTax({ classification: 'deductible', temporaryDifference: 1000, recognized: false }, 27);
    expect(amount).toBe(0);
  });
  it('computes the real amount for a recognized deductible item', () => {
    const amount = calculateItemDeferredTax({ classification: 'deductible', temporaryDifference: 1000, recognized: true }, 27);
    expect(amount).toBe(270);
  });
});

describe('recalculateItem', () => {
  it('re-derives classification/temporaryDifference/deferredTaxAmount from carryingAmount/taxBase', () => {
    const result = recalculateItem(item({ carryingAmount: 1000, taxBase: 400, recognized: false }), 27);
    expect(result.classification).toBe('taxable');
    expect(result.temporaryDifference).toBe(600);
    expect(result.recognized).toBe(true); // forced true for a taxable item
    expect(result.deferredTaxAmount).toBe(162); // 600 * 0.27
  });

  it('respects an explicit recognized flag on a deductible item', () => {
    const notRecognized = recalculateItem(item({ carryingAmount: 400, taxBase: 1000, recognized: false }), 27);
    expect(notRecognized.classification).toBe('deductible');
    expect(notRecognized.deferredTaxAmount).toBe(0);

    const recognized = recalculateItem(item({ carryingAmount: 400, taxBase: 1000, recognized: true }), 27);
    expect(recognized.deferredTaxAmount).toBe(162); // 600 * 0.27
  });
});

describe('suggestFixedAssetTemporaryDifferences', () => {
  const rows: TaxRegisterRow[] = [
    {
      assetId: 'fa1',
      assetNumber: 'FA-0001',
      name: 'Delivery Van',
      category: 'motor_vehicles',
      cost: 100000,
      acquisitionDate: '2024-01-01',
      accountingCarryingValue: 70000,
      taxWearTearRatePercent: 20,
      taxWrittenDownValue: 40000,
      temporaryDifference: -30000,
    },
    {
      // No wear-and-tear rate set — must be skipped.
      assetId: 'fa2',
      assetNumber: 'FA-0002',
      name: 'Office Chair',
      category: 'furniture_and_fittings',
      cost: 2000,
      acquisitionDate: '2024-01-01',
      accountingCarryingValue: 1500,
    },
    {
      // Accounting and tax values coincide exactly — nothing real to report.
      assetId: 'fa3',
      assetNumber: 'FA-0003',
      name: 'Laptop',
      category: 'computer_equipment',
      cost: 20000,
      acquisitionDate: '2024-01-01',
      accountingCarryingValue: 10000,
      taxWearTearRatePercent: 50,
      taxWrittenDownValue: 10000,
      temporaryDifference: 0,
    },
  ];

  it('suggests one item per asset with a real difference, skipping unset-rate and zero-difference assets', () => {
    const items = suggestFixedAssetTemporaryDifferences(rows, 27);
    expect(items).toHaveLength(1);
    const [van] = items;
    expect(van.source).toBe('fixed_asset');
    expect(van.sourceId).toBe('fa1');
    // accountingCarryingValue (70000) > taxWrittenDownValue (40000) => taxable, always recognized.
    expect(van.classification).toBe('taxable');
    expect(van.carryingAmount).toBe(70000);
    expect(van.taxBase).toBe(40000);
    expect(van.temporaryDifference).toBe(30000);
    expect(van.recognized).toBe(true);
    expect(van.deferredTaxAmount).toBe(8100); // 30000 * 0.27
  });
});

describe('calculateDeferredTaxTotals', () => {
  it('sums taxable items into the liability and only recognized deductible items into the asset', () => {
    const items = [
      item({ id: 'a', classification: 'taxable', deferredTaxAmount: 100 }),
      item({ id: 'b', classification: 'taxable', deferredTaxAmount: 50 }),
      item({ id: 'c', classification: 'deductible', recognized: true, deferredTaxAmount: 30 }),
      item({ id: 'd', classification: 'deductible', recognized: false, deferredTaxAmount: 0 }),
    ];
    const totals = calculateDeferredTaxTotals(items);
    expect(totals.totalDeferredTaxLiability).toBe(150);
    expect(totals.totalDeferredTaxAsset).toBe(30);
    expect(totals.netDeferredTaxLiability).toBe(120);
  });
});

describe('findMostRecentPostedBefore', () => {
  function computation(overrides: Partial<DeferredTaxComputation>): DeferredTaxComputation {
    return {
      id: 'c1',
      companyId: 'comp_1',
      financialYearId: 'fy1',
      financialYearLabel: 'FY',
      asOfDate: '2026-12-31',
      status: 'posted',
      taxRatePercent: 27,
      taxConfigId: 'cfg1',
      taxConfigTaxYearLabel: '2026/27',
      items: [],
      totalDeferredTaxLiability: 0,
      totalDeferredTaxAsset: 0,
      netDeferredTaxLiability: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('finds the most recent posted computation strictly before the given date, for the right company', () => {
    const older = computation({ id: 'c_old', asOfDate: '2025-12-31' });
    const newer = computation({ id: 'c_new', asOfDate: '2026-12-31' });
    const draft = computation({ id: 'c_draft', asOfDate: '2026-06-30', status: 'draft' });
    const otherCompany = computation({ id: 'c_other', asOfDate: '2026-06-30', companyId: 'comp_2' });

    const result = findMostRecentPostedBefore([older, newer, draft, otherCompany], 'comp_1', '2027-12-31');
    expect(result?.id).toBe('c_new');
  });

  it('excludes drafts, other companies, and dates on/after the boundary, and returns undefined if none qualify', () => {
    const onBoundary = computation({ id: 'c_boundary', asOfDate: '2026-12-31' });
    expect(findMostRecentPostedBefore([onBoundary], 'comp_1', '2026-12-31')).toBeUndefined();
  });

  it('excludes the excluded id', () => {
    const only = computation({ id: 'self', asOfDate: '2025-01-01' });
    expect(findMostRecentPostedBefore([only], 'comp_1', '2026-01-01', 'self')).toBeUndefined();
  });
});
