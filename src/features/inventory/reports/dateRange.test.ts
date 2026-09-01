import { describe, expect, it } from 'vitest';
import type { FinancialYear } from '@/types';
import { isWithinDateRange, resolveDateRangePreset } from './dateRange';

function fy(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: 'fy_1',
    companyId: 'co_1',
    name: 'FY2026',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    status: 'open',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('resolveDateRangePreset', () => {
  const ref = new Date(Date.UTC(2026, 8, 15)); // 15 Sep 2026

  it('resolves this_month to the full calendar month', () => {
    expect(resolveDateRangePreset('this_month', ref)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('resolves last_month, including a December-to-January year rollover', () => {
    expect(resolveDateRangePreset('last_month', ref)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    const jan = new Date(Date.UTC(2026, 0, 15));
    expect(resolveDateRangePreset('last_month', jan)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });

  it('resolves this_quarter to the calendar quarter', () => {
    expect(resolveDateRangePreset('this_quarter', ref)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('resolves this_financial_year to the FY containing the reference date', () => {
    expect(resolveDateRangePreset('this_financial_year', ref, [fy()])).toEqual({ start: '2026-03-01', end: '2027-02-28' });
  });

  it('falls back to the most recently started financial year when none contains the reference date', () => {
    const older = fy({ id: 'fy_0', name: 'FY2025', startDate: '2025-03-01', endDate: '2026-02-28' });
    const future = new Date(Date.UTC(2027, 5, 1)); // past both years
    expect(resolveDateRangePreset('this_financial_year', future, [older, fy()])).toEqual({ start: '2026-03-01', end: '2027-02-28' });
  });

  it('returns null for this_financial_year when the company has no financial years', () => {
    expect(resolveDateRangePreset('this_financial_year', ref, [])).toBeNull();
  });

  it('returns null for custom — the caller owns start/end', () => {
    expect(resolveDateRangePreset('custom', ref)).toBeNull();
  });
});

describe('isWithinDateRange', () => {
  it('includes both endpoints and rejects outside dates, tolerating a full timestamp', () => {
    const range = { start: '2026-09-01', end: '2026-09-30' };
    expect(isWithinDateRange('2026-09-01', range)).toBe(true);
    expect(isWithinDateRange('2026-09-30T23:59:59.000Z', range)).toBe(true);
    expect(isWithinDateRange('2026-08-31', range)).toBe(false);
    expect(isWithinDateRange('2026-10-01', range)).toBe(false);
  });
});
