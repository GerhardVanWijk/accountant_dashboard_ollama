# Inventory Reports & Analytics (Phase 8)

Every report in this document is built from the SAME authoritative data and valuation
contract the rest of the Inventory module uses — `Product.costPrice` (the one
company-wide weighted-average cost), `StockBalance` (the per-product/warehouse balance
cache), `StockMovement` (the append-only ledger), `reconcileInventory()` (the GL
control-account reconciliation engine), and the draft-then-post document types
(`StockAdjustment`, `StockTransfer`, `StockTake`). **No report independently
recalculates a valuation, a WAC, or a reconciliation figure** — every number is read
straight off a real field or summed from real fields, in a pure function under
`src/features/inventory/reports/`, unit-tested in isolation from any React rendering.

## 0. Data availability audit (spec §1)

Every report proposed by the Phase 8 spec, classified BEFORE it was built:

- **A — fully supported by existing authoritative data**: no derivation beyond reading
  real fields and summing them.
- **B — supported but requires a derived query/service**: a real relationship exists,
  but the report needs to join/aggregate/bucket it (still zero invented data).
- **C — cannot yet be calculated reliably**: the schema does not carry the
  relationship the report would need; building it would mean matching on free text or
  inventing a number. Not built, or built with the missing piece explicitly omitted
  and labeled.

