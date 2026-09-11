import { describe, it, expect } from 'vitest';
import {
  addYears,
  daysInYear,
  endOfMonth,
  endOfMonthPlus,
  estimateAsOf,
  inclusiveDays,
  isLeapYear,
  planAssetDepreciation,
  round2,
  startOfMonth,
  type AssetDepreciationInput,
  type EstimateRevisionSnapshot,
} from './depreciationMath';

function asset(overrides: Partial<AssetDepreciationInput> = {}): AssetDepreciationInput {
  return {
    id: 'a1',
    assetNumber: 'FA-0001',
    cost: 36500,
    residualValue: 0,
    usefulLifeYears: 1,
    depreciationMethod: 'straight_line',
    acquisitionDate: '2026-01-01',
    accumulatedDepreciation: 0,
    ...overrides,
  };
}

describe('date helpers', () => {
  it('endOfMonth / startOfMonth', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(startOfMonth('2026-02-10')).toBe('2026-02-01');
  });
  it('endOfMonthPlus rolls the month, not the day', () => {
    expect(endOfMonthPlus('2026-01-31', 1)).toBe('2026-02-28');
    expect(endOfMonthPlus('2026-02-28', 1)).toBe('2026-03-31');
  });
  it('inclusiveDays counts both ends', () => {
    expect(inclusiveDays('2026-01-15', '2026-01-31')).toBe(17);
    expect(inclusiveDays('2026-01-01', '2026-12-31')).toBe(365);
  });
  it('addYears counts fractional years as calendar days', () => {
    expect(addYears('2026-01-01', 1)).toBe('2027-01-01');
    expect(addYears('2026-01-01', 5)).toBe('2031-01-01');
  });
  it('round2', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10);
  });
});

