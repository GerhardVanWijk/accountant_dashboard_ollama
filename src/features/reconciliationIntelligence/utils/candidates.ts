import type { BankStatementLine, ID, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { InvestigationCandidate } from '../types';
import { toCents } from './money';

function signedCents(amount: number, direction: 'debit' | 'credit'): number {
  const cents = toCents(amount);
  return direction === 'debit' ? cents : -cents;
}

const day = (iso: string): string => iso.slice(0, 10);

/**
 * The PREFERRED bank side (P2.1 / migration 0020): the real
 * `bank_statement_lines` rows for the window — the bank's own version of
 * events, with a first-class identity, instead of inferring it from
 * `bank_transactions` with `source='import'`
 * (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md §5). Used by the orchestrator
 * whenever a statement exists for the window; `buildBankSideCandidates`
 * below stays as the documented fallback for accounts with no persisted
 * statement yet.
 */
export function buildBankSideCandidatesFromStatementLines(
  lines: BankStatementLine[],
  windowStart: string,
  windowEnd: string,
): InvestigationCandidate[] {
  return lines
    .filter((l) => day(l.txnDate) >= windowStart && day(l.txnDate) <= windowEnd)
    .map((l) => ({
      id: l.id,
      side: 'bank' as const,
      kind: 'statement_line' as const,
      date: day(l.txnDate),
      description: l.description,
      reference: l.reference,
      amountCents: signedCents(l.amount, l.direction),
      bankStatementLineId: l.id,
      bankTransactionId: l.matchedBankTransactionId,
      lineState: l.lineState,
      valueDate: l.valueDate ? day(l.valueDate) : undefined,
      runningBalance: l.runningBalance,
      status: l.lineState,
    }));
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