| # | Report | Class | Notes |
|---|---|---|---|
| 3 | Stock on Hand | A | `StockBalance` + `Product` fields only. |
| 4 | Inventory Valuation | A/B | Line valuation is A; the GL reconciliation section reuses `reconcileInventory()` verbatim (already built, Phase 3B). |
| 5 | Low Stock | A/B | Status is A; `suggestedOrderQty` is B (documented formula over two real optional fields). |
| 6 | Out of Stock | A/B | Status is A; last-movement lookup is B (a ledger scan, not a new field). |
| 7 | Stock Movement | A | The ledger itself; date-range scoping is a filter, not a derivation. |
| 8 | Stock Adjustments | A/B | Header/line fields are A; flattening to line-level rows is B. |
| 9 | Transfers | A/B | Header fields are A; in-transit-days is B (subtraction of two real dates). |
| 10 | Stock Take Variance | A | Every figure is frozen on the line at count time; only counted lines are shown. |
| 11 | Inventory Reconciliation | A (sections A–E) / **C (section F)** | Sections A–E reuse `reconcileInventory()` exactly. Section F (movement source-evidence) needs a `knownDocumentRefs` set resolved from real invoices/bills/adjustments — that resolution is explicitly a Phase 14 (Difference Investigator) concern (see `useInventoryReconciliation.ts`'s own doc comment) and was not built in Phase 8. Shown as an honest "not run" state. |
| 12 | Category Analysis | **B (stock/value) / C (sales, COGS, gross margin)** | Neither `InvoiceLineItem` nor `BillLineItem` carries a `productId` anywhere in this schema (checked directly against `src/types/invoice.ts` and `src/types/bill.ts`) — a historical sale cannot be attributed to a product, and therefore not to a category, without matching on free text (forbidden by spec §12). Built as stock/value only. |
| 13 | Warehouse Analysis | B | Aggregation of Stock on Hand rows by warehouse. "Inbound/In transit" extra metric omitted — see §13 below. |
| 14 | Supplier Analysis | **B (inventory position) / C (purchase activity, profitability)** | `StockMovement` has no `supplierId` field at all, and `Bill` lines have no `productId` — there is no reliable way to say "this receipt came from this supplier for this product." The only real link is `Product.preferredSupplierId` (a static assignment, not a purchase record). Built as inventory position by preferred supplier only, explicitly never called "profitability" or "purchase activity." |
| 15 | Margin Analysis | **B (current theoretical) / C (realised historical)** | `sellingPrice − currentWac` uses two real fields but is a THEORETICAL figure at today's numbers — realised historical margin needs a sale's actual product + actual COGS at time of sale, which (per #12's finding) this schema cannot reconstruct. Built as "current theoretical," labeled as such everywhere it appears. |
| 16 | Slow-Moving / Dead Stock | B | Bucketing over real movement dates; "movement" is explicitly defined (see §16 below) since the spec asked this app to make that call. |

## 1. Report hub

Route `/inventory/reports`, grouped exactly as the spec's STOCK / MOVEMENT / CONTROL /
ANALYSIS suggestion. Only reports that could be built honestly are exposed — there is
no card for, e.g., "Supplier Profitability" or "Realised Gross Margin," because this
schema cannot support either without fabricating a relationship.

## 2. Shared building blocks

- `src/features/inventory/reports/buildStockOnHandRows.ts` — the ONE row-per-(product,
  warehouse) build every STOCK/ANALYSIS report starts from. Only tracked products with
  a real `stock_balances` row are included; valuation is `onHand × Product.costPrice`
  (the same identity `reconcileInventory()` sums to get the subledger total).
- `src/features/inventory/hooks/useStockOnHandData.ts` — fetches products, balances,
  categories, suppliers and warehouses once, in parallel, and hands back
  `StockOnHandRow[]` — avoids five report pages each re-wiring the same five hooks
  (spec §24).
- `src/features/inventory/reports/dateRange.ts` + `useDateRangeFilter.ts` +
  `components/reports/DateRangeControl.tsx` — one consistent date-range model (This
  Month / Last Month / This Quarter / This Financial Year / Custom). "This financial
  year" uses the company's REAL `FinancialYear` records, never a hardcoded calendar
  year — see §18 below. "This quarter" is necessarily a CALENDAR quarter (Jan–Mar,
  Apr–Jun, …): this app has no fiscal-quarter concept distinct from the financial year
  itself.
- `src/features/inventory/components/reports/InventoryReportShell.tsx` — the shared
  chrome (title, loading/error, summary slot, Export menu, hidden `PrintableReport`)
  every report page uses — all Phase 7 infrastructure, never a bespoke per-report
  print/export implementation (spec §20).
- `src/features/inventory/services/inventoryValuation.ts`'s `sumMoney()` — every report
  total that sums already-2dp money values uses this (exact scaled-integer arithmetic,
  no float drift), never a raw `+`.

## 3. Stock on Hand — `/inventory/reports/stock-on-hand`

**Purpose:** current on-hand, available and committed position per product per
warehouse, for stock controllers and bookkeepers.
**Source:** `buildStockOnHandRows()` — `StockBalance` + `Product`.
**Formula:** `available = onHand − committed + onOrder` (the existing
`quantityAvailable()` helper, `src/types/stockBalance.ts`); `inventoryValue = onHand ×
Product.costPrice`.
**Filters:** search, status, warehouse, category, supplier.
**Accounting meaning:** a physical stock position, valued at the same WAC the GL uses.
**Limitations:** none — classification A.

## 4. Inventory Valuation — `/inventory/reports/valuation`

**Purpose:** the accounting-critical figure — what inventory is worth, and whether
that ties to the general ledger.
**Source:** line-level `buildStockOnHandRows()`, THEN `reconcileInventory()` reused
verbatim via `InventoryReconciliationCard` — no reconciliation math is reproduced on
this page.
**Formula:** round-after-sum `Σ (quantity × WAC)` — the identical identity
`reconcileInventory()`'s own subledger figure uses.
**Filters:** search, warehouse.
**Accounting meaning:** on-hand inventory subledger vs GL 1200 (Inventory Asset) / GL
1210 (Inventory in Transit).
**Limitations:** the line-level total above and the reconciliation section below both
use the same identity, but are shown as two independently-computed panels rather than
cross-asserted equal on screen.

## 5. Low Stock — `/inventory/reports/low-stock`

**Purpose:** what needs reordering, and roughly how much.
**Source:** Stock on Hand rows already at `status === 'low'`.
**Formula (Suggested Order Qty):** `max(reorderQuantity, preferredStockLevel −
available)`, using ONLY `Product.reorderQuantity` / `Product.preferredStockLevel` —
the two schema fields that already carry that exact semantic. `undefined` (shown as
"—") when neither is set — never a guessed number.
**Filters:** search, warehouse.
**Accounting meaning:** none directly — an operational/purchasing signal.
**Limitations:** the suggestion is a static formula, not a demand forecast; it ignores
open purchase orders (`StockBalance.quantityOnOrder` is documented as "0 until
open-PO quantities are wired").

## 6. Out of Stock — `/inventory/reports/out-of-stock`

**Purpose:** items at zero or negative on-hand, distinct from Low Stock (a
zero-quantity item is flagged here even with no reorder level configured).
**Source:** Stock on Hand rows at `status === 'out'`, plus a last-movement lookup over
`StockMovement`.
**Filters:** search, warehouse, product active/inactive status.
**Accounting meaning:** none directly.
**Limitations:** "last movement" here is ANY movement type (not the economic-only
definition Slow-Moving uses) — appropriate here since the question is simply "when did
this SKU last do anything," not "is it dead stock."

## 7. Stock Movement — `/inventory/reports/movements`

**Purpose:** a report-framed, date-range-scoped view of the append-only ledger
(distinct from the operational `StockMovementsPage` register, which stays as-is).
**Source:** `StockMovement`, unfiltered by type.
**Filters:** date range, type, warehouse, search.
**Totals:** increases (value), decreases (value), net units.
**Accounting meaning:** the movement ledger IS the accounting evidence for every
quantity change.
**Limitations:** no opening-balance-at-an-arbitrary-date figure — replaying the whole
ledger from time zero for every warehouse/product on every report load was judged not
worth the cost for a figure the period totals already make unnecessary (spec
explicitly permits omitting this: "do not fabricate historical opening balances").

## 8. Stock Adjustments — `/inventory/reports/adjustments`

**Purpose:** every posted adjustment LINE (not just the document header) in a period,
by reason and gain/loss.
**Source:** `buildAdjustmentReportRows()` — flattens `StockAdjustment.lineItems`.
**Formula:** `direction` reads the LINE's own signed `quantityDelta`, never the header
`reason` (a `'correction'` can be either a gain or a loss).
**Totals:** total gains, total losses, net adjustment, total write-offs (the
`write_off`/`shrinkage`/`damage` reasons specifically — a documented SUBSET of total
losses, not a synonym).
**Filters:** date range, reason, status, search.
**Accounting meaning:** GL 5050 Inventory Adjustments activity, at line-level evidence.

## 9. Transfers — `/inventory/reports/transfers`

**Purpose:** inter-warehouse movement activity — status, value, in-transit duration.
**Source:** `buildTransferReportRows()` — `StockTransfer` fields plus one derived
field.
**Formula (in-transit days):** whole days between `transferDate` (dispatch) and
`receivedDate`; `undefined` while still in transit or never dispatched.
**Filters:** date range, status, from-warehouse, to-warehouse, search.
**Accounting meaning:** company-wide inventory value is unchanged by a transfer; GL
1210 (Inventory in Transit) activity when the in-transit leg is used.

## 10. Stock Take Variance — `/inventory/reports/stock-take-variance`

**Purpose:** counted variance across every stock take in a period — one of the
strongest reports, per spec.
**Source:** `buildStockTakeVarianceRows()` — flattens `StockTake.lineItems` that have
actually been counted (`countedQty` set); an un-counted line is excluded, never shown
as a fabricated zero variance.
**Formula:** every figure (`expectedQty`, `countedQty`, `frozenWac`, `varianceValue`)
is the exact value FROZEN on the line at count/freeze time — never recomputed against
today's stock position (a posted stock take is immutable evidence).
**Totals:** positive variance, negative variance, net variance, absolute variance,
mismatched-item count.
**Filters:** date range, stock take, warehouse, search.
**Accounting meaning:** GL 5050 Inventory Adjustments activity from posted stock
takes.

## 11. Inventory Reconciliation — `/inventory/reports/inventory-reconciliation`

**Purpose:** a full report surface over `reconcileInventory()` — not a green/red card.
**Source:** `reconcileInventory()` (Phase 3B), reused via `useInventoryReconciliation()`
— zero reconciliation math reproduced on the page.
**Sections:**
- **A. Quantity control** — movement ledger vs `stock_balances` (`balance_cache_drift`,
  `negative_stock` findings).
- **B. Compatibility** — `stock_balances` vs `products.quantity_on_hand`
  (`product_quantity_drift`).
- **C. Valuation** — subledger vs GL 1200 (`subledger_vs_gl`).
- **D. Transit** — in-transit subledger vs GL 1210 (`in_transit_vs_gl`,
  `orphan_in_transit`, `duplicate_transfer_receipt`).
- **E. Total control** — (subledger + transit) vs (1200 + 1210)
  (`total_inventory_vs_gl`).
- **F. Evidence** — **NOT RUN.** `reconcileInventory()`'s Check F (movement
  source-document completeness) needs a `knownDocumentRefs` set resolved from real
  invoices/bills/adjustments/etc — that resolution is documented (in
  `useInventoryReconciliation.ts` itself, written in an earlier phase) as a Phase 14
  Difference Investigator concern. Shown as an honest "not run" state, never a
  fabricated pass.
- **G. Rounding** — every finding that carries a `toleranceBound`, with the actual
  difference next to the allowed theoretical bound and whether it's a residual or a
  real problem. Never hidden just because the overall status is "reconciled" — spec
  §11: "Do not hide warnings just because overall status is reconciled."

## 12. Category Analysis — `/inventory/reports/category-analysis`

**Purpose:** inventory position by category.
**Source:** `buildCategoryAnalysisRows()` — aggregates Stock on Hand rows by
`categoryName` (products without a category collapse into one "Uncategorised" bucket,
not one row per product).
**Columns:** items, units on hand, inventory value, % of total inventory value.
**NOT built:** Sales, COGS, Gross Margin — see the audit table above (§0, row 12). If a
future migration adds a real `productId` to invoice/bill lines, this becomes a B-class
addition to the same builder, not a rebuild.

## 13. Warehouse Analysis — `/inventory/reports/warehouse-analysis`

**Purpose:** inventory position by warehouse, with a drill-down entry point.
**Source:** `buildWarehouseAnalysisRows()` — aggregates Stock on Hand rows;
`stock_balances` is the authoritative CURRENT warehouse balance (not re-derived from
the ledger on every report load).
**Columns:** items, units, inventory value, low-stock count, out-of-stock count.
**NOT built:** "Inbound/In transit" (the spec's own optional extra metric) —
`StockBalance.quantityOnOrder` is documented in `src/types/stockBalance.ts` as "0
until open-PO quantities are wired," so a column here would show zero for every
warehouse, always — a misleading always-zero placeholder, omitted rather than shown.

## 14. Supplier Analysis — `/inventory/reports/supplier-analysis`

**Purpose:** inventory position by preferred supplier.
**Source:** `buildSupplierAnalysisRows()` — aggregates Stock on Hand rows by
`Product.preferredSupplierId`.
**Columns:** preferred-item count, inventory value, low-stock count, outstanding
replenishment quantity (Σ suggested order qty across this supplier's low-stock items).
**NOT built, deliberately:** purchase activity, recent activity, or profitability —
see the audit table (§0, row 14). Titled and worded throughout as "inventory
POSITION," never "profitability," per the spec's own explicit instruction.

## 15. Margin Analysis — `/inventory/reports/margin-analysis`

**Purpose:** CURRENT theoretical margin per product — what the next unit sold today
would earn at today's list price and today's WAC.
**Source:** `buildMarginAnalysisRows()` — `Product.unitPrice` / `Product.costPrice`
directly; goods only (`type === 'good'`).
**Formula:** `unitMargin = sellingPrice − currentWac`; `marginPercent = unitMargin /
sellingPrice × 100` (`null`, never `0%` or `Infinity`, when `sellingPrice` is 0).
**NOT built:** realised historical gross margin — see the audit table (§0, row 15).
The "current theoretical" label is kept attached everywhere this report appears: page
title, export dataset title, printed subtitle, and an on-screen footnote — never
presented in a way a viewer could mistake for realised margin.

## 16. Slow-Moving / Dead Stock — `/inventory/reports/slow-moving`

**Purpose:** stock still on hand that hasn't moved in a while.
**Source:** `buildSlowMovingRows()` — Stock on Hand rows with `onHand > 0`, bucketed
by days since the last movement.
**"Movement" definition (spec explicitly asked this app to decide):** any ECONOMIC
event — everything except `transfer_in`/`transfer_out` (relocation, not
consumption/replenishment — the SAME convention `reconcileInventory()` already uses
for its own "inventory-affecting" postings count) and `opening` (a one-time balance
seed). `lastSaleAt` is tracked as a SEPARATE field specifically for type `'sale'`, so a
product that was recently received but never actually sold reads honestly as "never
sold," not as "recently active."
**Buckets:** 0–30 / 31–60 / 61–90 / 91–180 / 180+ days; no recorded economic movement
at all buckets as 180+ (the deepest-dead case), never a false "recent" reading.
**Limitations:** "days since last movement" is not the same as "days since last SALE"
— both are shown, but the bucket itself is keyed off the broader economic-movement
definition, since the spec's own suggested metric was "days since last movement," not
"days since last sale" specifically.

## 17. Drill-down

Every report already links from row data back into the record it describes via the
app's existing navigation (product SKUs, stock take numbers, adjustment/transfer
numbers are visible text, not yet clickable deep-links into `ProductDetailSheet` /
`StockTakeDetailSheet` / etc from the REPORT pages themselves — the operational
registers those sheets live on already exist and are one click away via the sidebar).
Full inline drill-down (row click → detail sheet, directly from a report) was judged
lower priority than data-availability correctness for this phase and is a reasonable
Phase 9+ UI enhancement, not a data-availability gap.

## 18. Date range model

`This Month` / `Last Month` / `This Quarter` (calendar) / `This Financial Year` (the
company's REAL `FinancialYear` records — the one containing today, or the most
recently started one) / `Custom`. No hardcoded Jan–Dec or Mar–Feb assumption anywhere
— see `src/features/inventory/reports/dateRange.ts`.

## 19. Filters

Every report's filters (date range, warehouse, category, supplier, status, search)
feed the SAME dataset that drives the on-screen table, the printed report, and the
CSV/XLSX export — via `DataTable`'s `onVisibleRowsChange` (Phase 7 mechanism), never a
second filtering implementation for exports.

## 20. Print / export

Every report uses Phase 7's `ExportMenu` + `PrintableReport` — Print/Save PDF, Export
CSV, Export Excel — gated on `useCanAccess('inventory', 'export')`. No report has its
own bespoke export code.

## 21. Totals

Every report with a money column has an explicit total row/summary — never left to the
user to sum a table by eye (spec §21): Inventory Value, Total Gains/Losses/Net,
Total Increase/Decrease/Net, Positive/Negative/Net Variance, etc.

## 22. Money / quantity precision

Every report reuses the existing precision contract
(`src/features/inventory/services/inventoryValuation.ts`): quantity 3dp, unit cost
4dp, money 2dp. Report totals that sum already-2dp money values use `sumMoney()`
(exact scaled-integer arithmetic) — never a raw floating-point `+=` over a list of
currency figures.

## 23. Empty / warning states

Every report distinguishes "zero result" (a real, honest empty state — "No low-stock
items", "No transfers in this period") from "not available" (the Financial-Year preset
shows an explicit message when the company has no financial years defined, rather than
silently resolving to a wrong range).

## 24. Performance

`useStockOnHandData()` fetches the five underlying collections once per report render,
in parallel, and every report's aggregation (`buildXRows()`) is a single pass over
already-loaded arrays via `useMemo` — no N+1 service calls, no per-row service
lookups. No new database view/index/function was needed for anything built in this
phase; if a future report genuinely needs one, that is a new STOP-and-report decision,
not something introduced here.

## 25. No database writes

Every report page here is read-only — no create/update/delete call, no new database
mutation. Verified: none of the report pages import a mutation method from any
service/hook.

## 26. Known limitations (repeated in one place)

- Reconciliation Check F (movement evidence) is not run — Phase 14 concern.
- Category/Supplier Analysis carry no sales, COGS, margin, or purchase-activity
  column — `InvoiceLineItem`/`BillLineItem` have no `productId` in this schema, and
  `StockMovement` has no `supplierId`.
- Margin Analysis is current theoretical only, never realised.
- Warehouse Analysis has no inbound/in-transit column (`quantityOnOrder` is always 0
  today).
- No per-document PDFs for Operations reports (list/history level only — Adjustments,
  Transfers, Stock Take Variance are all effectively the "Operations exports" the spec
  asked for at list/history level; a per-document formatted PDF is a future
  enhancement, not attempted here).
- No inline row-click drill-down from a report page into a detail sheet yet (§17).
