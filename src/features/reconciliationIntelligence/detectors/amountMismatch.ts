import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { centsAbs, fromCents } from '../utils/money';
import { daysBetween, descriptionOverlap, referencesMatch } from '../utils/textMatching';

const DEFAULT_DATE_TOLERANCE_DAYS = 3;

/**
 * Two same-length amounts (in cents) that differ by exactly one adjacent
 * digit swap — R1,254.30 vs R1,245.30 ("5430" vs "4530" once formatted
 * consistently). A classic data-entry error, distinct enough from a generic
 * amount mismatch to call out by name.
 */
export function isDigitTransposition(centsA: number, centsB: number): boolean {
  const sa = String(Math.abs(Math.round(centsA)));
  const sb = String(Math.abs(Math.round(centsB)));
  if (sa.length !== sb.length || sa === sb) return false;

  const diffIndexes: number[] = [];
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) diffIndexes.push(i);
  }
  if (diffIndexes.length !== 2) return false;
  const [i, j] = diffIndexes;
  if (j !== i + 1) return false;
  return sa[i] === sb[j] && sa[j] === sb[i];
}

/**
 * Finds the same real-world transaction recorded at two different amounts —
 * a bank-side item and a books-side item that are clearly "the same thing"
 * (close date, and a reference/description/amount-proximity signal) but
 * disagree on the Rand value. Ranked highest when the discrepancy exactly
 * equals the reconciliation's own unexplained variance — the strongest
 * possible evidence this candidate IS the cause, per the spec's worked
 * example ("difference exactly equals unexplained reconciliation amount").
 */
export function detectAmountMismatch(
  unmatchedBank: InvestigationCandidate[],
  unmatchedBooks: InvestigationCandidate[],
  options: { dateToleranceDays?: number; targetUnexplainedCents?: number } = {},
): ReconciliationIssueDraft[] {
  const dateToleranceDays = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS;
  const claimed = new Set<string>();
  const issues: ReconciliationIssueDraft[] = [];

  for (const bank of unmatchedBank) {
    let best: { books: InvestigationCandidate; daysApart: number; refMatch: boolean; descOverlap: number } | undefined;

    for (const books of unmatchedBooks) {
      if (claimed.has(books.id)) continue;
      const sameSign = Math.sign(bank.amountCents) === Math.sign(books.amountCents);
      if (!sameSign) continue;

      const daysApart = daysBetween(bank.date, books.date);
      if (daysApart > dateToleranceDays) continue;

      const refMatch = referencesMatch(bank.reference, books.reference);
      const descOverlap = descriptionOverlap(bank.description, books.description);
      const diffCents = centsAbs(bank.amountCents - books.amountCents);
      const relativeDiff = diffCents / Math.max(centsAbs(bank.amountCents), 1);
      const plausible = refMatch || descOverlap >= 0.4 || relativeDiff <= 0.1;
      if (!plausible) continue;

      if (!best || daysApart < best.daysApart) best = { books, daysApart, refMatch, descOverlap };
    }

    if (!best) continue;
    claimed.add(best.books.id);

    const diffCents = bank.amountCents - best.books.amountCents;
    const transposition = isDigitTransposition(bank.amountCents, best.books.amountCents);
    const explainsWholeVariance =
      options.targetUnexplainedCents !== undefined && centsAbs(diffCents) === centsAbs(options.targetUnexplainedCents);

    const { value: confidence, evidence } = buildConfidence([
      { points: 25, label: best.daysApart === 0 ? 'Same date' : `${best.daysApart} day(s) apart`, met: true },
      { points: 20, label: 'Reference matches', met: best.refMatch },
      { points: 15, label: 'Description text overlaps', met: best.descOverlap > 0 },
      { points: 15, label: 'Looks like a transposed-digit data-entry error', met: transposition },
      {
        points: 40,
        label: 'Difference exactly equals the unexplained reconciliation amount',
        detail: `R${fromCents(centsAbs(diffCents)).toFixed(2)}`,
        met: explainsWholeVariance,
      },
    ]);

    issues.push({
      issueType: transposition ? 'transposition_error' : 'amount_mismatch',
      severity: explainsWholeVariance ? 'high' : 'medium',
      confidence,
      effectAmount: fromCents(diffCents),
      affectedDateFrom: bank.date < best.books.date ? bank.date : best.books.date,
      affectedDateTo: bank.date < best.books.date ? best.books.date : bank.date,
      relatedBankTransactionIds: [bank.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [bank.journalEntryId, best.books.journalEntryId].filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: transposition
        ? `Likely transposed digits: bank shows R${fromCents(centsAbs(bank.amountCents)).toFixed(2)}, books show R${fromCents(centsAbs(best.books.amountCents)).toFixed(2)}.`
        : `Bank shows R${fromCents(centsAbs(bank.amountCents)).toFixed(2)} for "${bank.description}", books show R${fromCents(centsAbs(best.books.amountCents)).toFixed(2)} for "${best.books.description}" — a difference of R${fromCents(centsAbs(diffCents)).toFixed(2)}.`,
      evidence,
      suggestedResolution: transposition
        ? 'Correct the mis-typed amount through the originating document, then re-post.'
        : 'Review both records and correct the wrong one through the proper accounting flow (never edit posted history directly).',
      autoResolutionSafe: false,
    });
  }

  return issues;
}
