import type { MatchPair, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { referenceSimilarity } from '../utils/textMatching';

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
    const dateFrom = bank.date < books.date ? bank.date : books.date;
    const dateTo = bank.date < books.date ? books.date : bank.date;

    const { value: confidence, evidence, evidenceData } = buildEvidence({
      detectorType: 'date_offset_timing',
      factors: [
        { key: 'amount_matches_exactly', points: 40, maxPoints: 40, label: 'Amount matches exactly', met: true },
        { key: 'within_date_tolerance', points: 30, maxPoints: 30, label: `${daysApart} day(s) apart`, detail: `${bank.date} vs ${books.date}`, met: true, observedValue: `${daysApart} days` },
        { key: 'reference_match', points: 20, maxPoints: 20, label: 'Reference matches', met: referenceMatches, observedValue: referenceMatches },
        { key: 'description_overlap', points: 15, maxPoints: 15, label: 'Description text overlaps', met: descriptionOverlap > 0, observedValue: descriptionOverlap },
      ],
      fields: {
        amountDifferenceCents: 0,
        dateDifferenceDays: daysApart,
        referenceSimilarity: referenceSimilarity(bank.reference, books.reference),
        sameCounterparty: referenceMatches || descriptionOverlap > 0,
        sameDirection: true,
        sameBankAccount: true,
        candidateSourceType: bank.kind === 'statement_line' ? 'statement_line' : 'bank_transaction',
        candidateSourceId: books.id,
        varianceExplainedCents: 0,
        bankAmountCents: bank.amountCents,
        booksAmountCents: books.amountCents,
        counterpartyLabel: bank.description,
        observedDateFrom: bank.date,
        observedDateTo: books.date,
      },
    });

    return {
      issueType: 'date_offset_timing',
      severity: 'info',
      confidence,
      effectAmount: 0,
      affectedDateFrom: dateFrom,
      affectedDateTo: dateTo,
      relatedBankTransactionIds: [bank.bankTransactionId, books.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [bank.journalEntryId, books.journalEntryId].filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'date_offset_timing'),
      evidence,
      evidenceData,
      suggestedResolution: 'Mark as a valid timing difference.',
      autoResolutionSafe: true,
    };
  });
}
