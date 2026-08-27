import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { fromCents } from '../utils/money';
import { daysBetween } from '../utils/textMatching';

const DATE_TOLERANCE_DAYS = 5;
/** Bootstrapping fallback only — the orchestrator injects the real, currently-effective TaxRate percentages (never a hardcoded duplicate tax model, per docs/DO_NOT_BREAK.md "Tax & Accounting Logic"). */
const DEFAULT_RATES_PERCENT = [15, 14, 0];
const TOLERANCE_CENTS = 2;

/** true if `bigCents` looks like `smallCents` grossed up by `ratePercent`. */
function looksInclusiveVsExclusive(bigCents: number, smallCents: number, ratePercent: number): boolean {
  if (ratePercent <= 0) return false;
  const expected = Math.round(smallCents * (1 + ratePercent / 100));
  return Math.abs(expected - bigCents) <= TOLERANCE_CENTS;
}

/** true if the gap between the two amounts equals roughly one VAT component of the larger amount — i.e. VAT posted twice, or omitted once. */
function looksLikeVatComponent(diffCents: number, largeCents: number, ratePercent: number): boolean {
  if (ratePercent <= 0) return false;
  const vatComponent = Math.round((largeCents * ratePercent) / (100 + ratePercent));
  return Math.abs(Math.abs(diffCents) - vatComponent) <= TOLERANCE_CENTS;
}

/**
 * Checks whether an otherwise-unexplained bank/books pair's discrepancy is
 * shaped like a VAT mistake — inclusive/exclusive confusion, the wrong
 * rate, VAT rounded differently, or VAT posted twice/omitted — rather than
 * a generic amount mismatch. Never changes any VAT treatment itself; only
 * surfaces the source transaction and the arithmetic that suggests VAT is
 * the cause, per the spec's "do not change VAT treatment automatically"
 * rule.
 */
export function detectVatDifferences(
  unmatchedBank: InvestigationCandidate[],
  unmatchedBooks: InvestigationCandidate[],
  ratesPercent: number[] = DEFAULT_RATES_PERCENT,
): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];
  const claimed = new Set<string>();

  for (const bank of unmatchedBank) {
    for (const books of unmatchedBooks) {
      if (claimed.has(books.id)) continue;
      if (Math.sign(bank.amountCents) !== Math.sign(books.amountCents)) continue;
      const daysApart = daysBetween(bank.date, books.date);
      if (daysApart > DATE_TOLERANCE_DAYS) continue;

      const bigCents = Math.max(Math.abs(bank.amountCents), Math.abs(books.amountCents));
      const smallCents = Math.min(Math.abs(bank.amountCents), Math.abs(books.amountCents));
      const diffCents = Math.abs(bank.amountCents) - Math.abs(books.amountCents);
      if (diffCents === 0) continue;

      const matchedRate = ratesPercent.find((rate) => looksInclusiveVsExclusive(bigCents, smallCents, rate) || looksLikeVatComponent(diffCents, bigCents, rate));
      if (matchedRate === undefined) continue;

      claimed.add(books.id);
      const { value: confidence, evidence } = buildConfidence([
        { points: 30, label: `Difference is consistent with a ${matchedRate}% VAT calculation`, met: true },
        { points: 25, label: daysApart === 0 ? 'Same date' : `${daysApart} day(s) apart`, met: true },
        { points: 20, label: 'Same direction (both money in, or both money out)', met: true },
        { points: 15, label: 'Difference is small relative to the transaction', met: Math.abs(diffCents) / bigCents < 0.2 },
      ]);

      issues.push({
        issueType: 'vat_difference',
        severity: 'medium',
        confidence,
        effectAmount: fromCents(diffCents),
        affectedDateFrom: bank.date < books.date ? bank.date : books.date,
        affectedDateTo: bank.date < books.date ? books.date : bank.date,
        relatedBankTransactionIds: [bank.bankTransactionId].filter((x): x is string => Boolean(x)),
        relatedJournalEntryIds: [bank.journalEntryId, books.journalEntryId].filter((x): x is string => Boolean(x)),
        relatedSourceDocumentIds: [],
        explanation: `R${fromCents(bigCents).toFixed(2)} vs R${fromCents(smallCents).toFixed(2)} — the R${fromCents(Math.abs(diffCents)).toFixed(2)} gap is consistent with a ${matchedRate}% VAT inclusive/exclusive mismatch, wrong rate, or VAT posted once instead of twice (or vice versa).`,
        evidence,
        suggestedResolution: 'Check the source document\'s VAT treatment and correct it through the proper accounting flow — do not change VAT treatment directly on a posted transaction.',
        autoResolutionSafe: false,
      });
    }
  }

  return issues;
}
