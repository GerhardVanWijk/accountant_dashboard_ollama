import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Phase 5D. The delivered-but-not-yet-invoiced return path — Credit Notes
 * cover returning INVOICED goods; a Return Note covers physical stock that
 * left the warehouse via a posted Delivery Note but has not yet been
 * billed. Backed by the live `return_notes` table (migration 0057).
 *
 * `draft` — being built, freely editable, zero accounting/stock effect.
 * `posted` — physically re-entered the warehouse: `post_return_note` (0058)
 *   has run, stock moved back in at the ORIGINAL delivery's frozen cost,
 *   `DR 1200 / CR 1220` posted. Immutable from here.
 * `cancelled` — abandoned before posting. Only reachable from `draft`.
 */
export type ReturnNoteStatus = 'draft' | 'posted' | 'cancelled';

/**
 * One line of a Return Note. Always traces to a specific Delivery Note
 * line — `deliveryNoteLineId` is authoritative and stamped once, never
 * edited. `unitCost` is informational only (copied from the frozen delivery
 * movement for display on the draft); `post_return_note` re-reads the real
 * frozen cost from `stock_movements` at posting time and never trusts this
 * field.
 */
export interface ReturnNoteLineItem {
  id: ID;
  deliveryNoteLineId: ID;
  salesOrderLineId: ID;
  productId: ID;
  description: string;
  quantity: number;
  /** Informational display only — the frozen delivery cost, re-verified at posting. */
  unitCost: number;
  unitPrice: number;
  taxRateId?: ID;
  taxAmount: number;
  lineTotal: number;
}

export interface ReturnNote extends BaseEntity {
  returnNoteNumber: string;
  deliveryNoteId: ID;
  salesOrderId: ID;
  customerId: ID;
  warehouseId: ID;
  returnDate: ISODateString;
  status: ReturnNoteStatus;
  lineItems: ReturnNoteLineItem[];
  notes?: string;
  /** Set only once `post_return_note` (0058) has run. */
  journalEntryId?: ID;
}
