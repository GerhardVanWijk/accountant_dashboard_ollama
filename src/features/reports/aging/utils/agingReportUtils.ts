import type { AgingBuckets, AgingReportRow } from '../types';

const EMPTY_BUCKETS: AgingBuckets = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

/**
 * Sums every row's buckets column-by-column — the grand-total footer row
 * for both the Customer Aging and Supplier Aging reports. Pure function,
 * no I/O, safe to unit test in isolation from the fetch/compute pipeline.
 */
export function sumAgingBuckets(rows: AgingReportRow[]): AgingBuckets {
  return rows.reduce(
    (acc, row) => ({
      current: acc.current + row.buckets.current,
      days30: acc.days30 + row.buckets.days30,
      days60: acc.days60 + row.buckets.days60,
      days90Plus: acc.days90Plus + row.buckets.days90Plus,
      total: acc.total + row.buckets.total,
    }),
    { ...EMPTY_BUCKETS },
  );
}

/**
 * Aged Receivables/Payables Summary reports exclude zero-balance
 * customers/suppliers by default (matching how a real accounting package's
 * aging report works) — `showAll` is the report's "show all / show only
 * with balance" filter toggle.
 */
export function filterZeroBalance(rows: AgingReportRow[], showAll: boolean): AgingReportRow[] {
  return showAll ? rows : rows.filter((row) => row.buckets.total > 0);
}

/**
 * Default sort for both aging reports: worst debtors/largest payables
 * first. A stable sort (Array.prototype.sort is stable per spec) keeps
 * equal-total rows in their original (name-derived) order run-to-run.
 */
export function sortByTotalDescending(rows: AgingReportRow[]): AgingReportRow[] {
  return [...rows].sort((a, b) => b.buckets.total - a.buckets.total);
}
