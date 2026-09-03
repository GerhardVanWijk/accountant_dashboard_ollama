import type { Bill, CreditNote, CustomerReceipt, Invoice, JournalEntry, JournalLine, Payment, TaxRate } from '@/types';
import { seedTaxRates } from './taxRates';
import { seedJournalEntryId } from './seedJournalEntryId';

/**
 * Generates the SAME JournalEntry a real postInvoice()/postBill()/
 * issueCreditNote()/recordReceipt()/createPayment() call would produce,
 * for every non-draft/non-void seed Invoice/Bill/CreditNote and every
 * fully-allocated seed CustomerReceipt/Payment — so the seed data
 * reconciles against itself (docs/KNOWN_ISSUES.md: previously no seed
 * document had a matching real GL posting, so the AR/AP and VAT
 * reconciliations always showed a variance against fixture data). This
 * intentionally mirrors invoiceService.ts/billService.ts/
 * customerReceiptService.ts/paymentService.ts's account ids and math
 * rather than calling those services directly — repositories/seed data
 * are plain synchronous data, not a place to run async service logic —
 * so keep these in sync if that posting logic ever changes.
 *
 * Increment 4A: a customer receipt is now split — the portion applied to
 * invoices credits Accounts Receivable, the unapplied portion credits
 * Customer Deposits (acc_2600), a contract liability. Every seed receipt is
 * therefore posted (including on-account ones), and `reconcileCustomerDeposits()`
 * ties the deposit balance to Σ unallocatedAmount. Supplier payments are
 * NOT split (Increment 4A is customer-side only) — an on-account seed
 * payment is still excluded below.
 */

const AR_ACCOUNT_ID = 'acc_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acc_2600';
const SALES_REVENUE_ACCOUNT_ID = 'acc_4000';
const VAT_OUTPUT_ACCOUNT_ID = 'acc_2100';
const EXPENSE_ACCOUNT_ID = 'acc_5100';
const VAT_INPUT_ACCOUNT_ID = 'acc_2110';
const AP_ACCOUNT_ID = 'acc_2000';
const CASH_AND_BANK_ACCOUNT_ID = 'acc_1000';

/** Mirrors BillService.splitDeductibleVat() exactly — see that method's doc comment for the conservative-fallback rationale. */
function splitDeductibleVat(lineItems: Bill['lineItems'], taxTotal: number, allTaxRates: TaxRate[]): { deductibleVat: number; nonDeductibleVat: number } {
  let resolvedDeductible = 0;
  for (const line of lineItems) {
    if (!line.taxRateId) continue;
    const rate = allTaxRates.find((r) => r.id === line.taxRateId);
    if (rate && rate.treatment !== 'non_deductible') {
      resolvedDeductible += line.taxAmount;
    }
  }
  const deductibleVat = Math.min(resolvedDeductible, taxTotal);
  return { deductibleVat, nonDeductibleVat: taxTotal - deductibleVat };
}

function isPostedInvoice(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'void';
}

function isPostedBill(bill: Bill): boolean {
  return bill.status !== 'draft' && bill.status !== 'void';
}

function isPostedCreditNote(creditNote: CreditNote): boolean {
  return creditNote.status !== 'draft' && creditNote.status !== 'void';
}

function generateInvoiceEntry(invoice: Invoice, entryNumber: string): JournalEntry {
  const lines: JournalLine[] = [
    { id: `${entryNumber}_1`, accountId: AR_ACCOUNT_ID, description: `Invoice ${invoice.invoiceNumber}`, debit: invoice.total, credit: 0 },
    { id: `${entryNumber}_2`, accountId: SALES_REVENUE_ACCOUNT_ID, description: `Invoice ${invoice.invoiceNumber}`, debit: 0, credit: invoice.subtotal },
  ];
  if (invoice.taxTotal > 0) {
    lines.push({ id: `${entryNumber}_3`, accountId: VAT_OUTPUT_ACCOUNT_ID, description: 'VAT Output', debit: 0, credit: invoice.taxTotal });
  }
  return {
    id: seedJournalEntryId(invoice.id),
    entryNumber,
    date: invoice.issueDate,
    memo: `Invoice ${invoice.invoiceNumber}`,
    source: 'invoice',
    status: 'posted',
    postedAt: invoice.issueDate,
    currency: 'ZAR',
    lines,
    createdAt: invoice.issueDate,
    updatedAt: invoice.issueDate,
  };
}

function generateBillEntry(bill: Bill, entryNumber: string, allTaxRates: TaxRate[]): JournalEntry {
  const { deductibleVat, nonDeductibleVat } = splitDeductibleVat(bill.lineItems, bill.taxTotal, allTaxRates);
  const lines: JournalLine[] = [
    { id: `${entryNumber}_1`, accountId: EXPENSE_ACCOUNT_ID, description: `Bill ${bill.billNumber}`, debit: bill.subtotal + nonDeductibleVat, credit: 0 },
  ];
  if (deductibleVat > 0) {
    lines.push({ id: `${entryNumber}_2`, accountId: VAT_INPUT_ACCOUNT_ID, description: `Bill ${bill.billNumber} - VAT Input`, debit: deductibleVat, credit: 0 });
  }
  lines.push({ id: `${entryNumber}_3`, accountId: AP_ACCOUNT_ID, description: `Bill ${bill.billNumber}`, debit: 0, credit: bill.total });
  return {
    id: seedJournalEntryId(bill.id),
    entryNumber,
    date: bill.issueDate,
    memo: `Bill ${bill.billNumber}`,
    source: 'bill',
    status: 'posted',
    postedAt: bill.issueDate,
    currency: 'ZAR',
    lines,
    createdAt: bill.issueDate,
    updatedAt: bill.issueDate,
  };
}

