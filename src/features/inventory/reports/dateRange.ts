import type { FinancialYear } from '@/types';

/**
 * One consistent date-range model for every Inventory report that needs one
 * (Phase 8 spec §18/§19) — Movement, Adjustments, Transfers, Stock Take
 * Variance, Slow-Moving. `'custom'` means the caller's own start/end inputs
 * are authoritative; every other preset is resolved here, once, so no report
 * page reimplements "what is 'this month'".
 */
export type DateRangePreset = 'this_month' | 'last_month' | 'this_quarter' | 'this_financial_year' | 'custom';

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  this_financial_year: 'This financial year',
  custom: 'Custom',
};

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function endOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

/**
 * Resolves a preset to a concrete `{ start, end }` against `referenceDate`
 * (normally "today" — a parameter so tests are deterministic). `'custom'`
 * always returns `null`: the caller's own free-text start/end fields are the
 * source of truth for that case, never derived here.
 *
 * `'this_quarter'` uses CALENDAR quarters (Jan–Mar, Apr–Jun, …) — this app
 * has no per-company fiscal-quarter concept distinct from the financial year
 * itself (see `'this_financial_year'` below), so a "quarter" is necessarily
 * the calendar one. Documented limitation, not a silent assumption.
 *
 * `'this_financial_year'` uses the company's REAL `FinancialYear` records
 * (never a hardcoded Jan–Dec or Mar–Feb calendar-year assumption per spec
 * §18) — the one whose `[startDate, endDate]` contains `referenceDate`, or
 * failing that the most recently STARTED financial year, so a report run
 * just after year-end still has a sensible default. Returns `null` when the
 * company has no financial years at all — the caller must show that state
 * honestly rather than fabricate a range.
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  referenceDate: Date,
  financialYears: FinancialYear[] = [],
): DateRange | null {
  const y = referenceDate.getUTCFullYear();
  const m = referenceDate.getUTCMonth();

  switch (preset) {
    case 'this_month':
      return { start: toIsoDate(startOfMonth(y, m)), end: toIsoDate(endOfMonth(y, m)) };
    case 'last_month':
      return { start: toIsoDate(startOfMonth(y, m - 1)), end: toIsoDate(endOfMonth(y, m - 1)) };
    case 'this_quarter': {
      const quarterStartMonth = Math.floor(m / 3) * 3;
      return {
        start: toIsoDate(startOfMonth(y, quarterStartMonth)),
        end: toIsoDate(endOfMonth(y, quarterStartMonth + 2)),
      };
    }
    case 'this_financial_year': {
      if (financialYears.length === 0) return null;
      const ref = toIsoDate(referenceDate);
      const containing = financialYears.find((fy) => fy.startDate.slice(0, 10) <= ref && ref <= fy.endDate.slice(0, 10));
      if (containing) return { start: containing.startDate.slice(0, 10), end: containing.endDate.slice(0, 10) };
      const mostRecent = [...financialYears].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      return { start: mostRecent.startDate.slice(0, 10), end: mostRecent.endDate.slice(0, 10) };
    }
    case 'custom':
      return null;
  }
}

/** `true` when `dateIso` (any ISO date/datetime string) falls within `[range.start, range.end]` inclusive. */
export function isWithinDateRange(dateIso: string, range: DateRange): boolean {
  const d = dateIso.slice(0, 10);
  return d >= range.start && d <= range.end;
}
