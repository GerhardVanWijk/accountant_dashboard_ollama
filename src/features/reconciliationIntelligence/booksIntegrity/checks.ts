import type { BankAccount, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { TrialBalance, LedgerRow } from '@/features/accounting/services';
import type { SubledgerReconciliation } from '@/features/accounting/services/subledgerReconciliation';
import { toCents } from '../utils/money';

export type BooksIntegrityStatus = 'pass' | 'warning' | 'not_checked';

export interface BooksIntegrityCheckResult {
  key: string;
  label: string;
  status: BooksIntegrityStatus;
  detail: string;
}

/**
 * Every posted JournalEntry must individually balance (sum(debit) ===
 * sum(credit)) — postJournalEntry() already enforces this at write time
 * (docs/LEDGER_ARCHITECTURE.md), so this check should always pass. It
 * exists as independent verification, not blind trust: if it ever fails,
 * something bypassed the service layer (a hand-edited seed row, a storage
 * bug), and this identifies exactly which entry.
 */
const BALANCE_EPSILON_CENTS = 1;

export function checkJournalEntriesBalance(entries: JournalEntry[]): BooksIntegrityCheckResult {
  const unbalanced = entries.filter((entry) => {
    const totalDebit = entry.lines.reduce((sum, l) => sum + toCents(l.debit), 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + toCents(l.credit), 0);
    return Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON_CENTS;
  });

  return {
    key: 'gl_balance',
    label: 'General Ledger — debits equal credits',
    status: unbalanced.length === 0 ? 'pass' : 'warning',
    detail:
      unbalanced.length === 0
        ? `All ${entries.length} posted journal entries balance.`
        : `${unbalanced.length} entry(ies) do not balance: ${unbalanced.map((e) => e.entryNumber).join(', ')}.`,
  };
}

export function checkTrialBalance(trialBalance: TrialBalance): BooksIntegrityCheckResult {
  return {
    key: 'trial_balance',
    label: 'Trial Balance',
    status: trialBalance.balanced ? 'pass' : 'warning',
    detail: trialBalance.balanced
      ? `Balanced — total debits and credits both R${trialBalance.totalDebits.toFixed(2)}.`
      : `Out of balance: debits R${trialBalance.totalDebits.toFixed(2)} vs. credits R${trialBalance.totalCredits.toFixed(2)}.`,
  };
}

/**
 * Compares the bank account's GL control-account balance (the real posted
 * ledger, via journalEntryService.getAccountLedger()) against the Banking
 * subledger's own running total (openingBalance + every BankTransaction's
 * signed amount — the same formula bankReconciliationService.computeSummary()
 * uses for glCashbookBalance). Structurally identical to
 * reconcileAccountsReceivable()/reconcileAccountsPayable()
 * (src/features/accounting/services/subledgerReconciliation.ts) applied to
 * Banking instead of AR/AP — nothing in the codebase compared these two
 * before. A variance here means something posted to the bank's GL account
 * WITHOUT going through bankTransactionService (a manual journal entry, a
 * bypass) — a genuinely different and more serious problem than an ordinary
 * bank-vs-statement timing difference.
 */
export function checkBankSubledgerIntegrity(bankAccount: BankAccount, ledgerRows: LedgerRow[], transactions: BankTransactionWithAllocations[]): BooksIntegrityCheckResult {
  const glBalanceCents = ledgerRows.length > 0 ? toCents(ledgerRows[ledgerRows.length - 1].runningBalance) : 0;
  const subledgerCents =
    toCents(bankAccount.openingBalance) + transactions.reduce((sum, t) => sum + (t.direction === 'debit' ? toCents(t.amount) : -toCents(t.amount)), 0);
  const varianceCents = glBalanceCents - subledgerCents;

  return {
    key: 'bank_gl_vs_subledger',
    label: 'Bank GL vs. bank transaction subledger',
    status: Math.abs(varianceCents) <= BALANCE_EPSILON_CENTS ? 'pass' : 'warning',
    detail:
      Math.abs(varianceCents) <= BALANCE_EPSILON_CENTS
        ? 'The bank GL control account agrees with the Banking subledger.'
        : `R${(Math.abs(varianceCents) / 100).toFixed(2)} difference — something posted to this account's GL control account outside the normal Banking flow.`,
  };
}

export function checkSubledgerReconciliation(label: string, key: string, reconciliation: SubledgerReconciliation): BooksIntegrityCheckResult {
  return {
    key,
    label,
    status: reconciliation.isReconciled ? 'pass' : 'warning',
    detail: reconciliation.isReconciled
      ? 'GL control account agrees with the subledger.'
      : `R${Math.abs(reconciliation.variance).toFixed(2)} variance between the GL control account and the subledger.`,
  };
}

/**
 * Every posted document type this app has (Invoice, Bill, etc.) can, in
 * principle, claim a posted-equivalent status while carrying no
 * journalEntryId — a real integrity gap the SA master spec calls out
 * explicitly. Generic over any {status, journalEntryId}-shaped source so
 * every module (Sales, Purchases, Fixed Assets, Payroll...) can feed this
 * the same way, without this module depending on any of them directly.
 */
export interface PostableDocumentLike {
  id: string;
  documentNumber: string;
  status: string;
  journalEntryId?: string;
}

export function checkOrphanedPostedDocuments(label: string, key: string, documents: PostableDocumentLike[], postedStatuses: string[]): BooksIntegrityCheckResult {
  const orphaned = documents.filter((d) => postedStatuses.includes(d.status) && !d.journalEntryId);
  return {
    key,
    label,
    status: orphaned.length === 0 ? 'pass' : 'warning',
    detail:
      orphaned.length === 0
        ? `All ${documents.length} checked document(s) with a posted status carry a real GL posting.`
        : `${orphaned.length} document(s) claim a posted status with no GL entry: ${orphaned.map((d) => d.documentNumber).join(', ')}.`,
  };
}

/** More than one distinct source record pointing at the same JournalEntry id — the same document/transaction posted to the GL twice. */
export function checkDuplicateGlPosting(label: string, key: string, documents: PostableDocumentLike[]): BooksIntegrityCheckResult {
  const byEntry = new Map<string, PostableDocumentLike[]>();
  for (const doc of documents) {
    if (!doc.journalEntryId) continue;
    const bucket = byEntry.get(doc.journalEntryId);
    if (bucket) bucket.push(doc);
    else byEntry.set(doc.journalEntryId, [doc]);
  }
  const duplicated = [...byEntry.entries()].filter(([, docs]) => docs.length > 1);

  return {
    key,
    label,
    status: duplicated.length === 0 ? 'pass' : 'warning',
    detail:
      duplicated.length === 0
        ? 'No journal entry is referenced by more than one document.'
        : `${duplicated.length} journal entry(ies) referenced by more than one document: ${duplicated.map(([entryId]) => entryId).join(', ')}.`,
  };
}
