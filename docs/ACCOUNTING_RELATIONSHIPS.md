# Accounting Relationships & Traceability — Phase 9A Audit

Status: **AUDIT COMPLETE — no code/schema changes applied.** Read-only inspection
of the repository (types, services, migrations 0001–0036) and the live Office
National Demo company via `mcp__supabase__execute_sql` (SELECT only).

This document is the audit deliverable for Phase 9A. It supersedes any
assumption that product identity is entirely absent from sales/purchase
documents — it is **not**. The real gap is narrower and different in kind
than the phase brief assumed: see §0.

---

## 0. Headline finding — read this first

`DocumentLineItem` (`src/types/common.ts`), the shared line-item shape for
Quote/SalesOrder/Invoice/CreditNote/PurchaseOrder/Bill, **already has**
`productId?: ID` and `warehouseId?: ID`. It has had them since Phase 2
(inventory-bee). Every one of `invoiceService.postInvoice()`,
`billService.postBill()`, `purchaseOrderService.recordReceipt()`,
`creditNoteService.issueCreditNote()`/reversal, `stockAdjustmentService`,
`stockTransferService`, `stockTakeService`, `openingStockBatchService`, and
`supplierReturnService` already:

- read `line.productId` to resolve a `Product`,
- build an `InventoryTransactionLine` from it,
- call the single atomic `post_inventory_transaction()` RPC (migration
  0031), which writes `stock_movements` with `source_document_type`,
  `source_document_id`, `source_document_line_id = line.id`, `unit_cost`,
  `total_cost`, computes WAC, and posts the balanced journal entry in the
  same transaction.

So the **forward-write chain for every NEW transaction from today forward is
already built and tested** (§18, §19 below largely already satisfied). The
Phase 9 brief's assumption —

```
Invoice
  └── InvoiceLine
       └── description only
```

— is **not current reality**. Current reality is closer to:

```
Invoice
  └── InvoiceLine (jsonb element, has productId)
       └── product_id → Product         (soft reference, no DB FK — see §1)
            └── stock_movements.source_document_line_id = line.id
                 └── unit_cost / total_cost (WAC at sale time)
                      └── journal_entries (via post_inventory_transaction)
```

**The actual gaps are:**

