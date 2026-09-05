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
