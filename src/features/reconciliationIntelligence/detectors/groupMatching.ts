import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { findSubsetsSumming } from '../utils/subsetSum';

function dateSpreadDays(items: InvestigationCandidate[]): number {
  const times = items.map((i) => new Date(i.date).getTime());
  return Math.round((Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24));
}

function buildGroupIssue(
  single: InvestigationCandidate,
  group: InvestigationCandidate[],
  direction: 'one_bank_to_many_books' | 'many_bank_to_one_books',
): ReconciliationIssueDraft {
  const spread = dateSpreadDays([single, ...group]);
  const allDates = [single, ...group].map((i) => i.date).sort();

  const { value: confidence, evidence, evidenceData } = buildEvidence({
    detectorType: 'grouped_match',
    factors: [
      { key: 'group_sums_exactly', points: 45, maxPoints: 45, label: `${group.length} entries sum exactly to R${Math.abs(single.amountCents / 100).toFixed(2)}`, met: true },
      { key: 'tight_date_cluster', points: 25, maxPoints: 25, label: spread <= 3 ? 'All within a few days of each other' : `Spans ${spread} days`, met: spread <= 3, observedValue: `${spread} days` },
      { key: 'same_direction', points: 15, maxPoints: 15, label: 'Same direction (all money in, or all money out)', met: true },
    ],
    fields: {
      amountDifferenceCents: 0,
      dateDifferenceDays: spread,
      sameDirection: true,
      sameBankAccount: true,
      candidateSourceType: direction === 'one_bank_to_many_books' ? 'journal_entry' : 'statement_line',
      candidateSourceId: single.id,
      varianceExplainedCents: 0,
      counterpartyLabel: single.description,
      observedDateFrom: allDates[0],
      observedDateTo: allDates[allDates.length - 1],
      groupSingleCents: single.amountCents,
      groupPartCount: group.length,
      combinationTerms: group.map((g) => ({ label: `${g.description}, ${g.date}`, amountCents: g.amountCents })),
      combinationTotalCents: group.reduce((s, g) => s + g.amountCents, 0),
    },
  });

  const bankTxnIds =
    direction === 'one_bank_to_many_books'
      ? [single.bankTransactionId, ...group.map((g) => g.bankTransactionId)]
      : [...group.map((g) => g.bankTransactionId), single.bankTransactionId];
  const journalEntryIds =
    direction === 'one_bank_to_many_books'
      ? [single.journalEntryId, ...group.map((g) => g.journalEntryId)]
      : [...group.map((g) => g.journalEntryId), single.journalEntryId];

  return {
    issueType: 'grouped_match',
    severity: 'info',
    confidence,
    effectAmount: 0,
    affectedDateFrom: allDates[0],
    affectedDateTo: allDates[allDates.length - 1],
    relatedBankTransactionIds: bankTxnIds.filter((x): x is string => Boolean(x)),
    relatedJournalEntryIds: journalEntryIds.filter((x): x is string => Boolean(x)),
    relatedSourceDocumentIds: [],
    explanation: renderExplanation(evidenceData, 'grouped_match'),
    evidence,
    evidenceData,
    suggestedResolution: 'Confirm the grouping and mark all items as matched together.',
    autoResolutionSafe: true,
  };
}

/**
 * A single bank line can legitimately equal several accounting entries
 * (one deposit = three customer receipts banked together) or vice versa
 * (several bank debit-order instalments = one supplier bill). Both
 * directions reuse the same bounded amount-indexed subset-sum search
 * (utils/subsetSum.ts, singles/pairs/triples only) rather than an
 * unbounded power-set scan. Once a group is found for a single item, its
 * members are removed from further group-matching consideration in this
 * pass so the same entry isn't claimed by two different groups.
 */
export function detectGroupMatches(unmatchedBank: InvestigationCandidate[], unmatchedBooks: InvestigationCandidate[]): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];
  const claimedBookIds = new Set<string>();
  const claimedBankIds = new Set<string>();

  for (const bank of unmatchedBank) {
    const pool = unmatchedBooks.filter((b) => !claimedBookIds.has(b.id) && Math.sign(b.amountCents) === Math.sign(bank.amountCents));
    const matches = findSubsetsSumming(pool, bank.amountCents, 1);
    const best = matches.find((m) => m.indexes.length >= 2);
    if (!best) continue;
    const group = best.indexes.map((i) => pool[i]);
    group.forEach((g) => claimedBookIds.add(g.id));
    claimedBankIds.add(bank.id);
    issues.push(buildGroupIssue(bank, group, 'one_bank_to_many_books'));
  }

  for (const books of unmatchedBooks) {
    if (claimedBookIds.has(books.id)) continue;
    const pool = unmatchedBank.filter((b) => !claimedBankIds.has(b.id) && Math.sign(b.amountCents) === Math.sign(books.amountCents));
    const matches = findSubsetsSumming(pool, books.amountCents, 1);
    const best = matches.find((m) => m.indexes.length >= 2);
    if (!best) continue;
    const group = best.indexes.map((i) => pool[i]);
    group.forEach((g) => claimedBankIds.add(g.id));
    claimedBookIds.add(books.id);
    issues.push(buildGroupIssue(books, group, 'many_bank_to_one_books'));
  }

  return issues;
}
