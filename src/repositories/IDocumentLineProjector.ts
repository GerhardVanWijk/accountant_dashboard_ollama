import type { DocumentLineItem, ID } from '@/types';

/**
 * Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §17-18, docs/PHASE_9B_DESIGN.md):
 * dual-write side channel that projects a document's `lineItems` — still
 * the authoritative, jsonb-backed field on the header row — into the new
 * normalized `invoice_lines`/`bill_lines`/`purchase_order_lines`/
 * `credit_note_lines` tables. NOT authoritative itself: a failure here must
 * never fail the document write it accompanies (every caller wraps it), and
 * every current reader keeps reading `lineItems`, not this projection.
 *
 * `sync()` is called with the FULL current line set for `documentId` and
 * replaces whatever was projected before — a document's lines can change
 * shape between drafts, so this is a "replace", not a "diff and patch".
 */
export interface IDocumentLineProjector {
  sync(documentId: ID, lines: readonly DocumentLineItem[]): Promise<void>;
}
