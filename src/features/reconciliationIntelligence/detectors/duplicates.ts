import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { fromCents } from '../utils/money';
import { daysBetween, descriptionOverlap } from '../utils/textMatching';

const DUPLICATE_DATE_TOLERANCE_DAYS = 3;

/**
 * Scans ONE side's pool (bank imports against each other, or books entries
 * against each other — never cross-side, that's classifyMatches()'s job)
 * for likely duplicates: same amount, same or nearby date, and a real
 * reference/description signal so two genuinely unrelated same-amount
 * transactions on the same day don't false-positive. Never deletes
 * anything — every hit is a candidate for human review.
 */
export function detectDuplicates(pool: InvestigationCandidate[]): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];
  const flaggedPairs = new Set<string>();

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a.amountCents !== b.amountCents) continue;
      const daysApart = daysBetween(a.date, b.date);
      if (daysApart > DUPLICATE_DATE_TOLERANCE_DAYS) continue;

      const refMatch = Boolean(a.reference && b.reference && a.reference.trim().toLowerCase() === b.reference.trim().toLowerCase());
      const descOverlap = descriptionOverlap(a.description, b.description);
      if (!refMatch && descOverlap < 0.6) continue;

      const pairKey = [a.id, b.id].sort().join('|');
      if (flaggedPairs.has(pairKey)) continue;
      flaggedPairs.add(pairKey);

      const dateFrom = a.date < b.date ? a.date : b.date;
      const dateTo = a.date < b.date ? b.date : a.date;

      const { value: confidence, evidence, evidenceData } = buildEvidence({
        detectorType: 'duplicate_transaction',
        factors: [
          { key: 'identical_amount', points: 35, maxPoints: 35, label: 'Identical amount', met: true },
          { key: 'date_proximity', points: 25, maxPoints: 25, label: daysApart === 0 ? 'Same date' : `${daysApart} day(s) apart`, met: true, observedValue: `${daysApart} days` },
          { key: 'reference_match', points: 25, maxPoints: 25, label: 'Reference matches exactly', met: refMatch, observedValue: refMatch },
          { key: 'description_overlap', points: 15, maxPoints: 15, label: 'Description text overlaps strongly', met: descOverlap >= 0.6, observedValue: descOverlap },
        ],
        fields: {
          amountDifferenceCents: 0,
          dateDifferenceDays: daysApart,
          referenceSimilarity: refMatch ? 1 : descOverlap,
          sameCounterparty: refMatch || descOverlap >= 0.6,
          sameDirection: true,
          sameBankAccount: a.side === 'bank' && b.side === 'bank',
          candidateSourceType: a.kind === 'journal_entry' ? 'journal_entry' : a.kind === 'statement_line' ? 'statement_line' : 'bank_transaction',
          candidateSourceId: b.id,
          varianceExplainedCents: Math.abs(a.amountCents),
          bankAmountCents: a.side === 'bank' ? a.amountCents : undefined,
          booksAmountCents: a.side === 'books' ? a.amountCents : undefined,
          counterpartyLabel: a.description,
          observedDateFrom: dateFrom,
          observedDateTo: dateTo,
        },
      });

      issues.push({
        issueType: 'duplicate_transaction',
        severity: 'medium',
        confidence,
        effectAmount: fromCents(Math.abs(a.amountCents)),
        affectedDateFrom: dateFrom,
        affectedDateTo: dateTo,
        relatedBankTransactionIds: [a.bankTransactionId, b.bankTransactionId].filter((x): x is string => Boolean(x)),
        relatedJournalEntryIds: [a.journalEntryId, b.journalEntryId].filter((x): x is string => Boolean(x)),
        relatedSourceDocumentIds: [],
        explanation: renderExplanation(evidenceData, 'duplicate_transaction'),
        evidence,
        evidenceData,
        suggestedResolution: 'Review both records — if genuinely duplicated, void/reverse one through the proper accounting flow rather than deleting it.',
        autoResolutionSafe: false,
      });
    }
  }

  return issues;
}
