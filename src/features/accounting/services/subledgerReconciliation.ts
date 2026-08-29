import type { Bill, CreditNote, CustomerReceipt, ID, Invoice, Payment } from '@/types';
import type { JournalEntryService } from './journalEntryService';
import type { AccountMapper } from './accountMappingService';
import { invoicesToOpenItems } from '@/features/customers/mock-data/openItems';
import { billsToOpenBills } from '@/features/suppliers/utils/calculateAging';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. */
const VARIANCE_EPSILON = 0.005;

/** Credit-note statuses that have actually posted a GL credit to the AR control account. */
const POSTED_CREDIT_NOTE_STATUSES: CreditNote['status'][] = ['issued', 'allocated'];

/**
 * The legitimate reconciling items between the aging subledger (what the
 * aging report shows) and the GL-consistent subledger (what the GL control
 * account actually holds). For a fully app-consistent dataset `other` is
 * ~0; a non-zero `other` flags a real anomaly — e.g. a credit-note
 * allocation that never reduced the invoice it was allocated against.
 */
export interface SubledgerBridge {
  /** Money received but not yet applied to an invoice/bill — GL is credited in full, the aging subledger never moves for it. */
  unallocatedReceipts: number;
  /** Unallocated balance of posted credit notes (Σ total − amountAllocated) — a genuine customer/supplier credit the aging view can't show. */
  creditNoteImpact: number;
  /** agingSubledgerTotal − subledgerTotal − unallocatedReceipts − creditNoteImpact. ~0 for a consistent dataset; non-zero is an anomaly worth surfacing. */
  other: number;
}

