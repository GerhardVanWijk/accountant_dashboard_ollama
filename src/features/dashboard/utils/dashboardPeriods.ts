export type DashboardPeriodKey = '3m' | '6m' | '12m' | 'financial-year' | 'ytd' | 'custom';

export interface DashboardPeriod {
  key: DashboardPeriodKey;
  label: string;
  startDate: string;
  endDate: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

export function resolveDashboardPeriod(key: DashboardPeriodKey, asOf = new Date()): DashboardPeriod {
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const year = end.getUTCFullYear();
  const fyStartYear = end.getUTCMonth() >= 2 ? year : year - 1;

  if (key === 'financial-year') {
    return { key, label: 'Financial year', startDate: `${fyStartYear}-03-01`, endDate: isoDate(end) };
  }
  if (key === 'ytd') {
    return { key, label: 'YTD', startDate: `${year}-01-01`, endDate: isoDate(end) };
  }

  const monthCount = key === '3m' ? 3 : key === '6m' ? 6 : 12;
  const start = addMonths(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)), -(monthCount - 1));
  return { key, label: `${monthCount} months`, startDate: isoDate(start), endDate: isoDate(end) };
}

export function filterMonthlyFinancialsByPeriod<T extends { month: string }>(months: T[], period: DashboardPeriod): T[] {
  const startMonth = period.startDate.slice(0, 7);
  const endMonth = period.endDate.slice(0, 7);
  return months.filter((month) => month.month >= startMonth && month.month <= endMonth);
}
