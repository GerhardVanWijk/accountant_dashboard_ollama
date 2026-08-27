import type { ID, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { InvestigationCandidate } from '../types';
import { toCents } from './money';

function signedCents(amount: number, direction: 'debit' | 'credit'): number {
  const cents = toCents(amount);
  return direction === 'debit' ? cents : -cents;
}

/** The bank's own version of events — see types.ts's doc comment for why "imported" is the right proxy. */
export function buildBankSideCandidates(
  transactions: BankTransactionWithAllocations[],
  windowStart: string,
  windowEnd: string,
): InvestigationCandidate[] {
  return transactions
    .filter((t) => t.source === 'import' && t.date >= windowStart && t.date <= windowEnd)
    .map((t) => ({
      id: t.id,
      side: 'bank' as const,
      kind: 'bank_transaction' as const,
      date: t.date,
      description: t.description,
      reference: t.reference,
      amountCents: signedCents(t.amount, t.direction),
      bankTransactionId: t.id,
      journalEntryId: t.journalEntryId,
      status: t.status,
    }));
}

/** Manually-recorded/transfer BankTransactions — the books' own version of events for those. */
export function buildBooksSideCandidatesFromTransactions(
  transactions: BankTransactionWithAllocations[],
  windowStart: string,
  windowEnd: string,
): InvestigationCandidate[] {
  return transactions
    .filter((t) => t.source !== 'import' && t.date >= windowStart && t.date <= windowEnd)
    .map((t) => ({
      id: t.id,
      side: 'books' as const,
      kind: 'bank_transaction' as const,
      date: t.date,
      description: t.description,
      reference: t.reference,
      amountCents: signedCents(t.amount, t.direction),
      bankTransactionId: t.id,
      journalEntryId: t.journalEntryId,
      status: t.status,
    }));
}

/**
 * Journal lines posted directly against this bank account's GL account with
 * NO BankTransaction row pointing at the entry at all — a manual journal
 * entry that bypassed bankTransactionService entirely. `postedJournalEntryIds`
 * is every journalEntryId already represented by SOME BankTransaction row
 * (on any account, not just this one — see wrongBankAccount.ts, which reuses
 * this same builder against a different bankGlAccountId to find where a
 * misdirected entry actually landed).
 */
export function buildOrphanedLedgerCandidates(
  entries: JournalEntry[],
  postedJournalEntryIds: Set<ID>,
  bankGlAccountId: ID,
  windowStart: string,
  windowEnd: string,
): InvestigationCandidate[] {
  const candidates: InvestigationCandidate[] = [];
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    if (entry.date < windowStart || entry.date > windowEnd) continue;
    if (postedJournalEntryIds.has(entry.id)) continue;
    for (const line of entry.lines) {
      if (line.accountId !== bankGlAccountId) continue;
      candidates.push({
        id: `${entry.id}_${line.id}`,
        side: 'books',
        kind: 'journal_entry',
        date: entry.date,
        description: line.description ?? entry.memo ?? entry.entryNumber,
        reference: entry.entryNumber,
        amountCents: toCents(line.debit) - toCents(line.credit),
        journalEntryId: entry.id,
      });
    }
  }
  return candidates;
}
