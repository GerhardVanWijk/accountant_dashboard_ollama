import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Phase 5C. Physical-dispatch evidence for a confirmed Sales Order line —
 * see docs/DELIVERY_NOTES_DESIGN.md. Backed by the live `delivery_notes`
 * table (migration 0052).
 *
 * `draft` — being built, freely editable, zero accounting/stock effect.
 * `posted` — physically departed the warehouse: `post_delivery_note` (0054)
 *   has run, stock moved, `DR 1220 / CR 1200` posted, cost frozen. Immutable
 *   from here — see docs/DELIVERY_NOTES_DESIGN.md § "Posted Delivery Note
 *   immutability contract".
 * `cancelled` — abandoned before posting. Only reachable from `draft`; a
 *   posted Delivery Note is never cancelled (correction is a future Return
 *   Note, Phase 5D — not built).
 */
export type DeliveryNoteStatus = 'draft' | 'posted' | 'cancelled';

/**
 * One line of a Delivery Note. Deliberately carries NO revenue field beyond
 * what is needed to (a) reproduce the SO line's own economics on the
 * printable document (price suppressed by default, docs/DELIVERY_NOTES_DESIGN.md
 * Part 18) and (b) let a later invoice derive its own totals from the SAME
 * source-of-truth SO line — a Delivery Note is physical evidence, not a
 * priced sales document.
 */
export interface DeliveryNoteLineItem {
  id: ID;
  /** The Sales Order line this delivery fulfils — authoritative, stamped once, never edited. */
  salesOrderLineId: ID;
  productId: ID;
  description: string;
  quantity: number;
  /** Copied from the SO line at creation time — printable-document + invoice-derivation use only, never posted as revenue. */
  unitPrice: number;
  taxRateId?: ID;
  taxAmount: number;
  lineTotal: number;
}

export interface DeliveryNote extends BaseEntity {
  deliveryNoteNumber: string;
  salesOrderId: ID;
  customerId: ID;
  warehouseId: ID;
  deliveryDate: ISODateString;
  status: DeliveryNoteStatus;
  lineItems: DeliveryNoteLineItem[];
  notes?: string;
  /** Set only once `post_delivery_note` (0054) has run. */
  journalEntryId?: ID;
}
