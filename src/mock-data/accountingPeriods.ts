import type { AccountingPeriod, AccountingPeriodStatus } from '@/types';

/**
 * The 12 monthly periods of FY2026 for comp_001. January is seeded 'closed'
 * (realistic: a month-end close already happened) so there's a real,
 * demonstrable case of JournalEntryService.postJournalEntry() rejecting a
 * post into a closed period — every other month is 'open'.
 */
export const seedAccountingPeriods: AccountingPeriod[] = Array.from({ length: 12 }, (_, monthIndex) => {
  const month = monthIndex + 1;
  const startDate = new Date(Date.UTC(2026, monthIndex, 1));
  const endDate = new Date(Date.UTC(2026, monthIndex + 1, 0, 23, 59, 59, 999));
  const status: AccountingPeriodStatus = month === 1 ? 'closed' : 'open';

  return {
    id: `period_2026_${String(month).padStart(2, '0')}`,
    companyId: 'comp_001',
    financialYearId: 'fy_2026',
    name: `2026-${String(month).padStart(2, '0')}`,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: status === 'closed' ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
  };
});
