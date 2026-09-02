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
 * A Credit Note line — `DocumentLineItem` plus the one field only a credit
 * note needs: which specific original invoice line this line is crediting.
 *
 * Optional, and deliberately not required — see
 * docs/ACCOUNTING_RELATIONSHIPS.md §4/Phase 9B: a standalone/financial-only
 * credit note (no linked invoice, or a `pricing_error`/`discount`/`other`
 * reason with nothing physically returned) legitimately has no original
 * line to point at. When it IS set, `issueCreditNote()` validates the
 * return quantity against THIS specific invoice line (plus whatever any
 * other already-posted credit note already returned against that same
 * line) instead of only the whole invoice's aggregate quantity for the
 * product — the fix for the gap flagged in Phase 9A: two lines on one
 * invoice for the same product could not previously be told apart.
 */
export interface CreditNoteLineItem extends DocumentLineItem {
  /** The `id` of the specific line on the linked `CreditNote.invoiceId` invoice that this line credits. */
  originalInvoiceLineId?: ID;
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
  /**
   * Free-text explanation, required by the form when `reason === 'other'`
   * and null for the other reasons (migration 0043). Kept distinct from
   * `notes` — this is *why* the credit note exists, not an operational note.
   */
  reasonDetails?: string;
  lineItems: CreditNoteLineItem[];
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
