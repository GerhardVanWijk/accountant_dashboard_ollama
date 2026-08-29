import type { BankAccount } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { JournalEntryService } from '@/features/accounting/services';
import type { AccountMapper } from '@/features/accounting/services';
import { reconcileAccountsPayable, reconcileAccountsReceivable } from '@/features/accounting/services/subledgerReconciliation';
import type { Bill, CreditNote, CustomerReceipt, Invoice, Payment } from '@/types';
import {
  checkBankSubledgerIntegrity,
  checkJournalEntriesBalance,
  checkTrialBalance,
  checkSubledgerReconciliation,
  type BooksIntegrityCheckResult,
} from './checks';

export interface BooksIntegrityInput {
  bankAccount: BankAccount;
  bankTransactions: BankTransactionWithAllocations[];
  invoices: Invoice[];
  bills: Bill[];
  creditNotes: CreditNote[];
  customerReceipts: CustomerReceipt[];
  supplierPayments: Payment[];
  /** Set by the caller once the current investigation run has produced its own results — avoids re-deriving the same detectors twice. */
  editedAfterReconciliationCount: number;
  openingBalanceIssueFound: boolean;
}

/**
 * The whole-books integrity summary (spec's "Books Integrity" screen) —
 * composes checks that already exist in this codebase
 * (computeTrialBalance, reconcileAccountsReceivable/Payable) with the new
 * ones this module adds (per-entry balance verification, Bank GL vs. bank
 * subledger, edited-after-reconciliation, opening-balance). Deliberately
 * does not invent a VAT check here — vatReportService.reconcileVatControlAccounts()
 * already exists and needs a computed VatReport for a specific period as
 * input, which is a materially bigger dependency chain than this screen
 * should force on every reconciliation load; the VAT Return page is the
 * right home for that check (per "adapt to what actually exists" rather
 * than fabricate a call chain for the sake of one more green tick here).
 */
export async function runBooksIntegrityCheck(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger' | 'computeTrialBalance' | 'getEntries'>,
  accounts: AccountMapper,
  input: BooksIntegrityInput,
): Promise<BooksIntegrityCheckResult[]> {
  const [entries, trialBalance, bankLedgerRows] = await Promise.all([
    journalEntryService.getEntries(),
    journalEntryService.computeTrialBalance(),
    journalEntryService.getAccountLedger(input.bankAccount.glAccountId),
  ]);

  const postedEntries = entries.filter((e) => e.status === 'posted');

  const results: BooksIntegrityCheckResult[] = [
    checkJournalEntriesBalance(postedEntries),
    checkTrialBalance(trialBalance),
    checkBankSubledgerIntegrity(input.bankAccount, bankLedgerRows, input.bankTransactions),
  ];

  if (input.invoices.length > 0) {
    const ar = await reconcileAccountsReceivable(journalEntryService, accounts, input.invoices, input.creditNotes, input.customerReceipts);
    results.push(checkSubledgerReconciliation('Accounts Receivable', 'ar_subledger', ar));
  }
  if (input.bills.length > 0) {
    const ap = await reconcileAccountsPayable(journalEntryService, accounts, input.bills, input.supplierPayments);
    results.push(checkSubledgerReconciliation('Accounts Payable', 'ap_subledger', ap));
  }

  results.push({
    key: 'edited_after_reconciliation',
    label: 'Edited reconciled transactions',
    status: input.editedAfterReconciliationCount === 0 ? 'pass' : 'warning',
    detail:
      input.editedAfterReconciliationCount === 0
        ? 'None detected.'
        : `${input.editedAfterReconciliationCount} previously-reconciled transaction(s) had their journal entry reversed afterward.`,
  });

  results.push({
    key: 'opening_balance',
    label: 'Opening balance',
    status: input.openingBalanceIssueFound ? 'warning' : 'pass',
    detail: input.openingBalanceIssueFound ? 'The unexplained difference predates the current reconciliation period.' : 'No pre-period discrepancy detected in this run.',
  });

  return results;
}
