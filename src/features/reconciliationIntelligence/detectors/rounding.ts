import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { fromCents } from '../utils/money';

/** A "rounding" candidate is a residual small enough to plausibly be VAT/line-item/allocation rounding, not a real transaction. */
const MAX_ROUNDING_ITEM_CENTS = 50;
/** Only worth investigating as "rounding" when the whole unexplained gap itself is small — a big variance made of tiny pieces is a combination match instead (detectors/combinationSearch.ts), not rounding. */
const MAX_ROUNDING_TARGET_CENTS = 200;
const MAX_ITEMS = 8;
const MAX_POOL = 30;

/** Depth-first exact subset search, bounded by item count and pool size — see the module doc comment for why this is safe at this scale. */
function findExactCombination(amountsCents: number[], target: number, maxItems: number): number[] | undefined {
  const path: number[] = [];
  function search(start: number, remaining: number): number[] | undefined {
    if (remaining === 0 && path.length > 0) return [...path];
    if (path.length >= maxItems) return undefined;
    for (let i = start; i < amountsCents.length; i++) {
      path.push(i);
      const found = search(i + 1, remaining - amountsCents[i]);
      if (found) return found;
      path.pop();
    }
    return undefined;
  }
  return search(0, target);
}

/**
 * Tiny differences (R0.01-R0.16 and similar) get their own detector rather
 * than falling through to the general combination search: the pool is
 * pre-filtered to only genuinely small residual items
 * (MAX_ROUNDING_ITEM_CENTS), and — unlike combinationSearch.ts's 1-3-item
 * cap — up to MAX_ITEMS small entries are allowed to accumulate, since real
 * rounding drift often comes from many tiny sources (per-invoice VAT
 * rounding, per-allocation rounding, a rounded bank fee) rather than one or
 * two. Bounded to a small pool (MAX_POOL) and a small target
 * (MAX_ROUNDING_TARGET_CENTS) specifically so this stays a cheap,
 * exact-match DFS rather than a real combinatorial search.
 */
export function detectRounding(leftoverPool: InvestigationCandidate[], targetVarianceCents: number): ReconciliationIssueDraft[] {
  if (targetVarianceCents === 0 || Math.abs(targetVarianceCents) > MAX_ROUNDING_TARGET_CENTS) return [];

  const smallItems = leftoverPool.filter((i) => Math.abs(i.amountCents) <= MAX_ROUNDING_ITEM_CENTS);
  if (smallItems.length === 0 || smallItems.length > MAX_POOL) return [];

  const combination = findExactCombination(
    smallItems.map((i) => i.amountCents),
    targetVarianceCents,
    MAX_ITEMS,
  );
  if (!combination) return [];

  const items = combination.map((i) => smallItems[i]);
  const allDates = items.map((i) => i.date).sort();

  const { value: confidence, evidence, evidenceData } = buildEvidence({
    detectorType: 'rounding_variance',
    factors: [
      { key: 'small_items_sum_exactly', points: 40, maxPoints: 40, label: `${items.length} small item(s) sum exactly to R${Math.abs(targetVarianceCents / 100).toFixed(2)}`, met: true },
      { key: 'items_plausibly_rounding', points: 30, maxPoints: 30, label: 'Every item is small enough to be a plausible rounding artifact', met: true },
      { key: 'target_itself_small', points: 20, maxPoints: 20, label: 'Total unexplained amount is itself small', met: Math.abs(targetVarianceCents) <= 100, observedValue: Math.abs(targetVarianceCents) },
    ],
    fields: {
      amountDifferenceCents: 0,
      varianceExplainedCents: Math.abs(targetVarianceCents),
      explainsVarianceExactly: true,
      observedDateFrom: allDates[0],
      observedDateTo: allDates[allDates.length - 1],
      combinationTerms: items.map((i) => ({ label: `${i.description}, ${i.date}`, amountCents: i.amountCents })),
      combinationTotalCents: targetVarianceCents,
    },
  });

  return [
    {
      issueType: 'rounding_variance',
      severity: 'low',
      confidence,
      effectAmount: fromCents(targetVarianceCents),
      affectedDateFrom: allDates[0],
      affectedDateTo: allDates[allDates.length - 1],
      relatedBankTransactionIds: items.map((i) => i.bankTransactionId).filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: items.map((i) => i.journalEntryId).filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'rounding_variance'),
      evidence,
      evidenceData,
      suggestedResolution: 'No correction usually needed for genuine rounding — mark as explained once confirmed, per your rounding policy.',
      autoResolutionSafe: true,
    },
  ];
}
