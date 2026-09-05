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
 * ACTIVATED 2026-09-05 (FINAL CORE HARDENING run, branch
 * `hardening-2026-09-05`) after: migrations 0037–0042 + 0062 confirmed live;
 * a full read-only `DocumentLineParityChecker`-equivalent sweep of the live
 * DB returning ZERO findings across all 4 line tables (340 lines, all MATCH)
 * once migration 0063 corrected 58 seed-written stray `warehouse_id` values;
 * and a rollback-wrapped live forward-write smoke test of
 * `create_invoice_from_sales_order(..., p_project_lines := true)` proving the
 * projected `invoice_lines` are field-for-field identical to the
 * authoritative jsonb `line_items` with no orphans/duplicates.
 *
 * WHAT THIS FLAG GATES: the WRITE side only — `SupabaseDocumentLineProjector`
 * dual-writing into `invoice_lines`/`bill_lines`/`purchase_order_lines`/
 * `credit_note_lines`, and the `create_invoice_from_sales_order` RPC's
 * `p_project_lines` param. NO reader consults the normalized tables yet, so
 * the authoritative jsonb `line_items` remains the source of truth and every
 * report/search/print path is unchanged.
 *
 * ROLLBACK (no data loss): flip back to `false`. The dual-write stops; the
 * jsonb `line_items` was never touched and stays authoritative. Any
 * normalized rows written while `true` are harmless (nothing reads them) and
 * can be left in place or reconciled later with the parity checker.
 * jsonb `line_items` is NOT to be dropped in this or the next release.
 */
export const NORMALIZED_DOCUMENT_LINES_ENABLED = true;

/**
 * Gates FIFO as a selectable stock-valuation method
 * (`Product.valuationMethod = 'fifo'`).
 *
 * MUST stay `false` until a real persistent stock-lot layer exists — today
 * `stockLotRepository` is `MockStockLotRepository` (in-memory only, lost on
 * reload), the single Mock repository still wired into production
 * composition (`src/features/inventory/repositories/instances.ts`). Every
 * live product currently uses `weighted_average`, so there is no accounting
 * drift; but a product set to `fifo` would build its cost lots in memory
 * and lose them on the next page load.
 *
 * With this `false`:
 *   - `ProductForm` hides the FIFO option (a product already on FIFO — none
 *     exist live — still shows it, so its own edit form isn't broken).
 *   - `ProductService.createProduct` / `updateProduct` reject a NEW switch
 *     to `fifo` at the service layer, so the UI gate cannot be bypassed.
 *
 * Flip to `true` only in the same change that ships
 * `SupabaseStockLotRepository` + a `stock_lots` migration + a backfill
 * strategy (docs/INVENTORY_ARCHITECTURE.md § "FIFO valuation").
 */
export const FIFO_VALUATION_ENABLED = false;
