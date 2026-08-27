import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
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
    const { value: confidence, evidence } = buildConfidence([
      { points: 35, label: `${items.length} item(s) sum to exactly R${fromCents(Math.abs(targetVarianceCents)).toFixed(2)}`, met: true },
      { points: 30, label: 'Every item was otherwise fully unexplained', met: true },
      { points: 20, label: 'Single-item explanation', met: items.length === 1 },
      { points: 15, label: 'Two-item combination', met: items.length === 2 },
      { points: 5, label: 'Three-item combination', met: items.length === 3 },
    ]);

    const breakdown = items.map((i) => `${i.side === 'bank' ? 'Bank' : 'Books'}: R${fromCents(Math.abs(i.amountCents)).toFixed(2)} — ${i.description} (${i.date})`).join('; ');

    return {
      issueType: 'combination_match',
      severity: 'high',
      confidence,
      effectAmount: fromCents(targetVarianceCents),
      affectedDateFrom: items.map((i) => i.date).sort()[0],
      affectedDateTo: items.map((i) => i.date).sort().slice(-1)[0],
      relatedBankTransactionIds: items.map((i) => i.bankTransactionId).filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: items.map((i) => i.journalEntryId).filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: `We found a combination that explains the entire R${fromCents(Math.abs(targetVarianceCents)).toFixed(2)} difference: ${breakdown}.`,
      evidence,
      suggestedResolution: 'Review each item — if all are confirmed as real, no unexplained difference remains once they are corrected/allocated.',
      autoResolutionSafe: false,
    };
  });
}
