import { describe, it, expect } from 'vitest';
import { calculateProvisionalTaxDueDates } from './provisionalTaxDueDates';

describe('calculateProvisionalTaxDueDates', () => {
  it('computes first/second/top-up due dates for a plain calendar-year financial year', () => {
    const dueDates = calculateProvisionalTaxDueDates({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
    });

    expect(dueDates.first.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(dueDates.second.toISOString().slice(0, 10)).toBe('2026-12-31');
    // 31 Dec 2026 + 6 months -> 31 June doesn't exist, clamps to 30 June 2027.
    expect(dueDates.topUp.toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('clamps the first payment into the leap-year 29 February when the financial year spans a leap year', () => {
    // FY runs 31 Aug 2023 -> 30 Aug 2024, spanning Feb 2024 (a leap year).
    const dueDates = calculateProvisionalTaxDueDates({
      startDate: '2023-08-31T00:00:00.000Z',
      endDate: '2024-08-30T23:59:59.999Z',
    });

    // 31 Aug 2023 + 6 months -> 31 Feb doesn't exist; 2024 is a leap year, so it clamps to 29 Feb (not 28).
    expect(dueDates.first.toISOString().slice(0, 10)).toBe('2024-02-29');
    expect(dueDates.second.toISOString().slice(0, 10)).toBe('2024-08-30');
    // 30 Aug 2024 + 6 months -> 30 Feb doesn't exist; 2025 is NOT a leap year, so it clamps to 28 Feb.
    expect(dueDates.topUp.toISOString().slice(0, 10)).toBe('2025-02-28');
  });

  it('preserves the day-of-month when the target month is long enough', () => {
    const dueDates = calculateProvisionalTaxDueDates({
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2027-02-28T23:59:59.999Z',
    });

    expect(dueDates.first.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(dueDates.topUp.toISOString().slice(0, 10)).toBe('2027-08-28');
  });
});
