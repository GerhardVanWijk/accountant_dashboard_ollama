import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { fromCents } from '../utils/money';

/**
 * If every item that actually explains the unexplained difference (the
 * combination-search/rounding result, or the full leftover set when no
 * single combination was found) is dated STRICTLY BEFORE the reconciliation
 * window being investigated, the problem didn't originate in this period at
 * all — it was already there. Saves the accountant from re-reviewing the
 * current period's own transactions for a cause that isn't in them.
 */
export function detectOpeningBalanceProblem(windowStart: string, targetVarianceCents: number, contributingItems: InvestigationCandidate[]): ReconciliationIssueDraft[] {
  if (contributingItems.length === 0) return [];
  const allBeforeWindow = contributingItems.every((item) => item.date < windowStart);
  if (!allBeforeWindow) return [];

  const earliestDate = contributingItems.map((i) => i.date).sort()[0];
  const { value: confidence, evidence } = buildConfidence([
    { points: 50, label: 'Every contributing item is dated before the current reconciliation period', met: true },
    { points: 30, label: `Earliest contributing item: ${earliestDate}`, met: true },
    { points: 20, label: 'Not introduced by any transaction inside the period being reviewed', met: true },
  ]);

  return [
    {
      issueType: 'opening_balance_discrepancy',
      severity: 'high',
      confidence,
      effectAmount: fromCents(targetVarianceCents),
      affectedDateFrom: earliestDate,
      affectedDateTo: windowStart,
      relatedBankTransactionIds: contributingItems.map((i) => i.bankTransactionId).filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: contributingItems.map((i) => i.journalEntryId).filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: `The current period's own transactions reconcile — the R${fromCents(Math.abs(targetVarianceCents)).toFixed(2)} discrepancy already existed before ${windowStart}.`,
      evidence,
      suggestedResolution: 'Investigate the prior period(s) instead — reviewing this period further will not find the cause.',
      autoResolutionSafe: false,
    },
  ];
}
