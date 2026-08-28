export interface ReconciliationHealth {
  /** Bank-side statement lines examined for the period. */
  transactionsAnalysed: number;
  confirmed: number;
  probable: number;
  needsReview: number;
  /** Analysed bank lines with no confirmed/probable/needs-review classification. */
  unmatched: number;
  /**
   * 0-100 — share of analysed bank lines that are confirmed or probably
   * matched. `null` when nothing was analysed (there is no coverage figure
   * to report, NOT "100%").
   */
  matchCoveragePercent: number | null;

  /** The reconciliation's money variance, signed (statement vs adjusted book balance). */
  variance: number;
  /**
   * Rand amount of |variance| that the detected issues put a candidate cause
   * against, capped at |variance| so it can never exceed the real gap.
   */
  varianceExplained: number;
  /** |variance| − varianceExplained — the money that still has no candidate cause. */
  varianceRemaining: number;
  /**
   * 0-100 — varianceExplained / |variance|. Reaches 100 ONLY when the money
   * variance is genuinely zero or fully accounted for — never just because
   * every transaction happened to match while a balance gap remains (the
   * bug this replaced: "Explained 100%" next to "Unexplained R74,905").
   */
  varianceExplainedPercent: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The single top-line "how healthy is this reconciliation" summary. Two
 * genuinely different questions, kept as two separate figures instead of
 * one misleading blended percentage (docs/CURRENT_TASKS.md #22):
 *
 *   1. Transaction match coverage — did each imported bank line find its
 *      accounting counterpart? (a count ratio)
 *   2. Variance explained — of the Rand gap between the statement and the
 *      books, how much now has a candidate cause? (a money ratio)
 *
 * Every count here is an already-classified candidate, never re-derived —
 * this function only aggregates and computes the ratios.
 */
export function computeReconciliationHealth(
  transactionsAnalysed: number,
  confirmed: number,
  probable: number,
  needsReview: number,
  variance: number,
  varianceExplainedRaw: number,
): ReconciliationHealth {
  const matched = confirmed + probable;
  const unmatched = Math.max(0, transactionsAnalysed - confirmed - probable - needsReview);
  const matchCoveragePercent =
    transactionsAnalysed === 0 ? null : round1((matched / transactionsAnalysed) * 100);

  const absVariance = round2(Math.abs(variance));
  const varianceExplained = absVariance === 0 ? 0 : round2(Math.min(absVariance, Math.max(0, varianceExplainedRaw)));
  const varianceRemaining = round2(absVariance - varianceExplained);
  const varianceExplainedPercent =
    absVariance === 0 ? 100 : round1((varianceExplained / absVariance) * 100);

  return {
    transactionsAnalysed,
    confirmed,
    probable,
    needsReview,
    unmatched,
    matchCoveragePercent,
    variance,
    varianceExplained,
    varianceRemaining,
    varianceExplainedPercent,
  };
}
