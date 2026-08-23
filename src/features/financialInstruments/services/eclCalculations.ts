import type { AgingBucketKey, EclBucketLine, EclComputation, ID } from '@/types';
import type { AgingReportRow } from '@/features/reports/aging/types';

/** Half a cent — same rounding tolerance used across every other posting service in this codebase. */
export const EPSILON = 0.005;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Same bucket order every aging view in this codebase renders in. */
export const AGING_BUCKET_ORDER: AgingBucketKey[] = ['current', 'days30', 'days60', 'days90Plus'];

/**
 * Sums every customer's outstanding balance per aging bucket into one
 * fleet-wide total per bucket — the real, already-computed source
 * (`getCustomerAgingReport()`, the same function the Customer Aging Report
 * page uses) rather than re-deriving AR aging a second way.
 */
export function aggregateReceivablesByBucket(rows: AgingReportRow[]): Record<AgingBucketKey, number> {
  const totals: Record<AgingBucketKey, number> = { current: 0, days30: 0, days60: 0, days90Plus: 0 };
  for (const row of rows) {
    totals.current += row.buckets.current;
    totals.days30 += row.buckets.days30;
    totals.days60 += row.buckets.days60;
    totals.days90Plus += row.buckets.days90Plus;
  }
  return totals;
}

/** grossReceivable * lossRatePercent / 100. */
export function calculateBucketExpectedCreditLoss(grossReceivable: number, lossRatePercent: number): number {
  return round2(grossReceivable * (lossRatePercent / 100));
}

/** Recomputes expectedCreditLoss from grossReceivable/lossRatePercent after an edit — never trust a stale computed field once either input changed. */
export function recalculateBucketLine(line: EclBucketLine): EclBucketLine {
  return { ...line, expectedCreditLoss: calculateBucketExpectedCreditLoss(line.grossReceivable, line.lossRatePercent) };
}

/**
 * Builds the four bucket lines for a new computation: real gross
 * receivables per bucket, and a loss rate defaulting to whatever the prior
 * POSTED computation used for that same bucket (continuity across periods —
 * an accountant setting a 2% rate for "30 days" shouldn't have to re-enter
 * it every year), or 0% if there is no prior computation. Always fully
 * user-editable afterward.
 */
export function buildEclBucketLines(
  grossByBucket: Record<AgingBucketKey, number>,
  priorBuckets: EclBucketLine[] = [],
): EclBucketLine[] {
  return AGING_BUCKET_ORDER.map((bucket) => {
    const grossReceivable = round2(grossByBucket[bucket] ?? 0);
    const lossRatePercent = priorBuckets.find((b) => b.bucket === bucket)?.lossRatePercent ?? 0;
    return { bucket, grossReceivable, lossRatePercent, expectedCreditLoss: calculateBucketExpectedCreditLoss(grossReceivable, lossRatePercent) };
  });
}

export interface EclTotals {
  totalGrossReceivable: number;
  totalExpectedCreditLoss: number;
}

export function calculateEclTotals(buckets: EclBucketLine[]): EclTotals {
  return {
    totalGrossReceivable: round2(buckets.reduce((sum, b) => sum + b.grossReceivable, 0)),
    totalExpectedCreditLoss: round2(buckets.reduce((sum, b) => sum + b.expectedCreditLoss, 0)),
  };
}

/**
 * The most recent POSTED EclComputation for a company measured as of
 * strictly before `beforeAsOfDate` — what a new computation's movement must
 * be measured against. Mirrors deferredTax's findMostRecentPostedBefore()
 * exactly (same reasoning: a shared definition of "the prior computation"
 * for both the service, which needs it to post, and the UI, which previews
 * the movement on a still-draft computation).
 */
export function findMostRecentPostedEclBefore(
  computations: EclComputation[],
  companyId: ID,
  beforeAsOfDate: string,
  excludeId?: ID,
): EclComputation | undefined {
  return computations
    .filter((c) => c.companyId === companyId && c.status === 'posted' && c.id !== excludeId && c.asOfDate.slice(0, 10) < beforeAsOfDate.slice(0, 10))
    .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0];
}
