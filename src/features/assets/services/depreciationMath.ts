import type { DepreciationMethod } from '@/types';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
export const EPSILON = 0.005;

const MS_PER_DAY = 86_400_000;

/** True for a Gregorian leap year (divisible by 4, except centuries not divisible by 400). */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Day-count convention: **actual/actual (ISDA)**. The denominator is the
 * real length of the calendar year the charge falls in — 365 in an ordinary
 * year, 366 in a leap year. No 365.25 approximation: every depreciation
 * coverage window here sits inside a single calendar month, hence a single
 * year, so the year's true length is always knowable and used.
 */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** The calendar year an ISO date falls in. */
export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse a `YYYY-MM-DD` (or longer ISO) date to a UTC-midnight timestamp — deterministic, timezone-free. */
export function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISODate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Inclusive day count: (2026-01-15 … 2026-01-31) = 17. */
export function inclusiveDays(startISO: string, endISO: string): number {
  return Math.round((parseDateUTC(endISO) - parseDateUTC(startISO)) / MS_PER_DAY) + 1;
}

export function isAfterDate(aISO: string, bISO: string): boolean {
  return parseDateUTC(aISO) > parseDateUTC(bISO);
}

export function laterOf(aISO: string, bISO: string): string {
  return parseDateUTC(aISO) >= parseDateUTC(bISO) ? aISO.slice(0, 10) : bISO.slice(0, 10);
}

/** Last calendar day of the month containing `iso`. */
export function endOfMonth(iso: string): string {
  const d = new Date(parseDateUTC(iso));
  return toISODate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** First calendar day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  const d = new Date(parseDateUTC(iso));
  return toISODate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** End-of-month `n` whole months after the month containing `iso`. */
export function endOfMonthPlus(iso: string, n: number): string {
  const d = new Date(parseDateUTC(iso));
  return toISODate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + n, 0));
}

/** The straight-line end date — `years` after `iso`; a fractional year is counted as that fraction of the landing year's real day count (actual/actual). */
export function addYears(iso: string, years: number): string {
  const d = new Date(parseDateUTC(iso));
  const whole = Math.trunc(years);
  const landingYear = d.getUTCFullYear() + whole;
  const extraDays = Math.round((years - whole) * daysInYear(landingYear));
  return toISODate(Date.UTC(landingYear, d.getUTCMonth(), d.getUTCDate()) + extraDays * MS_PER_DAY);
}

/**
 * The minimum an asset needs before the planner can compute a charge —
 * a structural subset of `FixedAsset` so both the real run and the
 * read-side preview walk the identical algorithm (same rationale as
 * stockLotService sharing previewFifoCost()/consumeFifoLots()).
 */
export interface AssetDepreciationInput {
  id: string;
  assetNumber: string;
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  /** Available-for-use / capitalisation date — depreciation never starts before this. */
  acquisitionDate: string;
  /** Accumulated depreciation already posted (the running total on the register). */
  accumulatedDepreciation: number;
}

export interface PlannedDepreciationPeriod {
  /** Date this charge is calculated up to — a month-end, or the target date for a clipped final period. */
  periodEnd: string;
  /** First day this charge covers (the acquisition date for the first period, else the 1st of the month). */
  coverageStart: string;
  /** Inclusive days in the coverage window. */
  days: number;
  amount: number;
  accumulatedDepreciationAfter: number;
  carryingValueAfter: number;
}

export interface AssetDepreciationPlan {
  assetId: string;
  assetNumber: string;
  periods: PlannedDepreciationPeriod[];
  totalAmount: number;
}

/**
 * One entry in an asset's effective-dated estimate timeline — a full
 * estimate snapshot that governs every depreciation period on or after
 * `effectiveDate` (until the next entry). `effectiveDate` is always a
 * month-start. `usefulLifeYears` is the revised TOTAL life from acquisition.
 */
export interface EstimateRevisionSnapshot {
  effectiveDate: string;
  usefulLifeYears: number;
  residualValue: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
}

/**
 * The estimate snapshot in effect on `asOf` — the entry with the greatest
 * `effectiveDate` on or before `asOf`, or the baseline. `timeline` need not
 * be pre-sorted.
 */
export function estimateAsOf(
  baseline: EstimateRevisionSnapshot,
  timeline: readonly EstimateRevisionSnapshot[],
  asOf: string,
): EstimateRevisionSnapshot {
  const ordered = [...timeline].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  let current = baseline;
  for (const revision of ordered) {
    if (parseDateUTC(revision.effectiveDate) <= parseDateUTC(asOf)) current = revision;
    else break;
  }
  return current;
}