describe('day-count convention — actual/actual (365 ordinary, 366 leap)', () => {
  it('isLeapYear', () => {
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
  it('daysInYear', () => {
    expect(daysInYear(2025)).toBe(365);
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
  });
  it('inclusiveDays over a whole leap year is 366', () => {
    expect(inclusiveDays('2028-01-01', '2028-12-31')).toBe(366);
    expect(inclusiveDays('2028-02-01', '2028-02-29')).toBe(29);
  });
});

describe('planAssetDepreciation — straight line', () => {
  it('day-count prorates the first month from the acquisition date', () => {
    const plan = planAssetDepreciation(asset({ acquisitionDate: '2026-01-15' }), [], '2026-01-31');
    expect(plan.periods).toHaveLength(1);
    // 36500 / 365 days = 100/day; 15–31 Jan inclusive = 17 days
    expect(plan.periods[0].amount).toBeCloseTo(1700, 2);
    expect(plan.periods[0].days).toBe(17);
    expect(plan.periods[0].periodEnd).toBe('2026-01-31');
  });

  it('charges a whole month when acquired on the first', () => {
    const plan = planAssetDepreciation(asset(), [], '2026-01-31');
    expect(plan.periods[0].amount).toBeCloseTo(3100, 2); // 31 days
  });

  it('catches up every unposted month in one call, as separate periods', () => {
    const plan = planAssetDepreciation(asset({ acquisitionDate: '2026-01-15' }), [], '2026-03-31');
    expect(plan.periods.map((p) => p.periodEnd)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(plan.periods.map((p) => p.days)).toEqual([17, 28, 31]);
    expect(plan.totalAmount).toBeCloseTo(7600, 2); // 100/day * (17+28+31)
  });

  it('does not re-post a month that already has a charge', () => {
    const plan = planAssetDepreciation(asset({ acquisitionDate: '2026-01-15' }), ['2026-01-31'], '2026-02-28');
    expect(plan.periods.map((p) => p.periodEnd)).toEqual(['2026-02-28']);
  });

  it('never starts before the acquisition date', () => {
    const plan = planAssetDepreciation(asset({ acquisitionDate: '2026-07-01' }), [], '2026-03-31');
    expect(plan.periods).toHaveLength(0);
    expect(plan.totalAmount).toBe(0);
  });

  it('exhausts exactly the depreciable base over the useful life', () => {
    const plan = planAssetDepreciation(asset(), [], '2026-12-31');
    expect(plan.periods).toHaveLength(12);
    expect(plan.totalAmount).toBeCloseTo(36500, 2);
    expect(plan.periods[11].carryingValueAfter).toBeCloseTo(0, 2);
  });

  it('respects residual value — never depreciates below it', () => {
    const plan = planAssetDepreciation(asset({ cost: 40000, residualValue: 3500 }), [], '2026-12-31');
    expect(plan.totalAmount).toBeCloseTo(36500, 2);
    expect(plan.periods[plan.periods.length - 1].carryingValueAfter).toBeCloseTo(3500, 2);
  });

  it('clips the final month at a mid-month target (disposal)', () => {
    const plan = planAssetDepreciation(asset(), [], '2026-02-15');
    expect(plan.periods.map((p) => p.periodEnd)).toEqual(['2026-01-31', '2026-02-15']);
    expect(plan.periods[1].days).toBe(15);
  });

  it('returns nothing once fully depreciated', () => {
    const plan = planAssetDepreciation(asset({ accumulatedDepreciation: 36500 }), [], '2027-06-30');
    expect(plan.periods).toHaveLength(0);
  });

  it('re-spreads the remaining base prospectively after an estimate change (longer life)', () => {
    // half a year in at 100/day, ~18300 booked; life extended to 2 years
    const plan = planAssetDepreciation(
      asset({ usefulLifeYears: 2, accumulatedDepreciation: 18300, acquisitionDate: '2026-01-01' }),
      Array.from({ length: 6 }, (_, i) => endOfMonth(`2026-0${i + 1}-01`)),
      '2026-07-31',
    );
    // remaining 18200 over the remaining ~18 months → clearly less than the old 100/day pace
    expect(plan.periods).toHaveLength(1);
    expect(plan.periods[0].amount).toBeLessThan(3100);
    expect(plan.periods[0].amount).toBeGreaterThan(0);
  });
});

describe('planAssetDepreciation — reducing balance', () => {
  const rb = (o: Partial<AssetDepreciationInput> = {}) =>
    asset({ depreciationMethod: 'reducing_balance', reducingBalanceRatePercent: 40, cost: 100000, usefulLifeYears: 5, ...o });

  it('applies the annual rate to the carrying value, day-count prorated on the real year length', () => {
    const plan = planAssetDepreciation(rb(), [], '2026-01-31');
    // 100000 * 40% * 31/365 (2026 is an ordinary year)
    expect(plan.periods[0].amount).toBeCloseTo(100000 * 0.4 * (31 / 365), 2);
  });

  it('uses a 366-day denominator for a charge that falls in a leap year', () => {
    const plan = planAssetDepreciation(
      rb({ acquisitionDate: '2028-02-01' }),
      [],
      '2028-02-29',
    );
    // 29 days in Feb 2028, denominator 366
    expect(plan.periods[0].days).toBe(29);
    expect(plan.periods[0].amount).toBeCloseTo(100000 * 0.4 * (29 / 366), 2);
  });

  it('per-day charge decreases each month as the carrying value falls', () => {
    const plan = planAssetDepreciation(rb(), [], '2026-04-30');
    const perDay = plan.periods.map((p) => p.amount / p.days);
    expect(perDay).toHaveLength(4);
    for (let i = 1; i < perDay.length; i++) expect(perDay[i]).toBeLessThan(perDay[i - 1]);
    // carrying value is strictly monotonic regardless of month length
    const cv = plan.periods.map((p) => p.carryingValueAfter);
    for (let i = 1; i < cv.length; i++) expect(cv[i]).toBeLessThan(cv[i - 1]);
  });

  it('never drives the carrying value below residual', () => {
    const plan = planAssetDepreciation(rb({ residualValue: 90000 }), [], '2026-12-31');
    expect(plan.periods[plan.periods.length - 1].carryingValueAfter).toBeGreaterThanOrEqual(90000 - 0.01);
  });

  it('throws when no rate is set', () => {
    expect(() =>
      planAssetDepreciation(asset({ depreciationMethod: 'reducing_balance', reducingBalanceRatePercent: undefined }), [], '2026-01-31'),
    ).toThrow(/reducingBalanceRatePercent/);
  });
});

describe('estimateAsOf — precedence', () => {
  const baseline: EstimateRevisionSnapshot = {
    effectiveDate: '2026-01-01', usefulLifeYears: 5, residualValue: 0, depreciationMethod: 'straight_line',
  };
  const jul: EstimateRevisionSnapshot = { effectiveDate: '2026-07-01', usefulLifeYears: 7, residualValue: 20000, depreciationMethod: 'straight_line' };
  const nov: EstimateRevisionSnapshot = { effectiveDate: '2026-11-01', usefulLifeYears: 8, residualValue: 25000, depreciationMethod: 'straight_line' };

  it('returns the baseline before the first revision, and each revision from its effective date', () => {
    expect(estimateAsOf(baseline, [jul, nov], '2026-06-01')).toBe(baseline);
    expect(estimateAsOf(baseline, [jul, nov], '2026-07-01')).toBe(jul);
    expect(estimateAsOf(baseline, [jul, nov], '2026-10-01')).toBe(jul);
    expect(estimateAsOf(baseline, [jul, nov], '2026-11-01')).toBe(nov);
    expect(estimateAsOf(baseline, [jul, nov], '2027-03-01')).toBe(nov);
  });

  it('does not require the timeline to be pre-sorted', () => {
    expect(estimateAsOf(baseline, [nov, jul], '2026-08-01')).toBe(jul);
  });
});

describe('planAssetDepreciation — effective-dated estimate revisions', () => {
  // Acquired 1 May 2026: 5-year life, R0 residual, straight line, cost 120000.
  const may = () => asset({ cost: 120000, residualValue: 0, usefulLifeYears: 5, acquisitionDate: '2026-05-01', assetNumber: 'FA-REV' });
  // Revision effective 1 July: 7-year total life, R20 000 residual.
  const julyRevision: EstimateRevisionSnapshot = {
    effectiveDate: '2026-07-01', usefulLifeYears: 7, residualValue: 20000, depreciationMethod: 'straight_line',
  };

  it('uses the OLD estimate for May & June and the NEW estimate for July onward', () => {
    const withRev = planAssetDepreciation(may(), [], '2026-09-30', [julyRevision]);
    const noRev = planAssetDepreciation(may(), [], '2026-09-30', []);

    expect(withRev.periods.map((p) => p.periodEnd)).toEqual(['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30']);

    // May & June identical to the un-revised plan (old estimate governs them)
    expect(withRev.periods[0].amount).toBeCloseTo(noRev.periods[0].amount, 2);
    expect(withRev.periods[1].amount).toBeCloseTo(noRev.periods[1].amount, 2);

    // July onward: revised (longer life + higher residual) → a strictly lower per-day charge than the old estimate would give
    const oldJulyPerDay = noRev.periods[2].amount / noRev.periods[2].days;
    const newJulyPerDay = withRev.periods[2].amount / withRev.periods[2].days;
    expect(newJulyPerDay).toBeLessThan(oldJulyPerDay);
  });

  it('never lets accumulated depreciation cross the revised residual floor', () => {
    const plan = planAssetDepreciation(may(), [], '2033-12-31', [julyRevision]);
    const last = plan.periods[plan.periods.length - 1];
    expect(last.carryingValueAfter).toBeGreaterThanOrEqual(20000 - 0.01);
  });

  it('applies two sequential revisions, each from its own effective month', () => {
    const nov: EstimateRevisionSnapshot = { effectiveDate: '2026-11-01', usefulLifeYears: 10, residualValue: 30000, depreciationMethod: 'straight_line' };
    const plan = planAssetDepreciation(may(), [], '2026-12-31', [julyRevision, nov]);
    // per-day charge steps DOWN at July and again at November (each revision lengthens life / raises residual)
    const perDay = plan.periods.map((p) => round2(p.amount / p.days));
    expect(perDay[1]).toBeGreaterThan(perDay[2]); // June (old) > July (rev 1)
    expect(perDay[5]).toBeGreaterThan(perDay[6]); // October (rev 1) > November (rev 2)
  });

  it('leaves an already-posted month untouched even when a revision would change it', () => {
    // June already posted; revision effective July should not disturb June or May
    const plan = planAssetDepreciation(may(), ['2026-05-31', '2026-06-30'], '2026-08-31', [julyRevision]);
    expect(plan.periods.map((p) => p.periodEnd)).toEqual(['2026-07-31', '2026-08-31']);
  });
});
