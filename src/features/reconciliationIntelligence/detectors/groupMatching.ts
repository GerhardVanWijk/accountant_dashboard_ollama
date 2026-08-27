import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { fromCents } from '../utils/money';
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
  const { value: confidence, evidence } = buildConfidence([
    { points: 45, label: `${group.length} entries sum exactly to R${fromCents(Math.abs(single.amountCents)).toFixed(2)}`, met: true },
    { points: 25, label: spread <= 3 ? 'All within a few days of each other' : `Spans ${spread} days`, met: spread <= 3 },
    { points: 15, label: 'Same direction (all money in, or all money out)', met: true },
  ]);

  const groupList = group.map((g) => `R${fromCents(Math.abs(g.amountCents)).toFixed(2)} (${g.description})`).join(', ');
  const explanation =
    direction === 'one_bank_to_many_books'
      ? `One bank line of R${fromCents(Math.abs(single.amountCents)).toFixed(2)} matches ${group.length} separate books entries: ${groupList}.`
      : `One books entry of R${fromCents(Math.abs(single.amountCents)).toFixed(2)} matches ${group.length} separate bank lines: ${groupList}.`;

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
    affectedDateFrom: [single, ...group].map((i) => i.date).sort()[0],
    affectedDateTo: [single, ...group].map((i) => i.date).sort().slice(-1)[0],
    relatedBankTransactionIds: bankTxnIds.filter((x): x is string => Boolean(x)),
    relatedJournalEntryIds: journalEntryIds.filter((x): x is string => Boolean(x)),
    relatedSourceDocumentIds: [],
    explanation,
    evidence,
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
