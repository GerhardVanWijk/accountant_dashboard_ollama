import type { InvestigationCandidate } from '../types';
import { fromCents } from '../utils/money';

export interface DifferenceTimelinePoint {
  date: string;
  /** Running total of the unexplained effect, in Rand, as of this date. */
  cumulativeAmount: number;
}

export interface DifferenceTimeline {
  points: DifferenceTimelinePoint[];
  /** The first date the running total becomes (and, from the evidence available, stays) non-zero — undefined if it never does. */
  firstAppearanceDate?: string;
}

/**
 * "When did the difference start?" — built from the SAME contributing items
 * the other detectors already identified as the cause (an explicit
 * combination-search/rounding result, or every currently-unexplained
 * leftover candidate when no single combination was found), positioned
 * along the calendar with a running total. This does NOT re-run the full
 * bank-vs-statement reconciliation formula at each historical date — that
 * would need a historical statement balance for every past date, which
 * this app has no record of (a finalized BankReconciliation snapshot only
 * ever exists at variance === 0, by construction — see
 * bankReconciliationService.finalizeReconciliation()). What this DOES
 * answer honestly: given everything currently unexplained, on which date
 * did contributions to that gap begin appearing? One O(n) pass builds the
 * per-date deltas, one O(n) scan finds the first divergence — no
 * per-date full recomputation, satisfying the "don't repeatedly
 * recalculate the entire ledger" performance requirement without the
 * false precision of a binary search over data that isn't guaranteed
 * monotonic.
 */
export function buildDifferenceTimeline(windowDates: string[], contributingItems: InvestigationCandidate[]): DifferenceTimeline {
  const deltaByDate = new Map<string, number>();
  for (const item of contributingItems) {
    deltaByDate.set(item.date, (deltaByDate.get(item.date) ?? 0) + item.amountCents);
  }

  const sortedDates = [...new Set(windowDates)].sort();
  let cumulativeCents = 0;
  let firstAppearanceDate: string | undefined;

  const points: DifferenceTimelinePoint[] = sortedDates.map((date) => {
    cumulativeCents += deltaByDate.get(date) ?? 0;
    if (cumulativeCents !== 0 && firstAppearanceDate === undefined) {
      firstAppearanceDate = date;
    }
    return { date, cumulativeAmount: fromCents(cumulativeCents) };
  });

  return { points, firstAppearanceDate };
}
