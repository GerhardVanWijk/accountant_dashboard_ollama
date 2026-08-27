import type { ID } from '@/types';
import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildConfidence } from '../utils/confidence';
import { fromCents } from '../utils/money';
import { daysBetween } from '../utils/textMatching';

const DATE_TOLERANCE_DAYS = 3;

export interface OtherAccountPool {
  bankAccountId: ID;
  bankAccountName: string;
  candidates: InvestigationCandidate[];
}

/**
 * An entry the books show as belonging to THIS account, but which never
 * turned up on this account's bank statement, may simply have been posted
 * against the wrong bank GL account — checked by looking for a matching
 * unexplained item on every OTHER bank account's own statement-side pool.
 * Finding one there is strong evidence the transaction is real, just
 * mis-attributed, rather than missing entirely.
 */
export function detectWrongBankAccount(unmatchedBooksOnThisAccount: InvestigationCandidate[], otherAccounts: OtherAccountPool[]): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];

  for (const books of unmatchedBooksOnThisAccount) {
    for (const other of otherAccounts) {
      const match = other.candidates.find((bank) => bank.amountCents === books.amountCents && daysBetween(bank.date, books.date) <= DATE_TOLERANCE_DAYS);
      if (!match) continue;

      const daysApart = daysBetween(match.date, books.date);
      const { value: confidence, evidence } = buildConfidence([
        { points: 40, label: `Matching R${fromCents(Math.abs(books.amountCents)).toFixed(2)} item found on ${other.bankAccountName}'s statement`, met: true },
        { points: 30, label: daysApart === 0 ? 'Same date' : `${daysApart} day(s) apart`, met: true },
        { points: 20, label: 'Not otherwise explained on this account', met: true },
      ]);

      issues.push({
        issueType: 'wrong_bank_account',
        severity: 'medium',
        confidence,
        effectAmount: fromCents(books.amountCents),
        affectedDateFrom: books.date,
        affectedDateTo: match.date,
        relatedBankTransactionIds: [books.bankTransactionId, match.bankTransactionId].filter((x): x is string => Boolean(x)),
        relatedJournalEntryIds: [books.journalEntryId].filter((x): x is string => Boolean(x)),
        relatedSourceDocumentIds: [],
        explanation: `"${books.description}" (R${fromCents(Math.abs(books.amountCents)).toFixed(2)}) is unexplained here, but a matching item appears on ${other.bankAccountName}'s bank statement instead — likely posted to the wrong bank account.`,
        evidence,
        suggestedResolution: 'Confirm which account the transaction actually belongs to, then correct the GL account through a proper reallocation/journal correction.',
        autoResolutionSafe: false,
      });
      break;
    }
  }

  return issues;
}
