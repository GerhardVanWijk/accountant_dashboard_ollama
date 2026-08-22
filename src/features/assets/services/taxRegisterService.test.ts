import { describe, it, expect } from 'vitest';
import { TaxRegisterService } from './taxRegisterService';
import type { FixedAsset } from '@/types';

function makeAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'fa_1',
    assetNumber: 'FA-0001',
    name: 'Test Asset',
    category: 'computer_equipment',
    acquisitionDate: '2025-08-22T00:00:00.000Z',
    cost: 30000,
    residualValue: 0,
    usefulLifeYears: 3,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 10000,
    status: 'active',
    taxWearTearRatePercent: 33.3,
    createdAt: '2025-08-22T00:00:00.000Z',
    updatedAt: '2025-08-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('TaxRegisterService.getTaxRegister', () => {
  it('excludes draft (never-capitalized) assets', async () => {
    const service = new TaxRegisterService({ getAll: async () => [makeAsset({ status: 'draft' })] });
    const rows = await service.getTaxRegister('2026-08-22');
    expect(rows).toHaveLength(0);
  });

  it('computes the tax written-down value one full year after acquisition', async () => {
    const service = new TaxRegisterService({ getAll: async () => [makeAsset()] });
    const rows = await service.getTaxRegister('2026-08-22'); // ~1 year after acquisitionDate (365 days; years are averaged at 365.25 days)
    expect(rows).toHaveLength(1);
    // annual allowance = 30000 * 33.3% = 9990, ~1 year elapsed -> written down ~= 30000 - 9990 = 20010
    expect(rows[0].taxWrittenDownValue).toBeCloseTo(20010, -2);
    expect(rows[0].accountingCarryingValue).toBe(20000); // 30000 - 10000 accumulated
    expect(rows[0].temporaryDifference).toBeCloseTo(10, -2);
  });

  it('leaves tax fields undefined when no wear-and-tear rate is set', async () => {
    const service = new TaxRegisterService({ getAll: async () => [makeAsset({ taxWearTearRatePercent: undefined })] });
    const rows = await service.getTaxRegister('2026-08-22');
    expect(rows[0].taxWrittenDownValue).toBeUndefined();
    expect(rows[0].temporaryDifference).toBeUndefined();
  });

  it('never lets the tax written-down value exceed cost, even many years later', async () => {
    const service = new TaxRegisterService({ getAll: async () => [makeAsset({ acquisitionDate: '2000-01-01' })] });
    const rows = await service.getTaxRegister('2026-08-22');
    expect(rows[0].taxWrittenDownValue).toBeGreaterThanOrEqual(0);
    expect(rows[0].taxWrittenDownValue).toBeLessThanOrEqual(30000);
  });
});
