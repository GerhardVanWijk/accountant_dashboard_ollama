import { describe, it, expect } from 'vitest';
import {
  calculateAccountingProfit,
  calculateDepreciationAddback,
  calculateFlatTaxLiability,
  calculateSbcTaxLiability,
  calculateTaxLiability,
  calculateTaxableIncome,
  calculateWearAndTearAllowanceForPeriod,
  netAdjustmentAmount,
  suggestDisposalAddbackAdjustments,
} from './taxComputationCalculations';
import { seedIncomeTaxConfig } from '@/mock-data/corporateTaxConfig';
import type { Account, AssetDisposal, FixedAsset, JournalEntry, SbcTaxBracket, TaxAdjustment } from '@/types';

const REVENUE_ACCOUNT: Account = {
  id: 'acc_rev',
  code: '4000',
  name: 'Sales Revenue',
  type: 'revenue',
  normalBalance: 'credit',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_ACCOUNT: Account = {
  id: 'acc_exp',
  code: '5000',
  name: 'Operating Expenses',
  type: 'expense',
  normalBalance: 'debit',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const OTHER_ACCOUNT: Account = {
  id: 'acc_1000',
  code: '1000',
  name: 'Cash and Bank',
  type: 'asset',
  normalBalance: 'debit',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_1',
    entryNumber: 'JE-0001',
    date: '2026-06-15T00:00:00.000Z',
    lines: [],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const FY_START = '2026-01-01T00:00:00.000Z';
const FY_END = '2026-12-31T23:59:59.999Z';

describe('calculateAccountingProfit', () => {
  const accounts = [REVENUE_ACCOUNT, EXPENSE_ACCOUNT, OTHER_ACCOUNT];

  it('sums revenue-type net movement minus expense-type net movement, within range only', () => {
    const entries: JournalEntry[] = [
      makeEntry({
        id: 'je_1',
        date: '2026-03-01T00:00:00.000Z',
        lines: [
          { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 1000, credit: 0 },
          { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 1000 },
        ],
      }),
      makeEntry({
        id: 'je_2',
        date: '2026-06-01T00:00:00.000Z',
        lines: [
          { id: 'l1', accountId: EXPENSE_ACCOUNT.id, debit: 400, credit: 0 },
          { id: 'l2', accountId: OTHER_ACCOUNT.id, debit: 0, credit: 400 },
        ],
      }),
      // Outside the range — must be excluded.
      makeEntry({
        id: 'je_3',
        date: '2027-01-15T00:00:00.000Z',
        lines: [
          { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 5000, credit: 0 },
          { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 5000 },
        ],
      }),
    ];

    expect(calculateAccountingProfit(entries, accounts, FY_START, FY_END)).toBeCloseTo(600, 2);
  });

  it('excludes non-posted entries', () => {
    const entries: JournalEntry[] = [
      makeEntry({
        status: 'reversed',
        lines: [
          { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 1000, credit: 0 },
          { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 1000 },
        ],
      }),
    ];
    expect(calculateAccountingProfit(entries, accounts, FY_START, FY_END)).toBe(0);
  });

  it('a reversal entry nets a reversed transaction back to zero automatically', () => {
    const original = makeEntry({
      id: 'je_orig',
      date: '2026-03-01T00:00:00.000Z',
      lines: [
        { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 1000, credit: 0 },
        { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 1000 },
      ],
    });
    const reversal = makeEntry({
      id: 'je_rev',
      date: '2026-03-02T00:00:00.000Z',
      reversalOfEntryId: 'je_orig',
      lines: [
        { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 0, credit: 1000 },
        { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 1000, credit: 0 },
      ],
    });
    expect(calculateAccountingProfit([original, reversal], accounts, FY_START, FY_END)).toBe(0);
  });

  it('boundary dates at the exact start/end of the range are included', () => {
    const entries: JournalEntry[] = [
      makeEntry({
        id: 'je_start',
        date: FY_START,
        lines: [
          { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 100, credit: 0 },
          { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 100 },
        ],
      }),
      makeEntry({
        id: 'je_end',
        date: FY_END,
        lines: [
          { id: 'l1', accountId: OTHER_ACCOUNT.id, debit: 50, credit: 0 },
          { id: 'l2', accountId: REVENUE_ACCOUNT.id, debit: 0, credit: 50 },
        ],
      }),
    ];
    expect(calculateAccountingProfit(entries, accounts, FY_START, FY_END)).toBeCloseTo(150, 2);
  });
});

describe('calculateDepreciationAddback', () => {
  it('sums only acc_5200 debit-credit movement within range', () => {
    const entries: JournalEntry[] = [
      makeEntry({
        date: '2026-02-01T00:00:00.000Z',
        lines: [
          { id: 'l1', accountId: 'acc_5200', debit: 300, credit: 0 },
          { id: 'l2', accountId: 'acc_1590', debit: 0, credit: 300 },
        ],
      }),
      makeEntry({
        date: '2027-02-01T00:00:00.000Z', // outside range
        lines: [
          { id: 'l1', accountId: 'acc_5200', debit: 999, credit: 0 },
          { id: 'l2', accountId: 'acc_1590', debit: 0, credit: 999 },
        ],
      }),
    ];
    expect(calculateDepreciationAddback(entries, FY_START, FY_END)).toBeCloseTo(300, 2);
  });
});

function makeAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'fa_1',
    assetNumber: 'FA-0001',
    name: 'Test Asset',
    category: 'plant_and_machinery',
    acquisitionDate: '2026-01-01T00:00:00.000Z',
    cost: 100000,
    residualValue: 0,
    usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0,
    status: 'active',
    taxWearTearRatePercent: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calculateWearAndTearAllowanceForPeriod', () => {
  it('a full-year-held asset gets the full annual allowance', () => {
    const asset = makeAsset({ cost: 100000, taxWearTearRatePercent: 20, acquisitionDate: '2026-01-01T00:00:00.000Z' });
    // 100000 * 20% = 20000, held the whole 2026 period.
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBeCloseTo(20000, 0);
  });

  it('prorates for an asset acquired mid-period', () => {
    // Acquired exactly at the period's halfway point (2026 is a leap year, 366 days -> July 2 is day 183 of 366).
    const asset = makeAsset({ cost: 100000, taxWearTearRatePercent: 20, acquisitionDate: '2026-07-02T00:00:00.000Z' });
    const result = calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END);
    // Roughly half of the 20000 annual allowance — allow a reasonable tolerance for day-count rounding.
    expect(result).toBeGreaterThan(9000);
    expect(result).toBeLessThan(11000);
  });

  it('excludes an asset disposed before the period started', () => {
    const asset = makeAsset({ disposalDate: '2025-06-01T00:00:00.000Z' });
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBe(0);
  });

  it('excludes an asset acquired after the period ended', () => {
    const asset = makeAsset({ acquisitionDate: '2027-06-01T00:00:00.000Z' });
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBe(0);
  });

  it('excludes draft assets', () => {
    const asset = makeAsset({ status: 'draft' });
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBe(0);
  });

  it('excludes assets with no taxWearTearRatePercent set', () => {
    const asset = makeAsset({ taxWearTearRatePercent: undefined });
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBe(0);
  });

  it('caps cumulative allowance so it never exceeds cost — an asset already fully allowed claims nothing further', () => {
    // Acquired 6 years ago at a 20% rate -> already fully written off for tax purposes.
    const asset = makeAsset({ cost: 100000, taxWearTearRatePercent: 20, acquisitionDate: '2020-01-01T00:00:00.000Z' });
    expect(calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END)).toBe(0);
  });

  it('caps the final partial period so cumulative allowance lands exactly at cost', () => {
    // Acquired just under 5 years before the period start at a 20% rate (5-year write-off) —
    // only a sliver of allowance should remain for this period.
    const acquisitionDate = new Date(new Date(FY_START).getTime() - 4.9 * 365.25 * 24 * 60 * 60 * 1000).toISOString();
    const asset = makeAsset({ cost: 100000, taxWearTearRatePercent: 20, acquisitionDate });
    const result = calculateWearAndTearAllowanceForPeriod([asset], FY_START, FY_END);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(20000); // less than a full year's allowance — the cap bit
  });
});

