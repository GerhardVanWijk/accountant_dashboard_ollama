import type { ID, ReconciliationIssue } from '@/types';

/**
 * A normalized, side-tagged item the detectors compare against each other.
 * Built from two real, already-correct data sources (never invented data):
 * 'bank' items come from imported (source: 'import') BankTransaction rows —
 * this app converts a statement import directly into BankTransaction rows
 * (bankTransactionService.importStatementLines()), so there is no separate
 * "raw statement line" table to compare against; an import IS the bank's
 * own version of events. 'books' items come from every other BankTransaction
 * (manually recorded / a transfer leg) plus any JournalEntry line posted
 * directly against this bank account's GL account with NO BankTransaction
 * row behind it at all (a manual journal entry that bypassed
 * bankTransactionService — see buildOrphanedLedgerCandidates in
 * utils/candidates.ts).
 */
export interface InvestigationCandidate {
  id: ID;
  side: 'bank' | 'books';
  kind: 'bank_transaction' | 'journal_entry';
  date: string;
  description: string;
  reference?: string;
  /** Signed: positive = money in (debit/receipt), negative = money out (credit/payment) — matches BankTransaction.direction's convention. */
  amountCents: number;
  bankTransactionId?: ID;
  journalEntryId?: ID;
  status?: string;
}

/** One detector's output before the orchestrator assigns bankAccountId/statementDate/status and persists it. */
export type ReconciliationIssueDraft = Omit<
  ReconciliationIssue,
  'id' | 'createdAt' | 'updatedAt' | 'bankAccountId' | 'statementDate' | 'status' | 'resolutionActorUserId' | 'resolutionDate' | 'resolutionReason'
>;

export interface MatchPair {
  bank: InvestigationCandidate;
  books: InvestigationCandidate;
  daysApart: number;
  referenceMatches: boolean;
  descriptionOverlap: number;
}

export interface MatchClassification {
  /** Same amount, same date, strong reference/description match. */
  confirmed: MatchPair[];
  /** Same amount, within date tolerance, some but not exact signal — includes every genuine date-offset timing case. */
  probable: MatchPair[];
  unmatchedBank: InvestigationCandidate[];
  unmatchedBooks: InvestigationCandidate[];
}