1. **No DB-level FK integrity** on `productId` inside `line_items jsonb` —
   by design (migration 0006's explicit, documented trade-off). A line's
   `productId` can reference a deleted/wrong-company product with nothing
   to stop it.
2. **No SQL-queryable per-product/category sales or purchase reporting** —
   `line_items` is one jsonb blob per document; there is no `invoice_line_items`
   table to `GROUP BY product_id` against. Every "by product" report today
   has to fetch whole documents and reduce in JS (already how Phase 8 report
   services work, per `docs/INVENTORY_REPORTS.md`).
3. **`Product.deleteProduct()` hard-deletes with zero usage guard** (§12) —
   a real immutability gap, independent of the jsonb question.
4. **284/284 (100%) of Office National's stock movements predate migration
   0022** — the live demo data has **no structured source-document evidence
   at all** on the stock ledger today (§9–§10). This is the actual blocker
   for "realised margin" on the one seeded dataset the phase brief asks
   about, not a missing column.
5. **CreditNote reversal quantity-checks by `productId` aggregated across
   the whole invoice, not by original invoice *line* id** (§4) — return
   quantity validation is correct in total, but a credit note line has no
   `originalInvoiceLineId`, so "which invoice line was credited" is not
   provable when an invoice has two lines for the same product.
6. **`supplier_return_lines` and `opening_stock_batch_lines` are already
   real normalized child tables with enforced `product_id` FKs** (migration
   0029) — proof this codebase already has the pattern Phase 9 would apply
   to invoice/bill lines; they are not a new invention.

Everything below is the full section-by-section audit the brief asked for.

---

## 1. Current relationship graph (as it actually exists)

Legend: **FK** = enforced by a real foreign key constraint. **SOFT** =
present as a plain UUID/jsonb field, correct in application code, not
enforced by the DB. **MISSING** = no field carries this relationship today.
**LEGACY** = free-text/pre-structured-evidence only.

| From | To | Kind | Notes |
|---|---|---|---|
| `invoices.customer_id` | `customers.id` | **FK** | |
| `invoices.sales_order_id` | `sales_orders.id` | **FK** | nullable |
| `invoices.journal_entry_id` | `journal_entries.id` | **FK** | |
| `invoices.line_items[].productId` | `products.id` | **SOFT** | inside jsonb; no FK possible |
| `invoices.line_items[].warehouseId` | `warehouses.id` | **SOFT** | inside jsonb |
| `bills.supplier_id` | `suppliers.id` | **FK** | |
| `bills.purchase_order_id` | `purchase_orders.id` | **FK** | nullable |
| `bills.journal_entry_id` | `journal_entries.id` | **FK** | |
| `bills.line_items[].productId` | `products.id` | **SOFT** | jsonb |
| `purchase_orders.bill_id` | `bills.id` | **FK** | circular FK, added post-table-creation |
| `purchase_orders.line_items[].productId` | `products.id` | **SOFT** | jsonb |
| `purchase_orders.journal_entry_id` | `journal_entries.id` | **FK** | set by `recordReceipt()`, not by conversion to Bill |
| `credit_notes.customer_id` | `customers.id` | **FK** | |
| `credit_notes.invoice_id` | `invoices.id` | **FK** | nullable — standalone credits allowed |
| `credit_notes.line_items[].productId` | `products.id` | **SOFT** | jsonb |
| `credit_notes.line_items[]` | `invoices.line_items[]` (specific line) | **MISSING** | no `originalInvoiceLineId`; only productId-aggregated qty check (see §4) |
| `credit_notes.journal_entry_id` | `journal_entries.id` | **FK** | |
| `supplier_returns.supplier_id` | `suppliers.id` | **FK** | (composite, company-scoped — migration 0029) |
| `supplier_returns.bill_id` / `.purchase_order_id` | `bills.id` / `purchase_orders.id` | **FK** | nullable, composite |
| `supplier_return_lines.product_id` | `products.id` | **FK** | composite, company-scoped — real child table |
| `supplier_return_lines.source_document_line_id` | bill/PO jsonb line `.id` | **SOFT** | documented: "No FK is possible until those legacy document lines are normalized" |
| `supplier_return_lines.source_stock_movement_id` | `stock_movements.id` | **FK** | composite, company-scoped — the strong evidence path |
| `opening_stock_batch_lines.product_id` | `products.id` | **FK** | composite, company-scoped — real child table |
| `stock_movements.product_id` | `products.id` | **FK** | simple FK (migration 0006), not company-composite |
| `stock_movements.warehouse_id` | `warehouses.id` | **FK** | simple FK |
| `stock_movements.source_document_type/_id` | polymorphic (invoice/bill/credit_note/purchase_order/stock_adjustment/stock_transfer/stock_take/opening_stock_batch/supplier_return/reversal) | **SOFT, by design** | "Deliberately polymorphic, so no single-table foreign key can represent it" (migration 0022 comment) |
| `stock_movements.source_document_line_id` | the originating jsonb line's `.id` | **SOFT** | populated by every current posting service (§5) |
| `stock_movements.reversal_of_movement_id` | `stock_movements.id` | **FK** | composite, company-scoped self-FK |
| `inventory_transaction_log.journal_entry_id` | `journal_entries.id` | **FK** | the RPC's own idempotency/audit ledger |
| `inventory_transaction_log.source_type/source_id` | polymorphic document | **SOFT** | same polymorphism as stock_movements |
| `products.category_id` | `product_categories.id` | **FK** | migration 0024 |
| `products.preferred_supplier_id` | `suppliers.id` | **FK** | migration 0025 |
| `products.{sales,inventory,cogs,purchase}_account_id` | `accounts.id` | **FK** | migration 0025 |
| document `journal_entry_id` → `journal_entries` | — | **FK**, one direction only | reverse lookup (`journal → source document`) requires querying the document table by `journal_entry_id`, not a column on `journal_entries` itself — see §8 |
| `journal_entries.source` | free text (`'invoice'`, `'bill'`, …) | **LEGACY** | descriptive only, not a queryable key; no `source_id` column on `journal_entries` |

---

## 2. Target sales chain — gap vs. what exists

Target:
```
Customer → Invoice → InvoiceLine → product_id → Product
  → StockMovement (source_document_line_id) → unit_cost (WAC at sale)
  → JournalEntry / COGS
```

**Already true today**, end to end, for every invoice posted through
`invoiceService.postInvoice()` (`src/services/invoiceService.ts:176-268`).
The only missing piece is the DB-level enforcement + queryability
(§1 finding 1–2). No new relationship needs to be *invented* for sales; the
column that would need to become a real, indexed, FK-checked field is
`invoice_line_items.product_id` on a **new normalized child table** — the
jsonb `line_items` column would need to stop being the source of truth for
posting-relevant fields (product/warehouse/qty/cost) while possibly staying
as the display/legacy blob, OR the normalized table becomes purely an
evidence/reporting projection kept in sync at write time. See §17.

## 3. Target purchase chain — gap vs. what exists

Target:
```
Supplier → PO/Bill → PO/BillLine → product_id → Product
  → Stock Receipt Movement (source_document_line_id) → JournalEntry (GRNI/AP)
```

Also already true today. `purchaseOrderService.recordReceipt()`
(`src/features/purchases/services/purchaseOrderService.ts:116-149`) posts
`costingMode:'receipt'` lines with `sourceDocumentLineId: line.id` for every
PO line with a `productId`, updating WAC and creating the GRNI leg.
`billService.postBill()` (`src/features/purchases/services/billService.ts:254-295`)
checks `bill.purchaseOrderId` — if that PO already has `journalEntryId` set
(i.e. `recordReceipt()` already ran), the bill clears GRNI instead of
re-recording a receipt movement; otherwise the bill itself posts the receipt.
This is a correctly designed, already-implemented 3-way match guard
(`docs/LEDGER_ARCHITECTURE.md`). Same gap class as sales: no FK, no
SQL-queryable per-supplier/product purchase table.

## 4. Credit notes / returns

**Customer credit notes** (`creditNoteService.ts:109-224`): on a `'return'`
reason credit note linked to an invoice, the service aggregates
`invoicedByProduct` and `returnedByProduct` **maps keyed by `productId`**
across all of that invoice's lines and all of the credit note's lines, and
rejects if `returnedQty > invoicedQty` for any product. This is a real,
enforced quantity check — but it is **product-level, not line-level**. If an
invoice has two separate lines for the same product (e.g. different
warehouses or price points), the credit note cannot prove which specific
line it is crediting, only that the aggregate product quantity is not
exceeded. `CreditNoteAllocation` (money) is also invoice-level, not
line-level. **MISSING**: `CreditNoteLine.originalInvoiceLineId?: ID`.
Reversal movement (`sourceDocumentLineId: line.id` — the credit note's own
line id, not the original invoice line) and reversal journal are both
correctly generated.

**Supplier returns** (`supplierReturnService.ts`): already the strongest
evidence chain in the codebase — `supplier_return_lines` is a real table
with `product_id` FK, optional `source_document_line_id` (soft, to the
bill/PO jsonb line) and optional `source_stock_movement_id` (hard FK to the
exact goods-received movement being reversed — see migration 0029's
comments, reproduced in §1). PPV and VAT handling: not separately audited
line-by-line in this pass; `docs/INVENTORY_ARCHITECTURE.md` and the Phase 8
report notes describe supplier analysis as provable "within provable
relationships" — consistent with this being the one already-hardened chain.

## 5. Stock movement source-document evidence — consistency across workflows

Confirmed by grep across `src/features/inventory/services/*.ts` (excluding
tests): every current inventory-producing workflow populates
`sourceType`/`sourceDocumentLineId` when calling the shared
`InventoryPostingEngine`:

| Workflow | `sourceType` | line-level `sourceDocumentLineId` |
|---|---|---|
| Sales invoice | `'invoice'` | ✅ (`invoiceService.ts:252`) |
| Credit note (return) | `'credit_note'` | ✅ (`creditNoteService.ts:224`) |
| Bill / PO receipt | `'bill'` / `'purchase_order'` | ✅ (`billService.ts:295`, `purchaseOrderService.ts:149`) |
| Stock adjustment | `'stock_adjustment'` | not verified line-level in this pass — service posts one line per adjustment line (`stockAdjustmentService.ts:369`) |
| Stock transfer | `'stock_transfer'` | dispatch/receive legs, no source line concept (whole transfer is the unit) |
| Stock take | `'stock_take'` | posts variance lines (`stockTakeService.ts:362`) |
| Opening stock | `'opening_stock_batch'` | real child table `opening_stock_batch_lines`, FK'd |
| Supplier return | `'supplier_return'` | ✅ + `source_stock_movement_id` |

This is consistent and was clearly already reviewed carefully during Phase 2/3.
**No further schema change is needed here.** The one real weakness is
`reconcileInventory.ts`'s own comment (line ~320): a `correction` movement
without a `source_document_type` is only reconciled via a warning, not
rejected — an integrity check that already exists but is soft.

## 6. Sales posting audit

Traced fully in §2. Product identity is **never lost**: `invoiceService`
resolves `Product` once per `productId` up front
(`invoiceService.ts:192-201`), reuses it for revenue-account resolution,
`trackInventory` check, warehouse resolution, and the inventory line. A line
with no `productId` (service line) is simply skipped for the inventory leg —
correct, not a loss.

## 7. Purchase posting audit

Traced fully in §3. Product/supplier/source-line evidence is not lost
between PO → receipt → bill; the `purchaseOrderService.recordReceipt()` /
`billService.postBill()` split is the documented 3-way-match guard. The one
open question the audit could not resolve without deeper reading: whether a
**bill line with no linked PO** (a bill entered directly, `purchaseOrderId`
undefined) still gets `sourceDocumentLineId` set to the *bill* line's own id
(pattern strongly suggests yes, `billService.ts:295`, same `line.id` pattern
used everywhere else) — treat as **confirmed by pattern, not independently
re-derived**.

## 8. Journal source traceability

`journal_entries` has `source text not null` (free text: `'invoice'`,
`'bill'`, `'manual'`, `'reversal'`, …) and `reversal_of_entry_id` (real FK,
self-referential). It has **no `source_id` column** — traceability from a
journal entry back to its originating document is one-directional today:
every source document (`invoices`, `bills`, `credit_notes`,
`purchase_orders`, `customer_receipts`, `payments`, `bank_transactions`,
`opening_stock_batches`, `supplier_returns`) carries its own
`journal_entry_id` FK, indexed. To go **from** a `journal_entries` row back
to its source document requires knowing which table to search (using
`.source`) then querying `WHERE journal_entry_id = X` — works, is exercised
by tests/reconciliation code today, but is an O(tables) reverse lookup, not
a single join. `inventory_transaction_log` (migration 0031) is the one place
that already carries a structured `(source_type, source_id) → journal_entry_id`
triple for every inventory-touching post — **this is the closest thing to a
general journal-source index that already exists**, but it is scoped to
inventory postings only; a `customer_receipt` or `payment` journal has no
equivalent structured entry. **Recommendation for Phase 9B design (not
applied here):** either (a) extend `inventory_transaction_log`'s pattern
into a general `posting_log` used by every posting service, or (b) accept
the current one-directional-FK-plus-known-source-table model as sufficient,
since no report today needs "journal → arbitrary source" in the reverse
direction — only "document → its journal" and "product → movement →
journal via inventory_transaction_log", both of which already work.

## 9. Historical data backfill feasibility (general)

| Relationship | Backfill class | Basis |
|---|---|---|
| `invoice/bill/PO/credit_note line.productId` | **Already present** — no backfill needed; 98.5% of Office National invoice lines and 84% of bill lines already carry `productId` (§10) | live count |
| `stock_movements.source_document_type/_id` for rows before migration 0022 | **HIGH-CONFIDENCE at document level** via exact `reference` ↔ document-number match (`BILL-2004` → `bills.bill_number = 'BILL-2004'`, confirmed pattern, §10) | live sample |
| `stock_movements.source_document_line_id` for rows before migration 0022 | **AMBIGUOUS in general** — a document with multiple lines for the same product+quantity cannot be disambiguated by `reference` alone; **EXACT only** where (product, quantity) is unique within the referenced document | reasoned from schema; not exhaustively computed per-row in this pass |
| `stock_movements.unit_cost/total_cost` for pre-0022 rows | **IMPOSSIBLE to reconstruct exactly** — migration 0022's own comment states this explicitly: "the historical per-unit cost of each receipt/sale was never recorded" | migration 0022 comment |
| `CreditNoteLine.originalInvoiceLineId` (new field, §4) | **AMBIGUOUS for history, buildable forward** — historically only product-level qty is provable; going forward the field can be required at issue time | reasoned |
| Cross-checking `journal_entries` reverse-source for pre-Phase-3 entries | **Not attempted / not needed** — every existing document already carries `journal_entry_id` (§8) | — |

**Rule applied throughout, per the brief:** where exact match is not
provable, the relationship stays NULL. No text-similarity/description
matching was proposed anywhere in this audit.

## 10. Office National backfill analysis (READ-ONLY, live data, no writes)

Company: `Office National Demo (Pty) Ltd` (`676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`).

| Metric | Count |
|---|---|
| Invoices | 65 |
| Invoice lines (jsonb elements) | 198 |
| Invoice lines with `productId` set | **195 / 198 (98.5%)** |
| Bills | 31 |
| Bill lines | 68 |
| Bill lines with `productId` set | **57 / 68 (83.8%)** |
| Credit notes | 6 |
| Credit note lines | 6 |
| Credit note lines with `productId` set | **6 / 6 (100%)** |
| Purchase orders | 0 |
| PO lines | 0 |
| Supplier return lines | 0 |
| Stock movements | 284 |
| Movements with `source_document_type` set | **0 / 284 (0%)** |
| Movements with `source_document_line_id` set | **0 / 284 (0%)** |
| Movements with `reference` set | 284 / 284 (100%) — free text only, e.g. `BILL-2004` |
| Distinct movement `type`s present | `goods_received`, `opening`, `sale`, `sales_return` (4 of the 11 defined) |
| `inventory_transaction_log` rows | **0** |
| `journal_entries` | 171, sources: `bank, bill, credit_note, customer_receipt, fixed_asset, invoice, manual, opening_balance, payment` |

**Interpretation:** Office National's entire seeded dataset predates the
Phase 2/3 posting engine (migration 0022 onward). Every stock movement in
the live demo is a **legacy row with zero structured source-document
evidence** — this is the actual, concrete blocker for "provable realised
margin on Office National today," not a missing `productId` column (which
is already 84–100% populated on the documents themselves). A backfill pass
against this company would be: (1) HIGH-CONFIDENCE at the
document/`source_document_id` level via `reference` → `bill_number`/
`invoice_number` exact match; (2) largely AMBIGUOUS at
`source_document_line_id`/`unit_cost` level per §9. **No backfill was
executed — counts only, as instructed.**