/**
 * The single authoritative depreciation calculation (SA_ACCOUNTING_MASTER_SPEC
 * §116 Phase 7). Given an asset, the set of period-end dates it has already
 * been depreciated for, and a target date, returns the list of month-by-month
 * charges still to post so that:
 *
 *  - depreciation never starts before `acquisitionDate` (available-for-use);
 *  - the first month is day-count prorated from the acquisition date, and a
 *    final month clipped at `targetDate` (used on disposal) is prorated too;
 *  - straight-line uses "remaining depreciable amount ÷ remaining days",
 *    recomputed every period, so a later change in estimate (useful life,
 *    residual) or a catch-up run self-corrects prospectively (IAS 8);
 *  - reducing-balance applies the annual rate to the current carrying value,
 *    day-count prorated;
 *  - accumulated depreciation can never exceed the depreciable base — the
 *    last period is clipped to whatever remains (carrying-value floor =
 *    residual value);
 *  - re-running a period that is already posted produces nothing;
 *  - `revisions` is the asset's effective-dated estimate timeline (migration
 *    0079). Each month picks the estimate whose `effectiveDate` is the
 *    latest one on or before that month's first day; `asset`'s own fields
 *    are the baseline, effective from acquisition. A revision effective
 *    1 July governs July onward and never retroactively re-rates June.
 */
export function planAssetDepreciation(
  asset: AssetDepreciationInput,
  postedPeriodEnds: readonly string[],
  targetDate: string,
  revisions: readonly EstimateRevisionSnapshot[] = [],
): AssetDepreciationPlan {
  const empty: AssetDepreciationPlan = { assetId: asset.id, assetNumber: asset.assetNumber, periods: [], totalAmount: 0 };

  let acc = asset.accumulatedDepreciation;
  if (isAfterDate(asset.acquisitionDate, targetDate)) return empty;

  const baseline: EstimateRevisionSnapshot = {
    effectiveDate: asset.acquisitionDate.slice(0, 10),
    usefulLifeYears: asset.usefulLifeYears,
    residualValue: asset.residualValue,
    depreciationMethod: asset.depreciationMethod,
    reducingBalanceRatePercent: asset.reducingBalanceRatePercent,
  };
  const timeline = [...revisions].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  // Fast path: nothing has ever been revised and the base is already exhausted.
  if (timeline.length === 0 && round2(asset.cost - asset.residualValue) - acc <= EPSILON) return empty;

  const estimateForMonth = (monthStart: string): EstimateRevisionSnapshot => estimateAsOf(baseline, timeline, monthStart);

  // A calendar month is "done" once any charge (full or a disposal-clipped
  // partial) has been posted in it — so a later month-end run can never
  // double-post a month an earlier partial run already touched.
  const postedMonths = new Set(postedPeriodEnds.map((d) => startOfMonth(d)));
  const target = targetDate.slice(0, 10);

  const periods: PlannedDepreciationPeriod[] = [];
  let monthEnd = endOfMonth(asset.acquisitionDate);

  while (parseDateUTC(startOfMonth(monthEnd)) <= parseDateUTC(target)) {
    const monthStart = startOfMonth(monthEnd);
    const est = estimateForMonth(monthStart);
    const base = round2(asset.cost - est.residualValue);

    const clipped = parseDateUTC(monthEnd) > parseDateUTC(target);
    const periodEnd = clipped ? target : monthEnd;
    const coverageStart = laterOf(asset.acquisitionDate, monthStart);

    const withinCoverage = parseDateUTC(coverageStart) <= parseDateUTC(periodEnd);
    const remaining = round2(base - acc);

    if (withinCoverage && remaining > EPSILON && !postedMonths.has(monthStart)) {
      const days = inclusiveDays(coverageStart, periodEnd);
      let raw: number;
      if (est.depreciationMethod === 'straight_line') {
        const slEndDate = addYears(asset.acquisitionDate, est.usefulLifeYears);
        const remainingDays = Math.max(
          1,
          Math.round((parseDateUTC(slEndDate) - parseDateUTC(coverageStart)) / MS_PER_DAY),
        );
        raw = (remaining / remainingDays) * days;
      } else {
        if (est.reducingBalanceRatePercent === undefined) {
          throw new Error(
            `Asset "${asset.assetNumber}" uses the reducing-balance method but has no reducingBalanceRatePercent set.`,
          );
        }
        const carrying = asset.cost - acc;
        raw = carrying * (est.reducingBalanceRatePercent / 100) * (days / daysInYear(yearOf(periodEnd)));
      }
      const amount = Math.min(round2(raw), remaining);
      if (amount > EPSILON) {
        acc = round2(acc + amount);
        periods.push({
          periodEnd,
          coverageStart,
          days,
          amount,
          accumulatedDepreciationAfter: acc,
          carryingValueAfter: round2(asset.cost - acc),
        });
      }
    }

    if (parseDateUTC(monthEnd) >= parseDateUTC(target)) break;
    monthEnd = endOfMonthPlus(monthEnd, 1);
  }

  return { assetId: asset.id, assetNumber: asset.assetNumber, periods, totalAmount: round2(periods.reduce((s, p) => s + p.amount, 0)) };
}