function makeDisposal(overrides: Partial<AssetDisposal> = {}): AssetDisposal {
  return {
    id: 'disp_1',
    assetId: 'fa_1',
    disposalDate: '2026-06-01T00:00:00.000Z',
    proceeds: 5000,
    carryingValueAtDisposal: 4000,
    accumulatedDepreciationAtDisposal: 96000,
    gainLoss: 1000,
    journalEntryId: 'je_disp',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('suggestDisposalAddbackAdjustments', () => {
  const asset = makeAsset();

  it('suggests a subtract line for a gain (remove it from taxable income)', () => {
    const disposal = makeDisposal({ gainLoss: 1500 });
    const [line] = suggestDisposalAddbackAdjustments([disposal], [asset], FY_START, FY_END);
    expect(line.direction).toBe('subtract');
    expect(line.amount).toBeCloseTo(1500, 2);
    expect(line.category).toBe('disposal_gain_loss_addback');
  });

  it('suggests an add line for a loss (add it back)', () => {
    const disposal = makeDisposal({ gainLoss: -800 });
    const [line] = suggestDisposalAddbackAdjustments([disposal], [asset], FY_START, FY_END);
    expect(line.direction).toBe('add');
    expect(line.amount).toBeCloseTo(800, 2);
  });

  it('produces no line for a zero gainLoss', () => {
    const disposal = makeDisposal({ gainLoss: 0 });
    expect(suggestDisposalAddbackAdjustments([disposal], [asset], FY_START, FY_END)).toHaveLength(0);
  });

  it('excludes disposals outside the period', () => {
    const disposal = makeDisposal({ disposalDate: '2027-01-01T00:00:00.000Z' });
    expect(suggestDisposalAddbackAdjustments([disposal], [asset], FY_START, FY_END)).toHaveLength(0);
  });
});

describe('netAdjustmentAmount / calculateTaxableIncome', () => {
  it('sums add lines positively and subtract lines negatively', () => {
    const adjustments: TaxAdjustment[] = [
      { id: 'a1', category: 'other', description: 'x', amount: 100, direction: 'add' },
      { id: 'a2', category: 'other', description: 'y', amount: 40, direction: 'subtract' },
    ];
    expect(netAdjustmentAmount(adjustments)).toBeCloseTo(60, 2);
    expect(calculateTaxableIncome(1000, adjustments)).toBeCloseTo(1060, 2);
  });
});

describe('calculateFlatTaxLiability', () => {
  it('applies the flat rate to positive taxable income', () => {
    expect(calculateFlatTaxLiability(100000, 27)).toBeCloseTo(27000, 2);
  });

  it('owes nothing on an assessed loss', () => {
    expect(calculateFlatTaxLiability(-50000, 27)).toBe(0);
  });
});

describe('calculateSbcTaxLiability', () => {
  const brackets: SbcTaxBracket[] = seedIncomeTaxConfig[0].sbcBrackets;

  it('owes nothing at the top of the 0% band', () => {
    expect(calculateSbcTaxLiability(99000, brackets)).toBe(0);
  });

  it('owes exactly 7% of the first rand above R99,000', () => {
    expect(calculateSbcTaxLiability(99001, brackets)).toBeCloseTo(0.07, 2);
  });

  it('at exactly R365,000 owes exactly R18,620 (continuous with the next bracket\'s base)', () => {
    expect(calculateSbcTaxLiability(365000, brackets)).toBeCloseTo(18620, 2);
  });

  it('just above R365,000 owes the base plus 21% of the excess', () => {
    expect(calculateSbcTaxLiability(365001, brackets)).toBeCloseTo(18620.21, 2);
  });

  it('at exactly R550,000 owes exactly R57,470 (continuous with the top bracket\'s base)', () => {
    expect(calculateSbcTaxLiability(550000, brackets)).toBeCloseTo(57470, 2);
  });

  it('just above R550,000 owes the base plus 27% of the excess', () => {
    expect(calculateSbcTaxLiability(550001, brackets)).toBeCloseTo(57470.27, 2);
  });

  it('a large taxable income uses the top unbounded bracket', () => {
    expect(calculateSbcTaxLiability(2000000, brackets)).toBeCloseTo(57470 + (2000000 - 550000) * 0.27, 2);
  });

  it('owes nothing on a loss or zero taxable income', () => {
    expect(calculateSbcTaxLiability(0, brackets)).toBe(0);
    expect(calculateSbcTaxLiability(-1000, brackets)).toBe(0);
  });
});

describe('calculateTaxLiability', () => {
  const config = seedIncomeTaxConfig[0];

  it('dispatches to the SBC bracket table when isSbcEligible is true', () => {
    expect(calculateTaxLiability(365000, true, config)).toBeCloseTo(18620, 2);
  });

  it('dispatches to the flat corporate rate when isSbcEligible is false', () => {
    expect(calculateTaxLiability(365000, false, config)).toBeCloseTo(365000 * 0.27, 2);
  });
});