The 41 (13/198 + 11/68, i.e. 16 total) invoice/bill lines missing
`productId` are very likely legitimate non-inventory lines (freight,
services, discounts) — not inspected line-by-line in this pass; flag as
**AMBIGUOUS, verify before assuming "missing == error"** in any future pass.

## 11. Target constraints

Recommended (design only, **not applied**):

- New normalized `invoice_line_items` / `bill_line_items` tables, same shape
  as the already-proven `opening_stock_batch_lines` / `supplier_return_lines`
  pattern: `id`, `company_id`, `<document>_id`, `line_number`, `product_id
  uuid NULL`, `warehouse_id uuid NULL`, `description`, `quantity`,
  `unit_price`, `tax_rate_id`, `tax_amount`, `line_total`, plus
  `fixed_asset_details jsonb NULL` (bill lines only). `product_id` **nullable**
  (§13) with `FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id)`
  — composite, tenant-consistent, matching migration 0029's convention
  (products would need a `products_company_id_id_key` unique constraint
  first — check it doesn't already exist before adding).
- `ON DELETE RESTRICT` (Postgres default/NO ACTION) on `product_id` — a
  product referenced by a posted line must not be deletable at all (ties
  into §12).
- Index on `(company_id, product_id)` and `(document_id, line_number)`.
- `UNIQUE (document_id, line_number)` mirroring the existing pattern.
- Do **not** touch `stock_movements`, `journal_entries`, or
  `inventory_transaction_log` structurally — their evidence model (§1, §8)
  is already adequate; only the pre-GL document layer needs normalizing.
- `CreditNoteLine.original_invoice_line_id uuid NULL` with a composite FK to
  the new `invoice_line_items` table once it exists (or to the legacy jsonb
  line id with no FK, if normalization is deferred — see §17 for sequencing).

## 12. Deletion / immutability

**Finding (confirmed by code, not assumption):**
`ProductService.deleteProduct()` (`src/features/inventory/services/productService.ts:45-47`)
calls `SupabaseProductRepository.delete()` which runs a **plain hard
`DELETE FROM products WHERE id = ...`**
(`src/features/inventory/repositories/SupabaseProductRepository.ts:121-124`)
with **no usage check at all** — no check for existing `stock_movements`,
no check for existing invoice/bill jsonb line references, nothing.

- `stock_movements.product_id` has a simple (non-composite) FK
  `references public.products(id)` with no `ON DELETE` clause → Postgres
  default is `NO ACTION`, so deleting a product **that has stock movements
  will fail at the DB layer** with a FK violation (accidentally safe today).
- `products.category_id`/`preferred_supplier_id`/account-override columns:
  no cascade behavior specified — same NO ACTION default.
- **The real hole:** a product referenced only inside `invoices.line_items`
  jsonb (no `stock_movements` row — e.g. a non-tracked/service product that
  was later marked `trackInventory` and swapped, or one whose only movements
  were later reversed to net zero and eligible for no FK... actually FK
  blocks on ANY row, reversed or not) — practically, any product that has
  ever posted a stock movement is already protected by the incidental FK.
  A product that was only ever referenced from **document jsonb lines with
  no inventory posting** (e.g. `trackInventory: false` service-type
  "product" used purely for catalog/pricing convenience) **can be deleted
  with zero warning**, silently orphaning every historical invoice/bill line
  that referenced it — `getProduct(line.productId)` on that historical
  document would return `undefined` going forward.
- **Recommendation:** make the guard explicit and intentional rather than
  relying on an incidental FK: `deleteProduct()` should check for
  (a) any `stock_movements` row, (b) once normalized child line tables exist
  (§17), any line row, and refuse/soft-delete (`status: 'inactive'`) instead
  of hard-deleting. `Product.status: ActiveStatus` already exists — the
  service already has everything needed to prefer deactivation; it simply
  isn't used that way today.

## 13. Non-inventory lines

Already correctly modeled: `DocumentLineItem.productId` is optional;
`fixedAssetDetails` is documented as "Mutually exclusive with `productId`"
(`src/types/common.ts:64-70`); every posting service's inventory-line loop
is `if (!line.productId) continue;` (invoice) or the `nonStock` flag passed
into the posting engine (bill/service lines). **No new line-type enum is
needed** — the existing `productId` presence/absence + `fixedAssetDetails`
presence is already sufficient discrimination. Phase 9 should keep
`product_id` nullable on any new normalized line table, matching this.

## 14. Realised margin contract

To compute **Revenue(Product X) − historical COGS(Product X)** without
free-text matching, the chain that must hold for every contributing sale is:

```
invoice_line_items.product_id = X            (needs §11's normalized table,
                                                OR: today's jsonb productId,
                                                which is already 98.5% populated
                                                going forward — see caveat below)
  → stock_movements row where
      source_document_type = 'invoice'
      AND source_document_id = invoice.id
      AND source_document_line_id = invoice_line_items.id   (already populated
                                                               for every post
                                                               since migration
                                                               0031 went live —
                                                               §5)
  → stock_movements.unit_cost  (the WAC AT THE MOMENT of that sale — already
                                 captured per-movement since migration 0022/0031,
                                 NEVER current Product.costPrice)
  → COGS = |quantity_delta| × unit_cost, summed
```

**This already works for every invoice posted after the Phase 3 posting
engine went live** (`inventoryPostingEngine.ts` + `post_inventory_transaction`
RPC). It does **not** work for Office National's existing 65 invoices,
because none of their movements carry `source_document_type`/`unit_cost`
(§10) — those predate the engine entirely. **Realised margin cannot be
computed for any pre-engine sale, and must not be approximated with current
WAC** (explicit brief instruction, and the codebase already agrees —
`Product.costPrice` doc comment: "actual Cost of Sales comes from... never
from this field" for FIFO, and for WAC it's *only* correct going forward,
not retroactively, since it drifts with every subsequent receipt).
**Conclusion: Realised Product/Category Margin is unlockable purely by
report-layer work for any company whose data was entirely created after the
posting engine — it needs NO new schema.** For Office National specifically,
it needs either a reviewed historical backfill (§9/§10, line-level costing
is largely unrecoverable) or must stay explicitly out of scope for
historical periods, current-and-forward only.

## 15. Supplier analytics contract

Provable today, without new schema, for any bill/PO posted via the current
engine: purchase quantities and values by supplier (via
`bills.supplier_id` → `bill.line_items[].productId` → cross-reference
`stock_movements` by `source_document_id = bill.id`), returns (via
`supplier_returns.supplier_id`, already a real FK), PPV (the engine already
computes and would need its own dedicated GL account per
`docs/LEDGER_ARCHITECTURE.md`'s PPV account — not independently verified in
this pass), and current-preferred-supplier inventory association (via
`products.preferred_supplier_id`, already FK'd). **"Supplier profitability"
has no accounting meaning in this system today and should continue to be
avoided as a label** (Phase 8 already correctly avoided it per the review
notes) — nothing in Phase 9 changes that; profitability would require
allocating overhead/freight to a supplier, which is not modeled anywhere.

## 16. Report unlock matrix

| Report | Currently possible? | Relationship missing | Unlocked after Phase 9? |
|---|---|---|---|
| Realised Product Margin | No (pre-engine data); Yes (post-engine data) | Normalized line table for SQL-level grouping; historical `unit_cost`/`source_document_line_id` for legacy rows | Partially — forward data yes today; historical needs backfill decision (§9/§10), not schema |
| Realised Category Margin | Same as above, plus `product.category_id` (already FK'd) | Same | Same |
| Product Sales | Possible today in JS (fetch invoices, reduce by `line.productId`); not SQL-queryable | Normalized `invoice_line_items` table | Yes, for query performance/report-layer simplicity, not new capability |
| Category Sales | Same | Same | Same |
| Product COGS | Same as Realised Product Margin | Same | Same |
| Category COGS | Same | Same | Same |
| Purchases by Supplier | Possible today (bills already have `supplier_id` FK + `line.productId`) | Normalized `bill_line_items` for SQL grouping | Yes, for query performance only |
| Supplier Returns | Already fully provable — real FK'd tables since migration 0029 | None | Already unlocked |
| PPV by Supplier | Possible if PPV account is correctly isolated per posting (not independently verified this pass) | none identified | Needs targeted verification, not schema |
| Purchase Price History | Provable per product via `stock_movements.unit_cost` ordered by `movement_date`, for post-engine data only | Historical backfill for pre-engine rows (§9) | Forward: yes today. Historical: only if backfilled |
| Sales by Product | Same as Product Sales | Same | Same |
| Sales by Category | Same as Category Sales | Same | Same |

## 17. Proposed migrations (AUTHORED / PROPOSED ONLY — NOT APPLIED)

Sequenced after the current repository head (next migration = `0037`).
Given the findings above, the **minimal additive set** is narrower than the
brief anticipated — `productId` does not need to be *added* to invoice/bill
lines, it needs to be **normalized out of jsonb into a real table** so it
can be FK-enforced and SQL-queried. Proposed, not applied:

- `0037_invoice_line_items_table.sql` — new table per §11's shape, FK'd to
  `invoices(company_id, id)` (needs `invoices_company_id_id_key` added
  first) and to `products(company_id, id)` (needs
  `products_company_id_id_key` added first — check it doesn't already exist).
  **Dual-write period**: `invoiceService` writes both `invoices.line_items`
  jsonb (kept, for backward compat / display) and the new table, until every
  reader is migrated — this is a real engineering decision that needs its
  own review, not decided here.
- `0038_bill_line_items_table.sql` — same shape for bills.
- `0039_purchase_order_line_items_table.sql` — same shape for POs, needed
  before PO lines can be linked from bills at line-level (`bill_id` +
  `purchase_order_line_id`).
- `0040_credit_note_line_items_table.sql` + `original_invoice_line_id` FK.
- `0041_products_company_id_id_key.sql` (if not already present — **must
  verify against live schema before authoring**, not assumed here) +
  `0042_invoices/bills/purchase_orders/credit_notes_company_id_id_key.sql`
  as prerequisites for the composite FKs above (some of these unique
  constraints may already exist from migration 0029's pattern for
  `bills`/`purchase_orders` — **confirmed already present** for those two in
  §1; `invoices`, `credit_notes`, `customers` were **not** confirmed and
  need checking before 0037/0040 are authored for real).
- `0043_product_delete_guard.sql` — **not a schema change**, a service-layer
  fix (§12): `deleteProduct()` gains an explicit usage check. Listed here
  only so it isn't lost; it does not require a migration number, in fact —
  flagging that this line item was misfiled as "migration" and is actually
  a Phase 9B code change with no DDL.

**None of these have been run. `MIGRATIONS: AUTHORED/PROPOSED ONLY` per the
STOP gate.**

## 18. Forward-write contract

Already satisfied for the inventory-posting-relevant fields (`productId`,
`warehouseId`, `sourceDocumentLineId` reaching `stock_movements`) across
every current workflow (§5). What Phase 9B's forward-write work would
actually need to add, once §17's tables exist: every document-creation path
(`invoiceService.createInvoice`, etc. — not traced line-by-line in this
pass) must write to the new normalized table in the same transaction/call as
the jsonb write, not just at post time. This is new work; today only
*posting* reads `productId`, nothing enforces it's written correctly at
*draft creation* time beyond the TS type being optional.

## 19. Test plan (design only)

Given §0's finding that most of the forward chain already has passing tests
(`inventoryPostingEngine.test.ts`, `inventoryAccountingMatrix.test.ts`,
`stockAdjustmentService.test.ts`, `stockTransferService.test.ts`,
`supplierReturnService.test.ts`, `stockTakeService.test.ts` — all already
assert `sourceType`/`sourceDocumentLineId`/`costingMode` per §5's grep),
Phase 9B's NEW test surface is narrower than the brief's checklist:

- **NEW (normalized tables, §17):** insert with valid `product_id` succeeds;
  insert with cross-company `product_id` rejected by composite FK; insert
  with `product_id = NULL` succeeds for a service line; deleting a
  referenced product is rejected (once §12's guard exists).
- **NEW:** `CreditNoteLine.originalInvoiceLineId` — allocation against a
  specific line, not just aggregate product quantity; rejects over-return
  against that specific line even when the product's total across other
  lines has headroom.
- **ALREADY COVERED (verify still green, don't re-author):** invoice line →
  product → stock movement → COGS historical cost → journal evidence; bill
  line → product → receipt → stock movement → WAC → journal evidence;
  credit note → reversal movement → reversal journal; supplier return →
  product → supplier → source purchase → movement → journal; tenancy
  (cross-company rejected via composite FKs, already the pattern
  everywhere); immutability of `stock_movements` (RLS revokes
  UPDATE/DELETE, already in place since migration 0006).
- **NEW:** historical/ambiguous stock movement backfill (if ever attempted)
  must leave `source_document_line_id`/`unit_cost` NULL when not
  exact-provable — test asserts the backfill script never guesses.

## 20. Risks

- **Dual-write drift**: if §17's normalized tables are added, the jsonb
  `line_items` blob and the new table can disagree unless every write path
  is updated atomically — the single biggest implementation risk, not a
  schema risk.
- **`products_company_id_id_key` / equivalent uniques may not all exist
  yet** — §17 flags this as unverified for `invoices`/`credit_notes`;
  authoring the composite FK migrations before confirming this would
  produce a migration that fails to apply.
- **Office National demo data cannot demonstrate realised margin** even
  after Phase 9B ships, without a separate historical-backfill decision
  (§10) — set expectations before Phase 9B is scoped, so "why doesn't the
  demo show realised margin" isn't a surprise later.
- **`deleteProduct()`'s hard delete** is a live gap today, independent of
  Phase 9 — worth fixing early/separately rather than bundling into the
  larger relational migration, since it's a one-file service change with no
  schema dependency.
- **`reconcileInventory.ts`'s soft warning on unlinked corrections** (§5)
  means a `correction` movement with no source document is flagged, not
  rejected — a determined bad actor or a future bug could still create an
  untraceable movement; not hardened by this audit, flagged for Phase 9B
  scope discussion only.

---

## PHASE 9A RELATIONSHIP AUDIT:
**COMPLETE**

## MIGRATIONS:
**AUTHORED/PROPOSED ONLY — NOT APPLIED**

## DATABASE WRITES:
**NONE** (all Supabase MCP calls this session were `SELECT`-only, verified
by transcript — company list + read-only aggregate counts against Office
National Demo)

## PHASE 9B IMPLEMENTATION:
**NOT STARTED**

**NO COMMITS. NO PUSHES.**

---

# SALES DOCUMENT WORKFLOW AUDIT — 2026-09-03 (record-page increment 3)

Read-only audit of the Quote → Sales Order → Invoice → Receipt chain, done alongside the
Inventory-transaction-page UX work. **No accounting behaviour was changed.** Findings:

## Q1. Quote — commercial offer only, never posts
`src/features/sales/services/quoteService.ts`. **Confirmed correct.** A Quote:
- posts **no** journal entry, creates **no** AR, **no** VAT-output liability, **no** stock
  movement, **no** COGS, **no** stock reservation.
- statuses (`src/types/quote.ts` `QuoteStatus`): `draft · sent · accepted · declined · expired`.
  There is **no** `converted` status value — "converted" is *derived* (a `SalesOrder` exists
  with `quoteId === quote.id`). Transitions: `draft→sent` (`markAsSent`), `sent→accepted`
  (`markAsAccepted`), `sent→declined` (`markAsDeclined`), `*→expired` (`markAsExpired`).
  `convertToSalesOrder` requires `status === 'accepted'` and leaves the quote `accepted`.
- delete is `draft`-only.

## Q2. Sales Order — confirmed commercial order, NOT the accounting sale
`src/features/sales/services/salesOrderService.ts`. **Confirmed correct — with one gap.** A Sales Order:
- recognises **no** revenue, creates **no** AR, posts **no** VAT, issues **no** inventory,
  posts **no** COGS.
- statuses (`src/types/salesOrder.ts` `SalesOrderStatus`): `pending · confirmed · fulfilled ·
  cancelled`. `convertToInvoice` creates a **draft** invoice (`invoice.salesOrderId` set) and
  marks the order `fulfilled`; it is guarded against double-conversion by both the status check
  **and** the `invoice.salesOrderId` back-reference.
- **STOCK COMMITMENT: NOT IMPLEMENTED.** `StockBalance.quantityCommitted` exists in the type
  (`src/types/stockBalance.ts`) and the `quantityAvailable()` helper subtracts it, but **nothing
  ever writes it** — `stockBalanceService` hardcodes `quantityCommitted: 0` and
  `stockService.getQuantityOnHand` has a literal `const quantityCommitted = 0; // TODO(Phase 2):
  sum reservations from open Sales Orders`. So **Available === On hand** everywhere today. A
  Sales Order does **not** contribute to a "Committed" figure. This increment did **not** invent
  one (per brief §5 — "if no real commitment model exists: STOP and report"). See recommendation R3.

## Q3. Invoice — the accounting event
`src/services/invoiceService.ts` `postInvoice()`. **Confirmed correct, engine untouched.** One
atomic `inventoryPostingEngine` call posts a single balanced entry:
`DR Accounts Receivable · CR Sales Revenue (per resolved account) · CR VAT Output (if > 0) ·
DR COGS (per product, engine-computed from WAC) · CR Inventory (per product)`. Posting flips
`draft→sent` and stamps `journalEntryId`. Post-`draft`, `updateInvoice` refuses any change to an
accounting-relevant field (only `dueDate` / `notes` remain editable) — enforced in the service,
not just the UI. Delete is `draft`-only; a posted invoice is corrected with a credit note.

## Q4. Partial payment — SUPPORTED and correct
Invoice R10,000 → Receipt R3,000 → Outstanding R7,000 → Receipt R7,000 → Outstanding R0.
- `customerReceiptService.recordReceipt()` posts `DR Cash and Bank / CR Accounts Receivable`
  for the **full receipt amount**, then calls `invoiceService.recordPayment(invoiceId, amount)`
  per allocation. `recordPayment` updates `amountPaid` + recalculates status
  (`partially_paid` / `paid`) and posts **no** journal (the cash↔AR move already happened at
  receipt time). Net GL after invoice + receipts: AR nets to zero. ✔
- `InvoiceDetailPage` shows **Total / Paid / Outstanding** in the line-items totals block plus a
  **Payments & receipts** table (each receipt clickable, with allocated amount). ✔
- Partial payments are correctly **not** attachable to Quotes or Sales Orders (no `amountPaid`
  field, no receipt allocation target).

## Q5. Customer deposit / payment before invoice — ⚠️ ACCOUNTING GAP (reported, NOT changed)
**This is the important finding.** `customerReceiptService.recordReceipt()` **always** posts:

```
DR  1000 Cash and Bank        <receipt amount>
CR  1100 Accounts Receivable  <receipt amount>
```

regardless of how much is allocated. An unallocated receipt (`allocations: []`,
`unallocatedAmount === receipt.amount`) is still **credited directly to Accounts Receivable**.

- **Customer subledger effect:** the customer's AR balance goes **negative** (a credit balance
  in a receivable account). There is **no** customer-deposit / "income received in advance" /
  contract-liability account — `AccountMappingKey` (`accountMappingService.ts`) has no
  `CUSTOMER_DEPOSIT` / `CONTRACT_LIABILITY` key, and none of codes 2xxx is mapped for it.
- **Later allocation** (`allocateToInvoice` → `recordPayment`) posts **no** journal — it just
  moves `unallocatedAmount` into `allocations[]` and bumps the invoice's `amountPaid`. Once the
  invoice posts (`DR AR …`), AR nets to the correct outstanding figure. So the **end state is
  right**, but during the window between deposit and invoice the balance sheet shows an
  understated AR and a missing current liability.
- **Is it intentional?** No evidence either way in the ledger docs. The only "deposit" the docs
  mention is a **bank-reconciliation** training scenario (a deposit in transit), unrelated to
  customer prepayments. Treating it as a **gap**, not a design decision.
- **Correct treatment (IFRS 15 / SA GAAP):** a payment received before the performance
  obligation is a **contract liability** — `DR Cash / CR Customer Deposits (Income Received in
  Advance, ~2300)`; on invoicing, `DR Customer Deposits / CR Accounts Receivable` to apply it.
- **Not fixed here** — it needs a new account-mapping key + a chart-of-accounts row + a branch
  in `recordReceipt` (post CR to the deposit liability for the unallocated portion) + an
  `allocateToInvoice` journal (`DR deposit / CR AR`). That is an explicit accounting design
  decision + a DB change (new account), out of this inspect-only increment's scope. See
  recommendation R1.
- `CustomerReceiptDetailPage` already surfaces the unallocated ("On account") amount, so the
  UI is not hiding it — but it currently labels it as AR-reducing, which is what the posting does.

## Q6. Partial Sales-Order invoicing — NOT SUPPORTED
`SalesOrderService.convertToInvoice` copies **all** lines at full quantity, then marks the order
`fulfilled` and blocks any second conversion (status check + `invoice.salesOrderId` back-ref).
There is no "quantity invoiced so far" / "remaining to invoice" tracking on `SalesOrder` or its
lines, and no `partially_invoiced` status. (Contrast the purchase side, which *does* have
`PurchaseOrderStatus = '… | partially_received | …'`.) Not built here (brief §11). See
recommendation R2 — this is a genuinely useful feature for real accounting software.

## Q7. Duplicate / copy — NOT SUPPORTED
No `duplicate` / `clone` method on `quoteService`, `salesOrderService`, `purchaseOrderService`,
or any sales/purchase service (`grep -rniE "duplicate|clone" src/features/*/services` → nothing).
Not built here (brief §15 — "do not implement until service behaviour is safely defined"). See
recommendation R4.

## Q8. Print / export on the migrated full-page records — PARTIAL
The Phase-7 shared export framework is `src/features/export/` — `ExportMenu` (CSV / Excel /
`window.print()`) + `PrintableReport` (a generic dataset→table renderer, `hidden print:block`).
- **List pages** wire `ExportMenu` widely.
- **The new `*DetailPage` record pages wire NONE of it** — no `ExportMenu`, no `PrintableReport`,
  no per-record print stylesheet. `window.print()` on a record page today prints the app chrome +
  the record as raw on-screen HTML.
- There is **no formal business-document print layout** (branded header, company reg/VAT,
  bill-to, totals block, terms) for Quote / Sales Order / Invoice / Credit Note / PO. Brief §13
  / §18 ask for one; it is a real sub-feature (a `PrintableDocument` component + `@media print`
  pass), not wired here. See recommendation R5.

## Q9. Edit actions on the full-page records — CORRECT, immutability respected
Draft Invoice / draft Bill / draft PO expose **Edit**; once posted/sent the service layer
(`invoiceService.updateInvoice`, `billService`, …) throws on any accounting-relevant change and
the pages only render the Edit button in `draft`. No service guard was weakened.
