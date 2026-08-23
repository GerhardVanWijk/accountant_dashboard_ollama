import type { Bill, ID, Invoice } from '@/types';
import type { JournalEntryService } from './journalEntryService';
import type { AccountMapper } from './accountMappingService';
import { invoicesToOpenItems } from '@/features/customers/mock-data/openItems';
import { billsToOpenBills } from '@/features/suppliers/utils/calculateAging';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. */
const VARIANCE_EPSILON = 0.005;

export interface SubledgerReconciliation {
  controlAccountId: ID;
  /** The GL control account's current posted balance. */
  controlAccountBalance: number;
  /** Sum of the subledger's own outstanding balances (open invoices/bills). */
  subledgerTotal: number;
  /** controlAccountBalance - subledgerTotal. Zero (within epsilon) means they agree. */
  variance: number;
  isReconciled: boolean;
}

async function controlAccountBalance(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accountId: ID,
): Promise<number> {
  const rows = await journalEntryService.getAccountLedger(accountId);
  return rows.length > 0 ? rows[rows.length - 1].runningBalance : 0;
}

/**
 * Compares the Accounts Receivable control account's posted GL balance
 * against the sum of every customer's real outstanding invoice balance —
 * the check SA_ACCOUNTING_MASTER_SPEC.md §17/§70/§71 requires and which,
 * before this, nothing in the codebase computed (see
 * docs/KNOWN_ISSUES.md). A non-zero variance means either an invoice
 * posted without going through `invoiceService.postInvoice()`, or a
 * payment/allocation was recorded against the subledger without a
 * matching GL entry — both indicate a real bug, not normal drift.
 */
export async function reconcileAccountsReceivable(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  invoices: Invoice[],
): Promise<SubledgerReconciliation> {
  const subledgerTotal = invoicesToOpenItems(invoices).reduce((sum, item) => sum + item.amountOutstanding, 0);
  const arControlAccountId = await accounts.getAccountId('AR');
  const balance = await controlAccountBalance(journalEntryService, arControlAccountId);
  const variance = balance - subledgerTotal;
  return {
    controlAccountId: arControlAccountId,
    controlAccountBalance: balance,
    subledgerTotal,
    variance,
    isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
  };
}

/** Accounts Payable equivalent of reconcileAccountsReceivable() above. */
export async function reconcileAccountsPayable(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  bills: Bill[],
): Promise<SubledgerReconciliation> {
  const subledgerTotal = billsToOpenBills(bills).reduce((sum, bill) => sum + bill.amount, 0);
  const apControlAccountId = await accounts.getAccountId('AP');
  const balance = await controlAccountBalance(journalEntryService, apControlAccountId);
  const variance = balance - subledgerTotal;
  return {
    controlAccountId: apControlAccountId,
    controlAccountBalance: balance,
    subledgerTotal,
    variance,
    isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
  };
}
