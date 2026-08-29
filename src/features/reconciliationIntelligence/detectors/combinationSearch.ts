import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { fromCents } from '../utils/money';
import { findSubsetsSumming } from '../utils/subsetSum';

/**
 * The headline "why are we out by R1,247.38" feature: searches the pool of
 * everything no other, more specific detector (exact/probable match,
 * amount-mismatch, wrong-sign, grouped-match) could explain for a bounded
 * combination (1-3 items — utils/subsetSum.ts) whose amounts sum EXACTLY to
 * the reconciliation's own unexplained variance. Each leftover candidate's
 * signed amountCents is used as-is (debit-positive/credit-negative,
 * InvestigationCandidate's own convention) as its hypothetical contribution
 * — a heuristic, not a formal proof of causation; the UI must present this
 * as "a combination that would explain the gap if confirmed", never as an
 * established fact, per the spec's "never auto-resolve, always surface
 * evidence for a human to confirm" rule. Returns [] when the variance is
 * already zero or the pool can't produce an exact combination — a
 * near-miss is deliberately NOT surfaced here (that would misrepresent
 * "exactly explains" as "roughly explains"; the rounding detector handles
 * genuine small accumulated variances instead).
 */
export function detectCombinations(leftoverPool: InvestigationCandidate[], targetVarianceCents: number, maxResults: number = 5): ReconciliationIssueDraft[] {
  if (targetVarianceCents === 0 || leftoverPool.length === 0) return [];

  const matches = findSubsetsSumming(leftoverPool, targetVarianceCents, maxResults);

  return matches.map((match) => {
    const items = match.indexes.map((i) => leftoverPool[i]);
    const sortedDates = items.map((i) => i.date).sort();

    const { value: confidence, evidence, evidenceData } = buildEvidence({
      detectorType: 'combination_match',
      factors: [
        { key: 'sums_to_variance_exactly', points: 35, maxPoints: 35, label: `${items.length} item(s) sum to exactly R${Math.abs(targetVarianceCents / 100).toFixed(2)}`, met: true },
        { key: 'all_otherwise_unexplained', points: 30, maxPoints: 30, label: 'Every item was otherwise fully unexplained', met: true },
        { key: 'single_item', points: 20, maxPoints: 20, label: 'Single-item explanation', met: items.length === 1 },
        { key: 'two_item', points: 15, maxPoints: 15, label: 'Two-item combination', met: items.length === 2 },
        { key: 'three_item', points: 5, maxPoints: 5, label: 'Three-item combination', met: items.length === 3 },
      ],
      fields: {
        varianceExplainedCents: Math.abs(targetVarianceCents),
        explainsVarianceExactly: true,
        observedDateFrom: sortedDates[0],
        observedDateTo: sortedDates[sortedDates.length - 1],
        combinationTerms: items.map((i) => ({ label: `${i.description}, ${i.date}`, amountCents: i.amountCents })),
        combinationTotalCents: targetVarianceCents,
      },
    });

    return {
      issueType: 'combination_match',
      severity: 'high',
      confidence,
      effectAmount: fromCents(targetVarianceCents),
      affectedDateFrom: sortedDates[0],
      affectedDateTo: sortedDates[sortedDates.length - 1],
      relatedBankTransactionIds: items.map((i) => i.bankTransactionId).filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: items.map((i) => i.journalEntryId).filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'combination_match'),
      evidence,
      evidenceData,
      suggestedResolution: 'Review each item — if all are confirmed as real, no unexplained difference remains once they are corrected/allocated.',
      autoResolutionSafe: false,
    };
  });
}
