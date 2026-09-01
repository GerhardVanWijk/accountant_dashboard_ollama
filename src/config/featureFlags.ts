/**
 * Small, explicit, one-time-flip feature flags — not a general flag
 * framework. Add one here only when a piece of code must ship disabled
 * until a separate, reviewed step (usually a migration) has actually run.
 */

/**
 * Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md, docs/PHASE_9B_DESIGN.md):
 * gates `SupabaseDocumentLineProjector` — the dual-write that copies
 * invoice/bill/purchase-order/credit-note `lineItems` into the new
 * `invoice_lines`/`bill_lines`/`purchase_order_lines`/`credit_note_lines`
 * tables (migrations 0038–0041) alongside the existing, still-authoritative
 * `line_items` jsonb column.
 *
 * MUST stay `false` until migrations 0037–0042 have actually been applied
 * to the target database — with it `false`, `SupabaseDocumentLineProjector`
 * is a no-op and every document service behaves exactly as it did before
 * Phase 9B, so this code is safe to merge and deploy independently of the
 * migrations. Flip to `true` in its own follow-up commit once the
 * migrations are confirmed live (docs/PHASE_9B_DESIGN.md §"Rollout").
 */
export const NORMALIZED_DOCUMENT_LINES_ENABLED = false;