export interface SubledgerReconciliation {
  controlAccountId: ID;
  /** The GL control account's current posted balance. */
  controlAccountBalance: number;
  /**
   * The GL-consistent subledger total — the reconciling number. Built as
   * the sum of every posting that hits the control account for this
   * document set (Σ posted-invoice.total − Σ receipt.amount − Σ posted-CN.total
   * for AR; the bill/payment/adjustment mirror for AP), so it equals the GL
   * control account balance by construction.
   */
  subledgerTotal: number;
  /**
   * The aging-report subledger: Σ open-invoice (or open-bill) outstanding
   * balance. Still useful — it's what the aging report renders — but it
   * differs from the GL by the legitimate items in `bridge`.
   */
  agingSubledgerTotal: number;
  /** Decomposition of `agingSubledgerTotal − subledgerTotal` into its legitimate parts. */
  bridge: SubledgerBridge;
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

function isPostedInvoice(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'void';
}

function isPostedBill(bill: Bill): boolean {
  return bill.status !== 'draft' && bill.status !== 'void';
}

function isPostedCreditNote(creditNote: CreditNote): boolean {
  return POSTED_CREDIT_NOTE_STATUSES.includes(creditNote.status);
}

/**
 * Compares the Accounts Receivable control account's posted GL balance
 * against the customer subledger — the check SA_ACCOUNTING_MASTER_SPEC.md
 * §17/§70/§71 requires.
 *
 * The reconciling ("GL-consistent") subledger is built the only way that
 * ties to the GL by construction — as the sum of every posting that hits
 * the AR control account for this customer set:
 *
 *   Σ posted-invoice.total − Σ customer-receipt.amount − Σ posted-CN.total
 *
 * ("posted invoice" = not draft/void; "posted credit note" = issued or
 * allocated; receipts contribute their FULL amount because a real
 * `recordReceipt()` credits AR for the full amount regardless of how much
 * is allocated to an invoice.)
 *
 * The aging subledger (Σ open-invoice outstanding — the number the aging
 * report shows) is also returned, along with an explicit `bridge`
 * decomposing the gap between the two into unallocated receipts, the
 * unallocated credit-note balance, and an `other` remainder that should be
 * ~0 for a consistent dataset.
 *
 * A non-zero `variance` (control vs GL-consistent subledger) means either a
 * document posted without going through its posting service, or an
 * allocation was recorded without a matching GL entry — a real bug, not
 * normal drift.
 */
export async function reconcileAccountsReceivable(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  invoices: Invoice[],
  creditNotes: CreditNote[],
  customerReceipts: CustomerReceipt[],
): Promise<SubledgerReconciliation> {
  const postedInvoiceTotal = invoices.filter(isPostedInvoice).reduce((sum, i) => sum + i.total, 0);
  const allReceiptAmount = customerReceipts.reduce((sum, r) => sum + r.amount, 0);
  const postedCreditNotes = creditNotes.filter(isPostedCreditNote);
  const postedCreditNoteTotal = postedCreditNotes.reduce((sum, c) => sum + c.total, 0);

  const glConsistentSubledger = postedInvoiceTotal - allReceiptAmount - postedCreditNoteTotal;
  const agingSubledgerTotal = invoicesToOpenItems(invoices).reduce((sum, item) => sum + item.amountOutstanding, 0);

  const unallocatedReceipts = customerReceipts.reduce((sum, r) => sum + r.unallocatedAmount, 0);
  const creditNoteImpact = postedCreditNotes.reduce((sum, c) => sum + (c.total - c.amountAllocated), 0);
  const other = agingSubledgerTotal - glConsistentSubledger - unallocatedReceipts - creditNoteImpact;

  const arControlAccountId = await accounts.getAccountId('AR');
  const balance = await controlAccountBalance(journalEntryService, arControlAccountId);
  const variance = balance - glConsistentSubledger;

  return {
    controlAccountId: arControlAccountId,
    controlAccountBalance: balance,
    subledgerTotal: glConsistentSubledger,
    agingSubledgerTotal,
    bridge: { unallocatedReceipts, creditNoteImpact, other },
    variance,
    isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
  };
}

/**
 * Accounts Payable equivalent of reconcileAccountsReceivable() above.
 *
 * There are no supplier credit notes in this codebase, so the GL-consistent
 * subledger is:
 *
 *   Σ posted-bill.total − Σ supplier-payment.amount + (nonBillApAdjustments ?? 0)
 *
 * `nonBillApAdjustments` is an optional caller-supplied net figure for AP
 * movements that legitimately don't originate from a `bill` row — e.g. an
 * asset bought on supplier credit (a `fixed_asset`-sourced journal that
 * credits AP), less any known duplicate AP debit. It ADDS to the
 * GL-consistent subledger because it represents real AP the bill table
 * can't see. Default 0 preserves the behaviour for a caller with nothing
 * extra to declare.
 */
export async function reconcileAccountsPayable(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  bills: Bill[],
  supplierPayments: Payment[],
  nonBillApAdjustments = 0,
): Promise<SubledgerReconciliation> {
  const postedBillTotal = bills.filter(isPostedBill).reduce((sum, b) => sum + b.total, 0);
  const allPaymentAmount = supplierPayments.reduce((sum, p) => sum + p.amount, 0);

  const glConsistentSubledger = postedBillTotal - allPaymentAmount + nonBillApAdjustments;
  const agingSubledgerTotal = billsToOpenBills(bills).reduce((sum, bill) => sum + bill.amount, 0);

  const unallocatedReceipts = supplierPayments.reduce((sum, p) => sum + p.unallocatedAmount, 0);
  const creditNoteImpact = 0; // no supplier credit notes in this codebase
  const other = agingSubledgerTotal - glConsistentSubledger - unallocatedReceipts - creditNoteImpact;

  const apControlAccountId = await accounts.getAccountId('AP');
  const balance = await controlAccountBalance(journalEntryService, apControlAccountId);
  const variance = balance - glConsistentSubledger;

  return {
    controlAccountId: apControlAccountId,
    controlAccountBalance: balance,
    subledgerTotal: glConsistentSubledger,
    agingSubledgerTotal,
    bridge: { unallocatedReceipts, creditNoteImpact, other },
    variance,
    isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
  };
}
