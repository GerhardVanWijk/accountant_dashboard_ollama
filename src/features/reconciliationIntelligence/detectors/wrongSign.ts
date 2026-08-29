import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { fromCents } from '../utils/money';
import { daysBetween } from '../utils/textMatching';

const DATE_TOLERANCE_DAYS = 5;

/**
 * Same magnitude, opposite direction, close date — a debit posted where a
 * credit was expected (or vice versa). The reconciliation effect of a sign
 * flip is DOUBLE the transaction amount (the books moved the wrong way by
 * the full amount, then are short the correct movement too), which is
 * exactly what makes this detector worth calling out separately from a
 * generic amount mismatch — the size of the swing is diagnostic on its own.
 */
export function detectWrongSign(unmatchedBank: InvestigationCandidate[], unmatchedBooks: InvestigationCandidate[]): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];
  const claimedBooks = new Set<string>();

  for (const bank of unmatchedBank) {
    let best: { books: InvestigationCandidate; daysApart: number } | undefined;
    for (const books of unmatchedBooks) {
      if (claimedBooks.has(books.id)) continue;
      if (Math.abs(bank.amountCents) !== Math.abs(books.amountCents)) continue;
      if (Math.sign(bank.amountCents) === Math.sign(books.amountCents)) continue;
      const daysApart = daysBetween(bank.date, books.date);
      if (daysApart > DATE_TOLERANCE_DAYS) continue;
      if (!best || daysApart < best.daysApart) best = { books, daysApart };
    }

    if (!best) continue;
    claimedBooks.add(best.books.id);

    const swingCents = 2 * Math.abs(bank.amountCents);
    const dateFrom = bank.date < best.books.date ? bank.date : best.books.date;
    const dateTo = bank.date < best.books.date ? best.books.date : bank.date;

    const { value: confidence, evidence, evidenceData } = buildEvidence({
      detectorType: 'wrong_sign',
      factors: [
        { key: 'identical_magnitude_opposite_direction', points: 40, maxPoints: 40, label: 'Identical amount, opposite direction', met: true },
        { key: 'date_proximity', points: 30, maxPoints: 30, label: best.daysApart === 0 ? 'Same date' : `${best.daysApart} day(s) apart`, met: true, observedValue: `${best.daysApart} days` },
        { key: 'reversal_shape', points: 15, maxPoints: 15, label: 'Likely a debit/credit reversal at data entry', met: true },
      ],
      fields: {
        amountDifferenceCents: bank.amountCents - best.books.amountCents,
        dateDifferenceDays: best.daysApart,
        sameCounterparty: true,
        sameDirection: false,
        sameBankAccount: true,
        candidateSourceType: best.books.kind === 'journal_entry' ? 'journal_entry' : 'bank_transaction',
        candidateSourceId: best.books.id,
        varianceExplainedCents: swingCents,
        bankAmountCents: bank.amountCents,
        booksAmountCents: best.books.amountCents,
        counterpartyLabel: bank.description,
        observedDateFrom: dateFrom,
        observedDateTo: dateTo,
        swingCents,
      },
    });

    issues.push({
      issueType: 'wrong_sign',
      severity: 'high',
      confidence,
      effectAmount: fromCents(swingCents),
      affectedDateFrom: dateFrom,
      affectedDateTo: dateTo,
      relatedBankTransactionIds: [bank.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [bank.journalEntryId, best.books.journalEntryId].filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'wrong_sign'),
      evidence,
      evidenceData,
      suggestedResolution: 'Reverse the incorrectly-signed posting and re-post it with the correct debit/credit, through the proper accounting flow.',
      autoResolutionSafe: false,
    });
  }

  return issues;
}
