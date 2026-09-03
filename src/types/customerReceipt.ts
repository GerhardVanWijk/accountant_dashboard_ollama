import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

export type ReceiptMethod = 'eft' | 'cash' | 'card' | 'cheque' | 'other';

/** One allocation of a Customer Receipt's amount against a specific open Invoice. */
export interface ReceiptAllocation {
  /**
   * Stable, immutable identity of this logical allocation — a UUID
   * generated client-side BEFORE the allocation is posted, so a retry
   * re-uses it and the `apply_customer_deposit` RPC de-duplicates on it
   * (`deposit_allocation_log.allocation_id`), while a genuinely new
   * allocation gets a fresh id. Present on every allocation created from
   * Increment 4A forward. Optional only for backward compatibility with
   * historical jsonb allocations written before 4A — those are NOT
   * rewritten to add one.
   */
  id?: ID;
  invoiceId: ID;
  amount: number;
  /**
   * Set when this allocation was applied *after* the receipt was first
   * recorded (`allocateToInvoice`) — the id of the `DR Customer Deposits /
   * CR Accounts Receivable` journal entry that moved the money out of the
   * deposit liability into AR. Absent for an allocation made at receipt
   * time (that leg is part of the receipt's own split journal entry) and
   * for historical (pre-Customer-Deposits) allocations. Stored inside the
   * existing `allocations` jsonb — no schema migration. Carries enough
   * evidence for a future, safe unallocation/reversal.
   */
  journalEntryId?: ID;
  /** ISO timestamp the later allocation was applied. Absent for at-receipt-time allocations. */
  allocatedAt?: ISODateString;
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
