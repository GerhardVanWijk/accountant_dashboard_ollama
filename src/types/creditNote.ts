import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type CreditNoteStatus = 'draft' | 'issued' | 'allocated' | 'void';

export type CreditNoteReason = 'return' | 'pricing_error' | 'discount' | 'other';

/** One allocation of a Credit Note's value against a specific open Invoice. */
export interface CreditNoteAllocation {
  invoiceId: ID;
  amount: number;
  allocatedAt: ISODateString;
}

/**
 * A sales credit note (Accounts Receivable contra-document) — reduces what a
 * customer owes, either against a specific Invoice or as a standalone account
 * credit. Issuing one posts a balanced journal entry (reverse of an Invoice's
 * posting); see docs/LEDGER_ARCHITECTURE.md.
 */
export interface CreditNote extends BaseEntity {
  creditNoteNumber: string;
  customerId: ID;
  /** The invoice being credited, if any — omitted for a standalone account credit. */
  invoiceId?: ID;
  issueDate: ISODateString;
  reason: CreditNoteReason;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountAllocated: number;
  currency: CurrencyCode;
  status: CreditNoteStatus;
  allocations: CreditNoteAllocation[];
  /** Set once `status` moves to 'issued' and the GL posting succeeds. */
  journalEntryId?: ID;
  notes?: string;
}