function generateCreditNoteEntry(creditNote: CreditNote, entryNumber: string): JournalEntry {
  const lines: JournalLine[] = [
    { id: `${entryNumber}_1`, accountId: SALES_REVENUE_ACCOUNT_ID, description: `Credit Note ${creditNote.creditNoteNumber}`, debit: creditNote.subtotal, credit: 0 },
  ];
  if (creditNote.taxTotal > 0) {
    lines.push({ id: `${entryNumber}_2`, accountId: VAT_OUTPUT_ACCOUNT_ID, description: 'VAT Output reversal', debit: creditNote.taxTotal, credit: 0 });
  }
  lines.push({ id: `${entryNumber}_3`, accountId: AR_ACCOUNT_ID, description: `Credit Note ${creditNote.creditNoteNumber}`, debit: 0, credit: creditNote.total });
  return {
    id: seedJournalEntryId(creditNote.id),
    entryNumber,
    date: creditNote.issueDate,
    memo: `Credit Note ${creditNote.creditNoteNumber}`,
    source: 'credit_note',
    status: 'posted',
    postedAt: creditNote.issueDate,
    currency: 'ZAR',
    lines,
    createdAt: creditNote.issueDate,
    updatedAt: creditNote.issueDate,
  };
}

/**
 * Mirrors CustomerReceiptService.recordReceipt()'s posting exactly
 * (Increment 4A split): DR Cash and Bank for the full amount; CR Accounts
 * Receivable for the portion applied to invoices; CR Customer Deposits
 * (acc_2600) for the unapplied portion.
 */
function generateCustomerReceiptEntry(receipt: CustomerReceipt, entryNumber: string): JournalEntry {
  const applied = Math.round((receipt.amount - receipt.unallocatedAmount) * 100) / 100;
  const toDeposits = Math.max(0, Math.round((receipt.amount - applied) * 100) / 100);

  const lines: JournalLine[] = [
    { id: `${entryNumber}_1`, accountId: CASH_AND_BANK_ACCOUNT_ID, description: `Receipt ${receipt.receiptNumber}`, debit: receipt.amount, credit: 0 },
  ];
  if (applied > 0) {
    lines.push({ id: `${entryNumber}_2`, accountId: AR_ACCOUNT_ID, description: `Receipt ${receipt.receiptNumber} — applied to invoices`, debit: 0, credit: applied });
  }
  if (toDeposits > 0) {
    lines.push({ id: `${entryNumber}_3`, accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, description: `Receipt ${receipt.receiptNumber} — customer deposit (unapplied)`, debit: 0, credit: toDeposits });
  }

  return {
    id: seedJournalEntryId(receipt.id),
    entryNumber,
    date: receipt.date,
    memo: `Customer Receipt ${receipt.receiptNumber}`,
    source: 'customer_receipt',
    status: 'posted',
    postedAt: receipt.date,
    currency: 'ZAR',
    lines,
    createdAt: receipt.date,
    updatedAt: receipt.date,
  };
}

/** Mirrors PaymentService.createPayment()'s posting exactly: DR Accounts Payable / CR Cash and Bank, for the full payment amount. */
function generatePaymentEntry(payment: Payment, entryNumber: string): JournalEntry {
  return {
    id: seedJournalEntryId(payment.id),
    entryNumber,
    date: payment.date,
    memo: `Payment ${payment.paymentNumber} to supplier ${payment.supplierId}`,
    source: 'payment',
    status: 'posted',
    postedAt: payment.date,
    currency: 'ZAR',
    lines: [
      { id: `${entryNumber}_1`, accountId: AP_ACCOUNT_ID, description: `Payment ${payment.paymentNumber}`, debit: payment.amount, credit: 0 },
      { id: `${entryNumber}_2`, accountId: CASH_AND_BANK_ACCOUNT_ID, description: `Payment ${payment.paymentNumber}`, debit: 0, credit: payment.amount },
    ],
    createdAt: payment.date,
    updatedAt: payment.date,
  };
}

/**
 * Generates one JournalEntry per non-draft/non-void seed Invoice/Bill/
 * CreditNote, one per seed CustomerReceipt (split AR / Customer Deposits —
 * Increment 4A, including on-account ones), and one per fully-allocated
 * seed Payment (supplier on-account payments are still excluded — see this
 * file's doc comment), numbered sequentially starting after `startingNumber`.
 */
export function generateSeedPostings(
  invoices: Invoice[],
  bills: Bill[],
  creditNotes: CreditNote[],
  startingNumber: number,
  allTaxRates: TaxRate[] = seedTaxRates,
  customerReceipts: CustomerReceipt[] = [],
  payments: Payment[] = [],
): JournalEntry[] {
  let n = startingNumber;
  const nextEntryNumber = () => `JE-${String(n++).padStart(4, '0')}`;

  const entries: JournalEntry[] = [];
  for (const invoice of invoices.filter(isPostedInvoice)) {
    entries.push(generateInvoiceEntry(invoice, nextEntryNumber()));
  }
  for (const bill of bills.filter(isPostedBill)) {
    entries.push(generateBillEntry(bill, nextEntryNumber(), allTaxRates));
  }
  for (const creditNote of creditNotes.filter(isPostedCreditNote)) {
    entries.push(generateCreditNoteEntry(creditNote, nextEntryNumber()));
  }
  for (const receipt of customerReceipts) {
    entries.push(generateCustomerReceiptEntry(receipt, nextEntryNumber()));
  }
  for (const payment of payments.filter((p) => p.unallocatedAmount <= 0)) {
    entries.push(generatePaymentEntry(payment, nextEntryNumber()));
  }

  // Chronological order, matching how a real ledger accumulates entries.
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
