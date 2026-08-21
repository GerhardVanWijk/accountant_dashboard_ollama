import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

export type ReceiptMethod = 'eft' | 'cash' | 'card' | 'cheque' | 'other';

/** One allocation of a Customer Receipt's amount against a specific open Invoice. */
export interface ReceiptAllocation {
  invoiceId: ID;
  amount: number;
}

/**
 * Money received from a customer (Accounts Receivable), allocated across one
 * or more open Invoices. Recording one posts a balanced journal entry:
 * debit Cash/Bank, credit Accounts Receivable — see
 * docs/LEDGER_ARCHITECTURE.md § Posting Sources.
 */
export interface CustomerReceipt extends BaseEntity {
  receiptNumber: string;
  customerId: ID;
  /** Which bank account the money landed in; falls back to the default Cash and Bank control account when omitted. */
  bankAccountId?: ID;
  date: ISODateString;
  method: ReceiptMethod;
  reference?: string;
  amount: number;
  allocations: ReceiptAllocation[];
  /** amount minus the sum of allocations — money on account, not yet applied to an invoice. */
  unallocatedAmount: number;
  currency: CurrencyCode;
  /** Set once the GL posting succeeds. */
  journalEntryId?: ID;
  notes?: string;
}
