import type { InvestigationCandidate, MatchClassification, MatchPair } from '../types';
import { daysBetween, descriptionOverlap, referencesMatch } from './textMatching';

const DEFAULT_DATE_TOLERANCE_DAYS = 7;

/**
 * Greedy best-match pairing between the bank-side and books-side candidate
 * pools: exact amount is a hard filter (a bank line can only ever
 * correspond to a books entry of the identical magnitude and direction —
 * anything else is a genuinely different problem, handled by
 * detectors/amountMismatch.ts, not this matcher). Within that, a pair
 * within `dateToleranceDays` and with same-day date + a real reference or
 * description signal is 'confirmed'; anything else within tolerance is
 * 'probable' (this is exactly the date-offset-timing case — see
 * detectors/dateOffsetTiming.ts). Greedy is intentional and matches the
 * spec's own performance guidance: exact lookup first, real-world
 * reconciliation data has few genuine ambiguous ties once amount+direction
 * narrows the field this far.
 */
export function classifyMatches(
  bankSide: InvestigationCandidate[],
  booksSide: InvestigationCandidate[],
  dateToleranceDays: number = DEFAULT_DATE_TOLERANCE_DAYS,
): MatchClassification {
  const claimedBooks = new Set<string>();
  const confirmed: MatchPair[] = [];
  const probable: MatchPair[] = [];
  const unmatchedBank: InvestigationCandidate[] = [];

  for (const bank of bankSide) {
    let best: MatchPair | undefined;
    for (const books of booksSide) {
      if (claimedBooks.has(books.id)) continue;
      if (books.amountCents !== bank.amountCents) continue;
      const daysApart = daysBetween(bank.date, books.date);
      if (daysApart > dateToleranceDays) continue;

      const candidate: MatchPair = {
        bank,
        books,
        daysApart,
        referenceMatches: referencesMatch(bank.reference, books.reference),
        descriptionOverlap: descriptionOverlap(bank.description, books.description),
      };
      if (!best || candidate.daysApart < best.daysApart) best = candidate;
    }

    if (!best) {
      unmatchedBank.push(bank);
      continue;
    }

    claimedBooks.add(best.books.id);
    const isConfirmed = best.daysApart === 0 && (best.referenceMatches || best.descriptionOverlap >= 0.5);
    (isConfirmed ? confirmed : probable).push(best);
  }

  const unmatchedBooks = booksSide.filter((b) => !claimedBooks.has(b.id));

  return { confirmed, probable, unmatchedBank, unmatchedBooks };
}
