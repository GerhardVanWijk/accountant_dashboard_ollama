import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

export type PaymentMethod = 'eft' | 'cash' | 'card' | 'cheque' | 'other';

/** One allocation of a Payment's amount against a specific open Bill. */
export interface PaymentAllocation {
  billId: ID;
  amount: number;
}

/**
 * Money paid to a supplier (Accounts Payable), allocated across one or more
 * open Bills. Recording one posts a balanced journal entry: debit Accounts
 * Payable, credit Cash/Bank — see docs/LEDGER_ARCHITECTURE.md § Posting Sources.
 */
export interface Payment extends BaseEntity {
  paymentNumber: string;
  supplierId: ID;
  /** Which bank account the money left from; falls back to the default Cash and Bank control account when omitted. */
  bankAccountId?: ID;
  date: ISODateString;
  method: PaymentMethod;
  reference?: string;
  amount: number;
  allocations: PaymentAllocation[];
  /** amount minus the sum of allocations — money paid but not yet applied to a bill. */
  unallocatedAmount: number;
  currency: CurrencyCode;
  /** Set once the GL posting succeeds. */
  journalEntryId?: ID;
  notes?: string;
}
