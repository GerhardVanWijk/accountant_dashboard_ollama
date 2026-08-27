import type { MatchPair, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { fromCents } from '../utils/money';

/**
 * Every 'probable' match from classifyMatches() IS a date-offset timing
 * case by construction (same amount, different date, within tolerance).
 * These are usually NOT the cause of a reconciliation variance — the
 * standard formula already nets uncleared deposits/unpresented payments —
 * but they're still worth surfacing explicitly so the accountant sees WHY
 * two records didn't auto-confirm, rather than silently trusting a fuzzy
 * match. Low severity, auto-resolution-safe (marking a genuine timing
 * difference as expected changes nothing accounting-relevant).
 */
export function detectDateOffsetTiming(pairs: MatchPair[]): ReconciliationIssueDraft[] {
  return pairs.map(({ bank, books, daysApart, referenceMatches, descriptionOverlap }) => {
    const { value: confidence, evidence } = buildConfidence([
      { points: 40, label: 'Amount matches exactly', met: true },
      { points: 30, label: `${daysApart} day(s) apart`, detail: `${bank.date} vs ${books.date}`, met: true },
      { points: 20, label: 'Reference matches', met: referenceMatches },
      { points: 15, label: 'Description text overlaps', met: descriptionOverlap > 0 },
    ]);

    return {
      issueType: 'date_offset_timing',
      severity: 'info',
      confidence,
      effectAmount: 0,
      affectedDateFrom: bank.date < books.date ? bank.date : books.date,
      affectedDateTo: bank.date < books.date ? books.date : bank.date,
      relatedBankTransactionIds: [bank.bankTransactionId, books.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [bank.journalEntryId, books.journalEntryId].filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: `Bank shows this ${bank.date}, books record it ${books.date} — same amount (R${fromCents(Math.abs(bank.amountCents)).toFixed(2)}), ${daysApart} day(s) apart. This is a normal timing difference, not a real discrepancy.`,
      evidence,
      suggestedResolution: 'Mark as a valid timing difference.',
      autoResolutionSafe: true,
    };
  });
}
