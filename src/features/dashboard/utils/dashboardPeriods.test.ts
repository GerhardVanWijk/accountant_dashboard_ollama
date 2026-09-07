import { describe, expect, it } from 'vitest';
import { filterMonthlyFinancialsByPeriod, resolveDashboardPeriod } from './dashboardPeriods';

const asOf = new Date(Date.UTC(2026, 8, 7));

describe('dashboard period helpers', () => {
  it('resolves 3, 6, 12 month, financial year, and YTD ranges', () => {
    expect(resolveDashboardPeriod('3m', asOf)).toMatchObject({ startDate: '2026-07-01', endDate: '2026-09-07' });
    expect(resolveDashboardPeriod('6m', asOf)).toMatchObject({ startDate: '2026-04-01', endDate: '2026-09-07' });
    expect(resolveDashboardPeriod('12m', asOf)).toMatchObject({ startDate: '2025-10-01', endDate: '2026-09-07' });
    expect(resolveDashboardPeriod('financial-year', asOf)).toMatchObject({ startDate: '2026-03-01', endDate: '2026-09-07' });
    expect(resolveDashboardPeriod('ytd', asOf)).toMatchObject({ startDate: '2026-01-01', endDate: '2026-09-07' });
  });

  it('filters month buckets without needing another fetch', () => {
    const months = [{ month: '2026-06' }, { month: '2026-07' }, { month: '2026-08' }, { month: '2026-09' }];
    expect(filterMonthlyFinancialsByPeriod(months, resolveDashboardPeriod('3m', asOf)).map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  });
});
