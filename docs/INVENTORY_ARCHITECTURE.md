# INVENTORY ACCOUNTING MODULE — PHASE 0 AUDIT & TARGET ARCHITECTURE

**Opened:** 2026-08-30 · **Owner:** Queen Bee · **Status:** Phase 0 complete — **STOP for Review 1**
**Rule:** No code, no migrations, no `apply_migration`, no commits until Review checkpoints explicitly allow it.

This document is the Phase 0 current-state audit and the proposed target architecture for making
Inventory a first-class accounting subsystem. It supersedes the stale `docs/INVENTORY_DOMAIN.md`
(see §3 — that file's account numbers are wrong) and will be the parent of the later
`docs/INVENTORY_ACCOUNTING.md` and `docs/IMPORT_EXPORT_ARCHITECTURE.md`.

Method: 6 parallel read-only audit agents (schema/migrations · services/costing · GL integration ·
navigation/UI/Fixed-Assets · import/export/print/reports · demo-data/permissions/tests), each citing
`file:line`, cross-checked by the Queen against the live Supabase project `bcaffvpibpitpuqglszn`
(single tenant — "Office National Demo (Pty) Ltd", company `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`).
No database writes were performed.

---

## KEY FINDING UP FRONT

**Inventory is already its own code module (`src/features/inventory/`) — it is NOT entangled with
Fixed Assets.** Zero cross-imports exist between `src/features/assets/` and `src/features/inventory/`.
The only "entanglement" is a shared navigation group titled *"Assets & Inventory"*. The real gaps are:

1. **Adjustments, write-offs, stock-takes and opening stock post NOTHING to the General Ledger** and
   have no approval control — a stock write-off silently breaks the Inventory-control-account ↔
   valuation tie.
2. **There is no stock-variance / write-off / shrinkage GL account** in the chart at all.
3. **The stock-movement ledger carries no cost and no source-document link** — only a free-text
   `reference` string. A movement cannot be traced to the invoice/bill line that caused it, and WAC
   is not reconstructable from history.
4. **No stock-take, inventory-adjustment-document, warehouse-transfer-document, or opening-stock
   workflow exists** as an entity — only bare enum values on `stock_movements`.
5. **No import framework, no Excel support, no export, no printing/document-generation of any kind**
   exist anywhere in the application.
6. **FIFO is non-functional in the deployed app** — `stock_lots` has no Supabase table; the live
   wiring is an in-memory mock. **As of 2026-09-05 (Block A/B) FIFO is GATED**: a new
   `FIFO_VALUATION_ENABLED = false` flag (`src/config/featureFlags.ts`) hides the FIFO option in
   `ProductForm` and `ProductService.createProduct` / `updateProduct` reject a new switch to
   `fifo` at the service layer (a product already on `fifo` — none exist live — can still be
   edited / switched back to WAC). The FIFO lot-walking engine is untouched. Flip the flag only
   in the same change that ships a real `SupabaseStockLotRepository` + `stock_lots` migration +
   backfill.
7. The **GL 1200 = inventory valuation** tie (R1,569,743.20, difference R0.00) holds *only because*
   Phase 21.1 hand-restated WAC in raw SQL. There is no regression test and the drift-generating
   mechanism is unchanged.

---

## 1. CURRENT SCHEMA (live)

### 1.1 Inventory tables — 4 total

| table | rows | created by | notes |
|---|---|---|---|
| `products` | 50 | migration 0005 | canonical item entity — **no `inventory_products` duplicate exists** |
| `warehouses` | 1 | migration 0005 | single location "Main Distribution Centre – Montague Gardens", `is_default=true` |
| `stock_movements` | 284 | migration 0006 | append-only quantity ledger — **DB-enforced** (see §1.3) |
| `category_account_mappings` | 5 | migration 0019 (Phase 21.3) | free-text `category_name` → revenue / COGS / inventory account IDs |

There is **no `supabase/migrations/` folder** in the repo. Migration history (0000–0020) lives only
in the live DB (`supabase_migrations.schema_migrations`). Two loose reference SQLs sit in
`docs/db-changes/`.

### 1.2 Enums

- `product_type`: `good`, `service`
- `product_valuation_method`: `weighted_average`, `fifo`
- `active_status`: `active`, `inactive`
- `stock_movement_type`: `goods_received`, `sale`, `sales_return`, `transfer_in`, `transfer_out`, `adjustment`, `opening`
  - **In the Supabase repo the `stock_movements.type` column is written/read as plain `text`, not the enum** (`SupabaseStockMovementRepository.ts:11,26`) — no DB-level value constraint on inserts from that path.

### 1.3 `products` (key columns)

`id`, `company_id` (FK companies CASCADE), `sku` (UNIQUE per company), `name`, `description?`,
`type`, `unit_price numeric(14,2)`, **`cost_price numeric(14,4)`**, `tax_rate_id?`,
`track_inventory bool DEFAULT true`, `quantity_on_hand numeric(14,3) DEFAULT 0`,
`reorder_level numeric(14,3)?`, `status DEFAULT 'active'`, `barcode?`, `uom?` (free text),
`category?` (free text), `valuation_method?` (**nullable, NO DB default** — code treats NULL as
`weighted_average`), `created_at`, `updated_at`.

- **DRIFT:** migration 0005's SQL declares `cost_price numeric(14,2)`; the live column is `numeric(14,4)`.
  This widening was applied by an **unversioned change** — not represented by any migration file
  (Phase 21 P1.2 "fold into 0020" but no 0020 statement text does it). Origin UNVERIFIED.
- No CHECK constraints beyond NOT NULL. No triggers.

### 1.4 `stock_movements`

`id`, `company_id` (FK CASCADE), `product_id` (FK products NO ACTION), `warehouse_id` (FK warehouses
NO ACTION), `type`, `quantity_delta numeric(14,3)` (signed), `reference?` (free text, e.g.
`BILL-2004`, `OPENING`), `notes?`, `created_at`, `updated_at`.

- **Append-only is genuinely DB-enforced:** RLS has SELECT + INSERT policies only (no UPDATE/DELETE
  policy), and `UPDATE`/`DELETE`/`TRUNCATE` are `REVOKE`d from `authenticated` (migration 0006). The
  repository interface `IStockMovementRepository` has only `getAll`/`getById`/`create`.
- **NO `unit_cost` / `total_cost` column** — the movement records quantity only.
- **NO source-document linkage** — no `source_document_type` / `_id` / `_line_id`. Only free-text `reference`.
- `updated_at` exists but is dead weight (append-only).
- Sign of `quantity_delta` is not enforced against `type`.

### 1.5 RLS & tenancy

All 4 tables: RLS enabled, `{authenticated}` role only, **no `{public}`/anon policies**, predicate
`company_id = (SELECT get_my_company_id())`. `get_my_company_id()` returns NULL for a NULL / inactive
profile → fail-closed.

- `products`, `warehouses`, `category_account_mappings` have a single **`FOR ALL`** policy →
  **`products.quantity_on_hand` is freely `UPDATE`-able** by any authenticated tenant member; nothing
  at the DB level forces quantity changes through the ledger.
- The ~45 pre-existing tables' RLS is still gated by the coarse `profiles.role` enum + `company_id`
  only — the fine-grained `permissions`/`roles` system (Phase T) is **UI-only** and does not touch RLS.

### 1.6 Indexes

Single-column btree only: `*_pkey`, `products (company_id, sku)` UNIQUE, `products (company_id)`,
`products (tax_rate_id)`, `warehouses (company_id, code)` UNIQUE, `warehouses (company_id)`,
`stock_movements (company_id)`, `(product_id)`, `(warehouse_id)`, plus 4 on `category_account_mappings`.

**Missing:** composite `stock_movements (product_id, warehouse_id)` and `(product_id, created_at)` —
every on-hand / per-warehouse calc does `getAll()` + sum in JS today.

### 1.7 `stock_lots`

**Does not exist in the database.** `StockLot` type + `IStockLotRepository` + `MockStockLotRepository`
+ `StockLotService` all exist in code, but `instances.ts:23` wires the **in-memory mock**. All 50 live
products are `weighted_average` or NULL — FIFO has never run against real data and would throw on the
first sale of any product switched to it (no lots).

### 1.8 Document line items

`quotes` / `sales_orders` / `invoices` / `credit_notes` / `purchase_orders` / `bills` all store lines
in a single `line_items jsonb NOT NULL` column. `DocumentLineItem.productId` / `.warehouseId` /
`.fixedAssetDetails` live inside the JSON with **no FK, no NOT NULL, no SQL-level per-product
reporting** (a documented deviation from migration 0006).

---

## 2. EXISTING INVENTORY-RELATED ENTITIES

| Layer | What exists |
|---|---|
| **Types** (`src/types/`) | `Product`, `Warehouse`, `StockMovement` + `StockMovementType` (7-value union), `StockLot` (no table), `DocumentLineItem` (jsonb). No `CategoryAccountMapping` domain type located in `src/types/`. |
| **Repositories** (`src/features/inventory/repositories/`) | `SupabaseProductRepository`, `SupabaseWarehouseRepository`, `SupabaseStockMovementRepository` (append-only), **`MockStockLotRepository` (live wiring — should be Supabase)**. All resolve tenant via `resolveDefaultCompanyId()` = "first company by created_at". |
| **Services** (`src/features/inventory/services/`) | `productService` (catalog CRUD; DTOs `Omit` `quantityOnHand`), `warehouseService`, `stockService` ("the ONLY place quantities change" — appends a movement then re-sums the whole ledger into `products.quantity_on_hand`), `stockLotService` (FIFO lot-walking, shared preview/consume algo, throws rather than guess), `inventoryPostingAdapter` (`InventoryPoster` — the GL bridge Sales/Purchases call). |
| **Hooks** | `useProducts`, `useWarehouses`, `useStockMovements`, `useStockAlerts`. |
| **Pages** | `/inventory/products` (`ProductsPage`), `/inventory/warehouses` (`WarehousesPage`). |
| **Components** | `ProductsTable`, `WarehousesTable`, `StockByWarehouseTable`, `LowStockAlertWidget`, **`InventoryItemDetail` + `InventoryItemDetailPage`** (full-page route `/inventory/products/:productId`, 8 tabs — Overview / Stock / Purchasing / Sales / Transactions / Accounting / Documents / Activity; replaced `ProductDetail`/`ProductDetailSheet`/`InventoryItemDetailSheet` on 2026-09-03), `ProductForm`/`ProductFormModal`, `WarehouseForm`/`Modal`, `StockTransferForm`/`Modal`, `StockAdjustmentForm`/`Modal`. All create/edit flows are on the Vertex Form System (`FormShell`/`FormBody`/`FormFooter`). Short enum pickers use `EnumSelect` (base-ui dark popup), not native `<select>`. |
| **Account mapping** | `category_account_mappings` (5 rows) + `CategoryAccountMappingService`. |
| **Icons** (`src/config/icons.ts`) | registry keys already exist: `inventory:Boxes`, `products:Package`, `warehouses:Warehouse`. Nav imports Lucide directly (established exception). |

**`quantityOnHand`** = a denormalised cache of the ledger sum (self-healing for quantity, **not** for
`costPrice`). **`quantityCommitted`** and **`quantityOnPurchaseOrder`** are hard-coded `0`
(`stockService.ts:109-110`, `TODO(Phase 2)`) and are not `Product` fields.

**Absent entirely:** product-category entity, product↔supplier link / supplier item code, UOM table,
stock-take, inventory-adjustment document, warehouse-transfer document, opening-stock workflow,
purchase-return path, per-(product, warehouse) balance table, `reconcileInventory()`.

---

## 3. EXISTING ACCOUNTING FLOWS

### 3.1 Account-mapping architecture — **no posting service hardcodes a UUID**

Two layered resolvers:

1. **`AccountMappingService`** (`src/features/accounting/services/accountMappingService.ts`) — a
   `AccountMappingKey` union (~40 semantic roles) → hardcoded key→**account-CODE** map
   (`INVENTORY: '1200'`, `COGS: '5000'`, `GRNI: '2050'`, `AR: '1100'`, `AP: '2000'`,
   `SALES_REVENUE: '4000'`, `VAT_OUTPUT: '2100'`, `VAT_INPUT: '2110'`). `getAccountId(key)` fetches
   the chart once, caches `Map<code,id>`, returns the real UUID, throws if the code is missing.
   Interface `AccountMapper` is constructor-injected into every posting service. Still a fixed
   convention, **not** a per-company configurable table (explicitly flagged).
2. **`CategoryAccountMappingService`** (Phase 21.3) — `resolveForCategory(categoryName)` →
   `{ revenueAccountId?, cogsAccountId?, inventoryAccountId? }` from the DB-backed, read-only,
   RLS-scoped `category_account_mappings` table; returns all-`undefined` for an unmapped category →
   caller falls back to the generic key. Wired into `invoiceService`, `creditNoteService`,
   `billService` — **NOT `purchaseOrderService`** (its constructor doesn't even accept a resolver).

Posting services split a mixed-category document into one GL line per resolved account via
`bucketByAccount(contributions, controlTotal)`, which always re-sums to the control total to the cent.

### 3.2 The real inventory Chart of Accounts — resolving the doc contradiction

| code | name | type |
|---|---|---|
| **1200** | **Inventory** | asset |
| 2050 | Goods Received Not Invoiced (GRNI) | liability |
| 5000 | Cost of Goods Sold (generic) | expense |
| 5010–5040 | Cost of Sales – Furniture / Printers & Equipment / Stationery / Consumables | expense |
| 4000 | Sales Revenue (generic) | revenue |
| 4010–4050 | Sales – Office Furniture / Printers & Equipment / Stationery / Consumables / Delivery & Service | revenue |

- **The inventory asset account is `1200`.** Confirmed in the code constant, `src/mock-data/accounts.ts`,
  the live `accounts` table, live opening journal JE-0001, and the live GL 1200 balance R1,569,743.20.
- **`1400` does not exist.** **`5500` is "Income Tax Expense"**, not a variance account.
  `docs/INVENTORY_DOMAIN.md:7` (the only source of "1400 / 5500") is **wrong and dangerous** — a
  write-off posted to 5500 would corrupt the tax charge. A stale copy of this error is in a
  `stockService.ts:244-246` comment; `docs/ACCOUNTING_DOMAIN.md:12-13` also has wrong codes.
- **There is NO inventory-adjustment / write-off / shrinkage / stock-gain GL account** anywhere
  (live or mock). This must be added before any adjustment can post.

### 3.3 `journalEntryService` immutability

`postJournalEntry()` validates double-entry (Σdr = Σcr within 0.005, ≥2 lines, real account IDs),
enforces the entry date falls in an **open** accounting period, assigns `JE-nnnn`, writes an audit
log entry, creates the row `status:'posted'` immediately. **The repository has no `update()` and no
`delete()`.** The only correction path is `reverseJournalEntry()` — a NEW entry dated *now* with every
line's debit/credit swapped, `source:'reversal'`, `reversalOfEntryId` set, blocks double reversal,
requires an open period. Domain services mirror this (posted invoices/bills/credit-notes cannot be
deleted or have accounting fields edited).

---

## 4. EXISTING STOCK VALUATION MECHANISM

- **Policy:** per-product `valuation_method`. **WAC is the default** (every live product). FIFO exists
  in code but is **non-functional in the deployed app** (`stock_lots` mock, in-memory).
- **WAC formula — the only place it is recomputed** (`inventoryPostingAdapter.ts:218-222`, on a
  **receipt only**):
  `newAvgCost = (existingQty × costPrice + receivedQty × unitCost) / (existingQty + receivedQty)`,
  or `costPrice` when `newQty ≤ 0`. **Unrounded in code**, written straight back; Postgres silently
  quantises to 4 dp. `unitCost` = the source line's **ex-VAT `unitPrice`** — no freight/landed cost.
- **Not self-healing.** `costPrice` is computed incrementally from its own previous value; unlike
  `quantityOnHand` there is no recompute-from-ledger fallback (the ledger carries no per-movement
  cost). This is the mechanism behind the historical drift.
- **COGS on a sale / return uses CURRENT WAC**, not the acquisition cost of the units sold —
  produces an arithmetically wrong realised margin whenever WAC has moved since the sale (flagged in
  code).
- **Historical "WAC drift":** Phase 21 P1.2 found GL 1200 diverged from `Σ(qoh × cost_price)` by
  R668.70; fixed by a full perpetual-WAC **SQL restatement** + widening `cost_price` to 4 dp +
  posting `JE-4100 DR 5000 / CR 1200 R0.07` for the residual. **No regression test, no helper** —
  the restatement exists only as executed SQL. The generating mechanism is unchanged.
- **Precision today:** quantity never rounded (float-artefact risk on fractional UOM); `costPrice`
  full-float → 4 dp column; GL postings `roundToCents` → 2 dp; **valuation-report figures unrounded**
  (`calculateValuation`, `calculateInventoryTotals`) → can disagree cent-for-cent with the GL.
- **Concurrency:** `billService.postBill` / `purchaseOrderService.recordReceipt` /
  `invoiceService.postInvoice` / `creditNoteService` fan out per-line movement calls with
  `Promise.all`. Two lines for the **same product** both read the same stale `costPrice`/`qoh` and
  both write — **lost update, corrupted WAC** (and FIFO lot double-consumption). Latent bug in the
  live app today.
- **No negative-stock guard under WAC** (a sale posts COGS at current cost and drives on-hand
  negative). FIFO instead *throws* and aborts the whole post — an inconsistent policy.

---

## 5. EXISTING PURCHASE-TO-STOCK BEHAVIOUR

Two entry points, deconflicted by the PO's `journalEntryId`:

- **`purchaseOrderService.recordReceipt(id)`** — tracked-inventory lines only. Posts
  **DR 1200 Inventory / CR 2050 GRNI** for the ex-VAT line total (generic `INVENTORY` key — **no
  category split**; VAT untouched). Then `recordReceiptMovement()` per line (GL-first, stock-after) →
  `goods_received` movement + WAC recalc / FIFO lot. **Idempotent** (rejects a `received`/`cancelled`
  PO). **No partial receipt** (all-or-nothing; `partially_received` status is unused). Not exercised
  in live data.
- **`billService.postBill(id)`** — `splitLineItems()` buckets each line: fixed-asset → 1500 (separate
  `FixedAssetCapitalizer`) / tracked-inventory → 1200 (or category inventory acct) / expense → 5100.
  If the linked PO was already GRNI-received: **DR 2050 GRNI** (clears the liability) and does **not**
  re-record the stock movement (avoids double count). Else: **DR inventory** + `recordReceiptMovement()`
  per line after posting. Deductible-VAT split (`splitDeductibleVat()`) — non-deductible input VAT is
  capitalised into the expense line. **CR 2000 Accounts Payable** for `bill.total`.

Stock increases at the earlier of PO-receipt or bill-posting, at the source line's **ex-VAT unit
price**, only after the GL entry posts. **No purchase-return / supplier-credit-note path exists.**

---

## 6. EXISTING SALE-TO-COGS BEHAVIOUR

**`invoiceService.postInvoice(id)`** (only a `draft` invoice; `markInvoiceAsSent()` delegates here —
no ledger-skipping path):

```
DR  1100 Accounts Receivable        invoice.total
CR  <revenue acct per category, or 4000>   bucketed to invoice.subtotal
CR  2100 VAT Output                  invoice.taxTotal            (if > 0)
    -- for every line with a productId, if totalCogs > 0:
DR  <COGS acct per category, or 5000>       bucketed COGS (current WAC / FIFO preview, roundToCents)
CR  <inventory acct per category, or 1200>  bucketed COGS
```

Posts the entry, **then** `recordSaleMovement()` per inventory line via `Promise.all` (negative `sale`
movement; FIFO `consumeFifoLots()`). Status → `sent`, `journalEntryId` stored.

- **Silent no-op if no default warehouse resolves** — the AR/Revenue/COGS journal posts but stock is
  never reduced and `calculateCogs` returns 0 for FIFO. Revenue booked, inventory untouched, no error
  surfaced. Tests even assert this behaviour.

---

## 7. EXISTING CREDIT-NOTE BEHAVIOUR

**`creditNoteService.issueCreditNote(id)`** (only a `draft`):

```
DR  <revenue acct per category, or 4000>   bucketed to creditNote.subtotal   -- reuses Sales Revenue;
DR  2100 VAT Output                 creditNote.taxTotal          (if > 0)      -- NO Sales Returns contra acct
CR  1100 Accounts Receivable        creditNote.total
    -- ONLY IF creditNote.reason === 'return' AND totalCogs > 0:
DR  <inventory acct per category, or 1200>  bucketed COGS reversal (current WAC / FIFO preview)
CR  <COGS acct per category, or 5000>       bucketed COGS reversal
```

Then `recordReturnMovement()` per return line after posting (`sales_return`, positive; WAC unchanged;
FIFO new lot at `cogsByLine[i] / qty`). Non-return reasons (`pricing_error` / `discount` / `other`) =
value adjustment only, no stock/COGS leg.

- **No bound** that returned quantity ≤ originally invoiced quantity — over-return over-restores stock
  and over-reverses COGS.
- COGS reversal at **current** WAC (can differ materially from the original sale COGS).

---

## 8. EXISTING STOCK ADJUSTMENT BEHAVIOUR

`StockAdjustmentForm` (modes: `adjustment` / `opening`) → `stockService.adjustStock()` /
`recordOpeningStock()` → `recordStockMovement()` only.

- **NO GL entry is posted.** `adjustStock` / `transferStock` / `recordOpeningStock` touch only the
  movement ledger and the `quantity_on_hand` cache. Nothing calls a posting service.
- **NO manager sign-off / approval.** The only control is a mandatory free-text `reason` (preset list:
  Write-off / Damage / Shrinkage / Stock take variance / Other + free text).
- **Consequence:** a write-off / shrinkage / count correction moves quantity and therefore the
  computed valuation, but leaves GL 1200 and any variance expense untouched → **guaranteed
  subledger ↔ GL divergence** by the adjustment amount. `accountingIntegrityAuditService` only flags
  this as a **WARNING** (not FAIL), and that service is not wired to any route.
- `transferStock` posts no GL — acceptable (same-entity inter-warehouse move, no per-warehouse GL).
- `recordOpeningStock` posts no GL. The Office National opening position was a **hand-seeded SQL**
  journal (JE-0001, `DR 1200 R1,487,450` single line) — there is no in-app opening-inventory workflow.
- All of the above **contradicts `docs/INVENTORY_DOMAIN.md`** ("Approved Stock Adjustments",
  "generate corresponding General Ledger entries").

---

## 9. EXISTING IMPORTS

**Exactly ONE file-import path in the entire application: bank statement import.**

- `src/features/banking/utils/statementParsers.ts` + `statementImportService.ts` +
  `useStatementImport.ts` + `StatementImportWizard.tsx`. Accepts CSV, OFX/QFX, QIF, MT940 (**real
  syntax parsing** for all four — not a filename check). Format detected from file extension + manual
  override.
- CSV column mapping is **heuristic only** (case-insensitive substring header match) — no mapping UI,
  no saved templates. OFX/QIF/MT940 have fixed tags.
- Validation is **row-level, continue-on-error** (`parseErrors[]`, non-blocking).
- **Strong duplicate detection** — order-independent SHA-256 content hash; blocks Confirm on an exact
  match until "Import anyway" is ticked.
- **Structurally cannot post GL** — the service is constructed with only the two statement repos;
  persists `bank_statements` + `bank_statement_lines` only.
- **No reusable import framework** — entirely bespoke to statements. No `papaparse`. No shared CSV
  utility (the tokeniser is a private function).
- **No customer / supplier / product / opening-stock / price-list import** anywhere.
- **No Excel (`.xls` / `.xlsx`)** support anywhere — not even in the statement importer. No `xlsx` /
  `sheetjs` / `exceljs` dependency.

---

## 10. EXISTING PRINTING / REPORT SUPPORT

- **"This app has no document-generation capability anywhere" — VERIFIED TRUE.** No PDF library, no
  `react-to-print`, **zero `window.print()`**, **zero `@media print` / `@page` / Tailwind `print:`
  utilities**. No invoice PDF, no customer statement, no report print view, no GRN / packing slip /
  delivery note. Every document exists as data + on-screen tables only.
- **No export anywhere** — zero `new Blob` / `URL.createObjectURL` / `<a download>` / `toCSV` in
  `src`. The only artefact is a **hard-disabled** "Export statement (PDF)" placeholder on
  `CustomerDetailPage`.
- **Reports module** (`src/features/reports/`): `/reports` hub (a plain nav list), Income Statement,
  Balance Sheet, Cash Flow, AR Aging, AP Aging. All screen-only React (`SectionCard` + `StatementRow`
  / `AgingReportTable`). **No export or print on any report.** No inventory report of any kind.
- The shared `PageHeader` `actions` slot (currently holding only date/FY controls) is the natural
  insertion point for future Export / Print buttons — a capability that would serve the whole app.
- Missing dependencies (all new): `papaparse`, `xlsx` (SheetJS), `jspdf` / `jspdf-autotable` (if true
  PDF wanted), `file-saver`.

### Difference Investigator (`src/features/reconciliationIntelligence/`)

- Orchestrator `reconciliationInvestigatorService.investigate(...)` — returns immediately (fabricates
  nothing) when the variance is exactly 0; builds bank-side / books-side candidate pools; runs
  **detectors as plain functions in a hard-coded priority array** (no registry — adding one = import
  + one array line + a new `ReconciliationIssueType`); each detector uses shared `buildEvidence()`
  (confidence = Σ weighted named factors, clamped 0-100) and returns `ReconciliationIssueDraft[]`;
  orchestrator stamps `dedupeKey`, supersedes stale *open* issues, persists, ranks, slots into 5 UI
  sections. Structured `ReconciliationEvidenceData` names specific records
  (`candidateSourceType`/`candidateSourceId`, related-id arrays).
- **Books Integrity** (`booksIntegrity/checks.ts`) — a simpler checklist: pure functions each
  returning `{ key, label, status, detail }`, composed by `runBooksIntegrityCheck.ts` from a
  `BooksIntegrityInput` bag that any module can feed. `subledgerReconciliation.ts` (in `accounting`)
  is the reusable GL-vs-subledger engine — **AR and AP only**. **No inventory reconciliation exists.**

---

## 11. MISSING RELATIONSHIPS / TABLES

| Need | Present? |
|---|---|
| Per-(product, warehouse) stock balance | **NO table.** `stock_movements` summed in JS is the only per-warehouse truth; `products.quantity_on_hand` is one company-wide scalar. |
| `stock_movements` → source document (`type` / `id` / `line_id`) | **NO.** Free-text `reference` only — cannot join a movement to the invoice/bill line that caused it; cannot detect a line edited after posting; cannot cascade a document void. |
| `stock_movements.unit_cost` / `total_cost` | **NO.** WAC is not reconstructable from history. |
| Product ↔ preferred supplier / supplier item code / supplier price | **NO.** No `preferred_supplier_id`, no `product_suppliers` junction. |
| Product category as an entity | **NO.** Free text on both `products.category` and `category_account_mappings.category_name`, joined by string equality. `Delivery & Service` (2 products) has no mapping row. |
| Stock take (`stock_takes` + `stock_take_lines` + variance) | **NO tables** — only the `adjustment` enum value. |
| Inventory adjustment as a document (header, approval, reason codes, GL link) | **NO table.** |
| Warehouse transfer as a document (in-transit, receiving confirmation) | **NO table** — only `transfer_in`/`transfer_out` enum values; **zero transfer rows exist.** |
| Opening-stock batch / document + link to opening JE | **NO.** `opening` movements exist (48 rows) but no batch entity and no GL posting. |
| FK from document lines to products | **NO** — lines are unvalidated jsonb. |
| One-default-warehouse-per-company constraint | **NO** (no partial unique index `WHERE is_default`). |
| UOM table / purchase↔stock↔sales UOM conversion | **NO** — `products.uom` is free text. |
| `stock_lots` persistence | **NO table** (mock only). |
| `reconcileInventory()` subledger↔GL function | **NO** — only a WARNING-level, WAC-only audit check. |

---

## 12. DUPLICATE / OBSOLETE INVENTORY CODE

- **Fixed Assets ↔ Inventory: NOT entangled.** Zero cross-imports between `src/features/assets/` and
  `src/features/inventory/` — only "we copied the pattern" doc comments.
  `DocumentLineItem.fixedAssetDetails` is asset-only and mutually exclusive with `productId`, routed
  by a separate `FixedAssetCapitalizer` vs `InventoryReceiver` in `billService`. Move (c) — stripping
  Products/Warehouses out of the "Assets & Inventory" nav group — is **purely cosmetic, zero code
  risk**.
- **No `inventory_products` duplicate** — `products` is the single canonical entity. Good.
- `MockStockLotRepository` is wired as the live instance (`instances.ts:23`) — should become
  `SupabaseStockLotRepository` once a table exists (if FIFO stays in scope).
- Stale/wrong docs: `docs/INVENTORY_DOMAIN.md:7` (accounts 1400/5500), `docs/ACCOUNTING_DOMAIN.md:12-13`
  (AR/AP/VAT codes), `stockService.ts:244-246` comment.
- `sectionForPath()` in `navigation.ts` — exported but unused (0 consumers).
- `bankTransactionService.importStatementLines` / `findMatchesForLine` + their tests — dead code left
  after the P3 wizard rewrite.
- `stock_movements.updated_at` — dead column (append-only).
- `getQuantityAvailable()` formula is present but `committed` / `onOrder` are hardcoded `0`.
- Unversioned `cost_price` `numeric(14,2) → (14,4)` schema change — no migration file records it.
- Pre-existing failing test: `MockSupplierRepository.test.ts` AP delete-guard (fails in isolation;
  unrelated but Purchases/GRNI touch inventory).
- Doc drift: live has 171 JEs / 33 active accounts vs docs' 170 / 32 (books still tie to R0.00 —
  likely lag from JE-4100 delete+recreate and JE-0171 contamination cleanup).

---

## 13. PROPOSED TARGET ARCHITECTURE

### 13.1 Non-negotiable principles (from `SA_ACCOUNTING_MASTER_SPEC.md` + this audit)

1. `stock_movements` stays the single **append-only** quantity ledger and the **source of truth**.
2. Every movement carries its **own historical `unit_cost`** → WAC becomes reconstructable from the
   ledger (kills the drift class) and COGS is auditable.
3. Every movement carries **structured source-document linkage**.
4. Posted accounting records are immutable; corrections are new events (`reverseJournalEntry`,
   adjustment reversal, supplier return) — never edits.
5. No hardcoded account UUIDs or codes in new services — resolve through `AccountMapper` (new
   `AccountMappingKey`s) and the category resolver.
6. **Importing data never posts GL.** Opening stock is the sole accounting-significant import and has
   its own explicit preview-and-confirm posting step.
7. Every demo-data change to the shared DB is reviewed SQL / migration only — never the service layer.

### 13.2 Domain model

- **Product** — extend with: `sales_description`, `purchase_description`, `preferred_supplier_id`,
  `supplier_item_code`, `reorder_quantity`, `preferred_stock_level`, optional per-product account
  overrides (`sales_account_id` / `inventory_account_id` / `cogs_account_id` / `purchase_account_id`,
  all nullable → fall back to category → generic key). `valuation_method` becomes `NOT NULL DEFAULT
  'weighted_average'`. `quantity_on_hand` is explicitly re-labelled a **derived cache** (kept for
  read performance; the ledger and the per-location balance are authoritative).
- **ProductCategory** — a real entity (`product_categories`): `name`, `description`,
  `revenue_account_id`, `cogs_account_id`, `inventory_account_id`, `adjustment_account_id`,
  `default_tax_rate_id`. Migration path: create one row per distinct `products.category` string, add
  `products.category_id`, **keep `products.category` text during transition** (dual-write), migrate
  the 5 `category_account_mappings` rows in, then treat that table as superseded.
- **Warehouse / StockLocation** — keep `warehouses`; add a partial unique index for one default;
  `address`/`notes` already supported (jsonb). Multi-location is expressed through the per-location
  balance, not new warehouse machinery. No WMS features.
- **StockMovement** — add `unit_cost numeric(14,4)`, `total_cost numeric(14,2)`,
  `source_document_type text`, `source_document_id uuid`, `source_document_line_id uuid`,
  `movement_date date`, `created_by text`, `reversal_of_movement_id uuid?`. New enum values:
  `purchase_return`, `write_off`, `stock_gain`, `stock_take`, `correction`. Stays INSERT+SELECT RLS;
  add an append-only trigger (see 13.6 fork).
- **StockBalance** (`stock_balances`) — `(product_id, warehouse_id)` unique, `quantity_on_hand`,
  `quantity_committed`, `quantity_on_order`, `updated_at`. Maintained alongside the ledger, reconciled
  by an invariant test. (Or: always-derived — see fork D.)
- **New document entities** — persistent header plus normalized line tables; JSONB is supplementary
  metadata only and is never canonical document detail:
  - `stock_adjustments` + `stock_adjustment_lines` — write-off / shrinkage / gain. Draft → optional
    approval → post (GL entry) → immutable. Reason mandatory; lines retain product, location,
    quantity delta, frozen unit cost and total value.
  - `stock_transfers` + `stock_transfer_lines` — warehouse A→B. Lines retain product, quantity,
    source/destination and frozen cost/value evidence. An immediate transfer is GL-neutral; only the
    real `draft → in_transit → completed` lifecycle uses Inventory in Transit.
  - `stock_takes` + `stock_take_lines` — `draft → counting → ready_for_review → posted` (or cancel
    before posting). Freeze permanently stores expected quantity and WAC on each line; counting and
    review add counted quantity, variance, variance value and reason. Posting generates movements and
    one balanced GL adjustment. Posted records are immutable.
  - `opening_stock_batches` + `opening_stock_batch_lines` — effective date plus per-product/location
    quantity, unit cost and value. Import populates a draft only; **preview accounting effect** →
    explicit confirmation → post.
  - `supplier_returns` + `supplier_return_lines` — reverse stock plus Inventory/GRNI or AP and input
    VAT. Each line retains product/location, quantity, carried cost/value, reason and the originating
    purchase/receipt line when available.

Every line has its own UUID and `company_id`. Structural tenancy uses a composite header key
`(company_id, id)` and composite line FK `(company_id, <header_id>)`; product and warehouse
relationships are likewise company-consistent where the schema exposes composite company keys.
Quantities must be positive for transfer/opening/return lines; adjustment deltas must be non-zero;
costs and values must be non-negative; one product may appear only once per document/location where
the workflow requires an unambiguous posting line. Each header FK, product FK, warehouse FK and
source-line lookup is indexed. RLS repeats the header tenancy rule on every line table.

Draft line CRUD and draft-header deletion are allowed through the service boundary. Header deletion
may remove its draft lines, but **posted/confirmed financial documents and their lines are never
updated or deleted**. Corrections are new reversal/correction documents and movements. Phase 3 must
install/verify the database immutability control before enabling real posting; no delete cascade may
be treated as authority to erase posted evidence.

### 13.3 Accounting integration

- New GL account: **`5050 Inventory Adjustments`** (expense) — takes both write-off (DR) and gain
  (CR) signs; resolved via a new `INVENTORY_ADJUSTMENT` `AccountMappingKey`. Optionally a distinct
  `4060 Inventory Gains` if the user wants gains shown as income (fork).
- Wire `purchaseOrderService` to `CategoryAccountMappingService` so GRN receipts can post to
  category-specific inventory accounts (today always generic 1200).
- Adjustment / stock-take / opening-stock posting all go through a single atomic, idempotent posting
  boundary that writes the GL entry, stock movements, balances and final document status together;
  no partial GL-first or stock-first success is permitted. Use `bucketByAccount` for category splits
  and the normalized line UUID as movement source evidence.
- Costing: one authoritative model (fork A). WAC formula frozen; every receipt/return records its
  `unit_cost` on the movement; a `recomputeWeightedAverageFromLedger(productId)` helper makes WAC
  self-healing and is the basis of the Phase 21.1 restatement (now with a test).
- Precision house rule: cost 4 dp, quantity 3 dp, **all GL postings and all valuation-report figures
  computed the same way** (`roundToCents` per line, bucketed). `calculateValuation` /
  `calculateInventoryTotals` re-implemented to match the GL.
- Concurrency: replace `Promise.all` per-line fan-out in the four posting services with **sequential
  per-product processing** so WAC / FIFO lot consumption cannot race.

### 13.4 Import / export / print infrastructure

- **Generic import framework** (`src/lib/import/` + `src/features/imports/`): register per-target
  `{ schema, headerAliases, validateRow, detectDuplicate, commit }`. Wizard: select type → upload →
  select worksheet (Excel) → preview → map columns (with auto-recognition) → validate (row-level,
  continue-on-error, downloadable error report) → detect duplicates → confirm → commit → results.
  CSV via `papaparse`; XLSX/XLS via `xlsx` (SheetJS) — **real parsing**. **No target commits GL.**
  Targets: products, customers, suppliers, price lists, stock counts (→ stock take), opening stock
  (→ opening-stock batch, which owns the posting confirmation).
- **Export / print** (`src/lib/export/` + a `PrintableReport` / `ReportShell` component): real CSV,
  real XLSX (SheetJS). Print via a dedicated `@media print` layout + `window.print()` (fork E) with
  company name/logo, report name, date range, filters, generated date, page-friendly tables, totals,
  page breaks. `jspdf`/`jspdf-autotable` optional for true PDF download. The `PageHeader` `actions`
  slot is the shared insertion point — Customers, Suppliers, and all Reports get printable views too.

### 13.5 Navigation / IA / UI

- **navigation.ts only** (3 edits): (a) add `{ title: 'Inventory', href: '/inventory' }` to the
  Organisation group after Suppliers; (b) insert a new **"Inventory" operational group** between
  "Purchases & Expenses" and "Accounting" (Overview / Products / Warehouses / Stock Adjustments /
  Transfers / Stock Takes / Import / Reports); (c) remove Products & Warehouses from "Assets &
  Inventory" and rename it **"Fixed Assets"**. Add `'/inventory': { feature: 'inventory', action:
  'read' }` to `permissionRouteMap.ts`.
- New pages: `/inventory` (`InventoryOverviewPage` — summary cards + main table: SKU / Product /
  Category / Supplier / On Hand / Available / Committed / Reorder / Avg Cost / Value / Margin /
  Status), **`/inventory/products/:productId`** (tabbed item detail — **full-page route**, shipped
  2026-09-03 as `InventoryItemDetailPage` + `InventoryItemDetail`: Overview / Stock / Purchasing /
  Sales / Transactions / Accounting / Documents / Activity), `/inventory/adjustments`,
  `/inventory/transfers`, `/inventory/stock-takes`, `/inventory/import`, `/inventory/reports`.
- All on the Vertex Form System + `DataTable` + `FigureBlock`/`Amount` + `SectionCard`. The item
  detail is a **full page** (`src/components/app/record-page/` — `RecordPageShell` / `RecordPageHeader`
  / `RecordActionBar` / `DocumentLineTable`), not a `RecordDetailSheet`. Green active state and
  light/dark theming are automatic once routes exist. Item detail tabs use the shared `Tabs`
  (`variant="line"`).
- **Transactions tab — movement ledger (2026-09-03, increment 3):** each row's **Source document**
  cell is resolved from the structured `source_document_type` / `source_document_id` to the real
  human number (INV-1072, BILL-2031, CN-1007, TRF-0012, ADJ-0015, ST-0004, OPEN-0001, SRET-0001) by
  `resolveSourceDocument()` (`src/components/app/record-page/sourceDocument.ts`) — `isOpaqueReference()`
  rejects the September seed's machine `"<type>:<uuid>"` reference and bare UUIDs, so a UUID is
  **never** the primary label (raw ids stay under "Technical details"). Clicking the number opens
  `<RelatedRecordPreview>` — the existing document `*DetailPage` in a large overlay OVER the product
  page (no navigation, no second renderer) — with a real `href` kept for middle-click. Each row
  expands to **Movement / Source / Accounting / Technical details**; the Accounting block shows the
  linked journal entry + JE number, the Inventory GL (1200), the contra account by movement type
  (5000 COGS · 2050 GRNI→AP · 5060 PPV · 5050 Adjustments · 1210 In Transit · 3950 OBE), a
  plain-English relationship line, and the engine posting key. Presentation only — no engine change.

### 13.6 Permissions / audit / reconciliation / tests

- **Permissions** (migration): new `inventory:` actions — `adjust`, `stocktake_post`, `cost_edit`,
  `opening_stock`, `account_map`, `import`. Seed approved `role_permissions` defaults. UI gates improve
  navigation, but financially significant service commands must also authorize the action; UI-only
  authorization is not sufficient. RLS independently enforces company tenancy without redesigning
  the application-wide authorization framework in Phase 2.
- **Audit** — new `AuditAction` values (`stock_adjusted`, `stock_written_off`, `opening_stock_set`,
  `cost_price_changed`, `stock_take_posted`, `inventory_account_mapping_changed`,
  `stock_import_committed`) — the column is `text`, **no migration needed**. Inject `auditLogService`
  into the new services; `previousValue`/`newValue` on cost/qty deltas; mandatory `reason` on
  adjustments/write-offs.
- **Reconciliation (superseded plan)** — Phase 3, not Phase 14, adds `reconcileInventory()` to
  `subledgerReconciliation.ts` beside the real posting paths. It returns exact differences between
  summed stock movements, `stock_balances`, exposed on-hand cache, WAC valuation, Inventory Asset GL,
  and Inventory in Transit GL where applicable, with per-warehouse and reconciling-item evidence.
  Phase 14 consumes that engine in the Difference Investigator/evidence UI. Add
  `checkInventorySubledgerIntegrity`,
  `checkStockLedgerConsistency`, `checkOrphanedInventoryMovements`, `checkInvoiceLineWithoutCogs` to
  `booksIntegrity/checks.ts`, wired behind `if (products.length > 0)`. Difference Investigator gets a
  `ReconciliationIssueType` + detector only for the *ranked/evidence-scored* inventory findings
  (needs the bank-coupled pipeline genericised first — deferred / optional).
- **Tests** (Phase 13) — a dedicated inventory-invariants suite against Mock/fixture data (qty = Σ
  movements; valuation = costing calc; subledger ↔ GL; sale reduces stock once; sale posts COGS once;
  return restores correctly; receipt increases once; purchase return reverses; adjustment creates
  correct movement; posted stock take creates correct adjustment; transfer is company-value-neutral;
  imports never post GL; duplicate imports safe; XLS/XLSX parsed; tenant isolation; posted records
  immutable; source traceability; precision; **Office National books remain balanced**). Live SQL
  stays a read-only regression oracle.

### 13.7 Office National demo expansion (Phase 12)

Reviewed seed SQL / migration only, applied via MCP after Review 7. Adds categories, more products
(office chairs, printers, paper, pens, toner, filing supplies, desk accessories), multiple suppliers,
bulk customers, purchase activity, daily sales, returns, ≥1 adjustment, ≥1 posted stock take,
low-stock + out-of-stock items. Every change proven to preserve: global Σdr = Σcr, the 12 bank-recon
training faults, the AR/AP bridges, and **GL 1200 = valuation to R0.00**.

---

## 14. PROPOSED MIGRATIONS (all additive; applied only after Review 2)

| # | Migration | Content | Risk |
|---|---|---|---|
| M1 | `stock_movements` columns | `unit_cost`, `total_cost`, `source_document_type/_id/_line_id`, `movement_date`, `created_by`, `reversal_of_movement_id`; new enum values (`purchase_return`, `write_off`, `stock_gain`, `stock_take`, `correction`); composite indexes `(product_id, warehouse_id)`, `(product_id, movement_date)`. Backfill: `movement_date` ← `created_at::date`; `unit_cost` ← best-effort from linked bill/invoice line via `reference`, else NULL for pre-migration rows (documented); `source_*` ← parsed from `reference` where resolvable. **No posted JE changes.** | Low — additive; backfill is lossy but changes no accounting figure. |
| M2 | `product_categories` | New table (+ account-mapping columns). Seed from distinct `products.category`. Add `products.category_id` (nullable, FK). Migrate `category_account_mappings` rows in. Keep `products.category` text. | Medium — must not break the 5 live mapping rows used by posting; dual-write during transition. |
| M3 | `products` columns | `sales_description`, `purchase_description`, `preferred_supplier_id` (FK suppliers), `supplier_item_code`, `reorder_quantity`, `preferred_stock_level`, nullable per-product account overrides. `valuation_method` → `NOT NULL DEFAULT 'weighted_average'` (backfill NULLs first). Formalise `cost_price numeric(14,4)` in a real migration (documents the drift). | Low. |
| M4 | `stock_balances` | `(product_id, warehouse_id)` unique; `quantity_on_hand`, `quantity_committed`, `quantity_on_order`. Backfill from the ledger. | Low (fork D). |
| M5 | `stock_adjustments` + `stock_adjustment_lines` | draft→posted lifecycle, reason/approval/JE header; normalized product/location/delta/cost/value lines. | Low. |
| M6 | `stock_transfers` + `stock_transfer_lines` | from/to warehouse, optional in-transit lifecycle; normalized quantity and frozen-cost evidence. | Low. |
| M7 | `stock_takes` + `stock_take_lines` | status lifecycle, frozen expected-quantity/WAC snapshot, counted quantity, variance/value, JE and approval evidence. | Low. |
| M8 | `opening_stock_batches` + `opening_stock_batch_lines` | `effective_date`, status, JE header; normalized product/location/quantity/cost/value lines. | Low. |
| M9 | `stock_lots` + `SupabaseStockLotRepository` | real FIFO persistence — **only if fork A keeps FIFO in scope**. | Low. |
| M10 | `supplier_returns` + `supplier_return_lines` | purchase-return header plus normalized product/location/quantity/cost/value/source-line evidence. | Low. |
| M11 | GL accounts seed | `5050 Inventory Adjustments` (+ optional `4060 Inventory Gains`, `1210 Inventory in Transit`) — per company. | Low. |
| M12 | Permissions seed | new `inventory:` actions + `role_permissions` grants for the 6 system roles. | Low. |
| M13 | (optional, security) | append-only trigger on `stock_movements`; role-aware RLS for inventory-sensitive tables. | Medium — **fork F**, flag as a separate decision. |
| M14 | Office National demo expansion | reviewed seed SQL (Phase 12). | High — proven-neutral or not applied. |
| M15 | (housekeeping) | adopt `supabase/migrations/` and backfill 0000–0020 from the DB for traceability. | Low (fork G). |

All: `{authenticated}` RLS, `company_id = get_my_company_id()`, additive columns only (the sole
existing-column changes are `valuation_method` NOT NULL/DEFAULT and the formalised `cost_price`
scale). Applied via MCP `apply_migration`, audited with `get_advisors` after each.

---

## 15. RISKS TO EXISTING ACCOUNTING DATA

1. **The GL 1200 = valuation tie is fragile** — it holds only because Phase 21.1 hand-restated WAC in
   SQL. Any change to how `cost_price` / COGS is derived re-opens it. *Mitigation:* freeze the costing
   formula; add `unit_cost` to movements so WAC is reconstructable; a read-only regression test proves
   the live figure does not move.
2. **Backfilling `stock_movements.unit_cost` on 284 existing rows is inherently lossy** — the
   historical per-unit cost was never recorded. Plan: reconstruct from linked bill/invoice lines via
   `reference` where resolvable, leave NULL otherwise, document it. **Changes no posted journal
   entry.**
3. **`Promise.all` per-line races already corrupt WAC** on multi-line same-product documents in the
   live app — a latent bug to fix early, not introduced by this work.
4. **Posted-record immutability** — every new document entity must follow draft→post→reverse; posted
   stock takes / adjustments must not be editable; corrections via reversal only.
5. **Office National contamination** — every demo change is reviewed SQL/migration only, never the
   service layer (the JE-0171 incident is the exact failure mode). Proven to preserve the 12 recon
   training faults, the AR/AP bridges, the R0.00 inventory tie, and global Σdr = Σcr.
6. **Category migration** — moving `products.category` free-text → relational must not break existing
   products or the 5 seeded `category_account_mappings` rows used by live posting. Keep the text
   column; dual-write during transition.
7. **Opening-stock import must never auto-post** — explicit preview of the journal + user confirmation.
8. **RLS is coarse (`profiles.role` + `company_id` only)** — the new inventory tables use the same
   coarse company-tenant RLS as every other module (invoices, bills, purchase orders). The new
   `inventory:*` permissions gate the **UI / service layer** only (`useCanAccess`). Structural
   cross-tenant protection on document lines is provided by composite `(company_id, id)` FKs, not RLS.
   An **application-wide** role-aware DB-authorization phase is tracked separately in
   `docs/CURRENT_TASKS.md` — it was **not** approved as part of this initiative (see the Review 2C
   Hybrid decision below).
9. **`purchaseOrderService` not wired to category mappings** — fixing this changes which account new
   GRN receipts hit (not historical postings).
10. **No `supabase/migrations/` folder** — history lives only in the DB; low-risk to backfill, high
    traceability value (M15).
11. **Doc drift** (171 vs 170 JEs; 33 vs 32 active accounts) — reconcile before relying on doc figures
    as invariant baselines.

---

## ARCHITECTURE FORKS — ALL 7 APPROVED AS RECOMMENDED (user, 2026-08-30)

Proceeding to Phase 1 + Phase 2 on the recommended option for every fork. Recorded verbatim below;
implementation notes: (A) FIFO code left untouched, no `stock_lots` table, `valuation_method` enum
kept, WAC is authoritative and made ledger-reconstructable. (C) `products.preferred_supplier_id` +
`supplier_item_code`, no junction. (E) print = `@media print` + `window.print()`; export = real
CSV + real XLSX (SheetJS); no PDF library. (F) new `inventory:*` permissions gate UI only, RLS stays
coarse. (G) `supabase/migrations/` folder adopted + 0000–0020 backfilled from the live DB.

| # | Fork | Options | Recommendation |
|---|---|---|---|
| **A** | Costing model scope | (a) WAC authoritative + FIFO as a real persisted feature; (b) WAC authoritative + FIFO parked (no `stock_lots` table this initiative); (c) WAC only, remove FIFO code | **(b)** — make WAC bulletproof and ledger-reconstructable now; build real FIFO only if explicitly wanted. Master spec: "one authoritative costing model." |
| **B** | `products.category` → relational | (a) promote to `product_categories` entity now (safe dual-write migration); (b) keep free-text + extend `category_account_mappings` | **(a)** — the brief explicitly asks for a proper category entity with account mappings. |
| **C** | Supplier link | (a) single `preferred_supplier_id` + `supplier_item_code` on `products`; (b) `product_suppliers` junction (multi-supplier, per-supplier price/lead-time) | **(a)** for v1 (brief wording is singular); junction later if needed. |
| **D** | Per-warehouse balances | (a) always-derived from the ledger; (b) `stock_balances` cache table maintained with the ledger + reconciliation test | **(b)** — a real inventory subsystem needs list performance; ledger stays authoritative. |
| **E** | Print / PDF strategy | (a) `@media print` + dedicated print routes + `window.print()`, plus real CSV/XLSX export (SheetJS) — no PDF lib; (b) also add `jspdf`/`jspdf-autotable` for true PDF downloads | **(a)** for v1; PDF is additive later. XLSX via SheetJS is non-negotiable ("do not fake Excel export"). |
| **F** | Inventory RLS / security | (a) new `inventory:*` permissions gate UI/service only, DB RLS stays coarse company-tenant (consistent with the rest of the app); a later dedicated phase adds role-aware RLS application-wide | (b) build role-aware DB RLS for inventory now | **(a)** — approved at Review 1 and **re-confirmed at Review 2C**. Fork F was never superseded. |
| **G** | `supabase/migrations/` folder | (a) adopt it and backfill 0000–0020 from the DB; (b) continue DB-only history | **(a)** — small housekeeping task, big traceability win. |

---

## REVIEW 1 CHECKPOINT SUMMARY

- **Files added:** `docs/INVENTORY_ARCHITECTURE.md` (this file).
- **Files modified:** `docs/CURRENT_TASKS.md` (new phase section).
- **Migrations:** none. **Schema changes:** none. **Code changes:** none.
- **Tests added:** none. **Test totals:** unchanged (~1290 / 183 files per the P3 gate).
- **Accounting invariants verified (read-only, live):** global Σdr = Σcr R4,838,209.61 (diff R0.00);
  171 posted JEs, 0 unbalanced; trial balance R3,076,605.94/side (diff R0.00); GL 1000 R212,270.67;
  GL 1100 R207,794.04; **GL 1200 R1,569,743.20 = round(Σ qoh × cost_price, 2), diff R0.00**;
  GL 2000 R590,511.21; VAT net −R67,878.12; Σ `stock_movements.quantity_delta` per product =
  `quantity_on_hand` (0 drift, 0 negative).
- **GL / subledger reconciliation:** inventory subledger ↔ GL currently ties to R0.00 **only because
  of the Phase 21.1 SQL restatement**; there is no `reconcileInventory()` and no regression test.
- **Known issues surfaced:** see §12 and §15 — chiefly: adjustments/stock-takes/opening-stock post no
  GL and have no approval; no variance GL account; no cost/source on movements; FIFO non-functional;
  `Promise.all` WAC race; no import/export/print infrastructure; stale account codes in
  `docs/INVENTORY_DOMAIN.md`.
- **Screenshots / browser checks:** none — no browser tooling in this environment (unchanged from P3).
- **Proposed next action:** user reviews this audit + the 7 architecture forks above. On approval,
  proceed to **Phase 1 (navigation / IA)** and **Phase 2 (domain model + migrations)** → **STOP for
  Review 2** before any `apply_migration`.

**REVIEW 1 — approved by user 2026-08-30: "go ahead with all recommendations, proceed to Phase 1
and 2".**

---

# PHASE 1 — NAVIGATION / IA (done, part of the Review 2 batch)

- `src/lib/app/navigation.ts`: (a) `Inventory` quick-access item added to the **Organisation** group
  after Suppliers (`/inventory`, `BoxesIcon`); (b) new **Inventory** operational group inserted
  between "Purchases & Expenses" and "Accounting" (Overview / Products / Warehouses — more items as
  later phases ship their pages); (c) `"Assets & Inventory"` group split — Products/Warehouses removed,
  renamed **"Fixed Assets"** (fixed assets only), and the two Lease items moved to their own **"Leases"**
  group (makes the rename honest; `docs/ROUTES.md` already labelled them "Leases").
- `src/features/auth/permissionRouteMap.ts`: `'/inventory' → { feature: 'inventory', action: 'read' }`.
- `src/app/router.tsx`: new `inventory` route → new `InventoryOverviewPage`
  (`src/features/inventory/pages/InventoryOverviewPage.tsx`) — a lean module home: summary strip
  (inventory value / items in stock / low stock / out of stock) over the same pure
  `calculateInventoryTotals` rollup the Products page uses, the reusable `LowStockAlertWidget`, and
  links to the sub-pages that exist today. The substantial module table + tabbed item detail are
  Phase 4.
- `docs/ROUTES.md` updated. Desktop / collapsed-rail / mobile nav all work with no `app-sidebar.tsx`
  change (it is fully data-driven); green active state is automatic (`data-[active]:text-brand` etc.).
- **Gate:** type-check ✅ · lint ✅ · **1290 tests** ✅ · `vite build` ✅.

# PHASE 2 — DOMAIN MODEL + MIGRATIONS (Review 2C Hybrid)

> **STATUS 2026-08-30: migrations 0021–0030 APPLIED to the live Supabase project** under the user's
> controlled per-migration procedure after Review 2C approval. Recorded versions
> `20260830155625` … `20260830160120`. Zero accounting data changed (4 byte-level MD5 hashes
> identical before/after); ledger ↔ stock_balances ↔ products.quantity_on_hand reconcile to 0.000;
> advisors 0 ERROR. Full per-migration verification + the 25-point Review 3A report are in
> `docs/CURRENT_TASKS.md` → "MIGRATIONS APPLIED — 2026-08-30 (Review 3A gate)".


## Review 2C Hybrid decision (user, 2026-08-30)

Codex's Review-2B pass introduced valuable normalization plus scope the user had **not** approved and
edited this doc to imply Fork F was superseded. **It was not.** The user chose **Option C (Hybrid)**:

| Element | Decision |
|---|---|
| Normalized header + line tables (5 pairs, no embedded JSON) | **KEEP** — permanent; JSON canonical lines rejected |
| Composite `(company_id, id)` candidate keys + composite FKs (cross-tenant line protection) | **KEEP** — but only where an actual composite FK consumes the key; each audited |
| Inventory-only role-aware RLS via `user_has_permission()` | **REVERTED** — coarse company-tenant RLS only, consistent with the rest of the app; policy lives in each table's own migration |
| Computed-formula CHECK constraints (`cost_effect = round(...)`, `total = subtotal + tax_total`, …) | **REMOVED** — one authoritative calculation contract lives in the service layer; proven by tests |
| Structural CHECKs (`line_number > 0`, `quantity <> 0`, `from <> to`, non-negative bounds, status enums, uniqueness) | **KEEP** |
| `user_has_permission()` SECURITY DEFINER function | **REMOVED** — not deployed (no current requirement); design preserved for the later phase |
| Timestamped reproducible migration filenames + enum-only 0021 + migration-order tests | **KEEP** (Codex fix approved) |
| `reconcileInventory()` → Phase 3; Difference Investigator → Phase 14 | **KEEP** (Codex fix approved) |

A dedicated **APPLICATION-WIDE ROLE-AWARE DATABASE AUTHORIZATION** phase is tracked in
`docs/CURRENT_TASKS.md` — it must be designed for the whole app (inventory, invoices, purchases,
banking, journals, VAT, customers, suppliers, reports, admin) with `user_roles` population, admin/
staff mapping, backward compatibility, rollout, tests and lockout prevention — never as two
incompatible security models.

**`supabase/migrations/` adopted (fork G).** 0000–0020 backfilled from the live
`supabase_migrations.schema_migrations` (already-applied statements, for traceability).

**10 new migrations authored — NOT APPLIED (Review 2C gate):**

The original bare `0021_...`-`0030_...` filenames sorted before the timestamped historical migration
files. The physical files were therefore renamed to the timestamp-prefixed names below. Logical
migration numbers 0021-0030 and their order are unchanged.

| # | File | What |
|---|---|---|
| 0021 | `inventory_stock_movement_types` | +5 `stock_movement_type` values (`purchase_return`, `write_off`, `stock_gain`, `stock_take`, `correction`) |
| 0022 | `inventory_stock_movement_columns` | `stock_movements` += `unit_cost` / `total_cost` / `movement_date` / `source_document_type/_id/_line_id` / `created_by` / `reversal_of_movement_id` + 4 indexes; `movement_date` backfilled from `created_at`. Stays append-only. |
| 0023 | `inventory_gl_accounts` | seeds `5050 Inventory Adjustments`, `1210 Inventory in Transit`, `3950 Opening Balance Equity` for every company |
| 0024 | `inventory_product_categories` | `product_categories` table (+ account-mapping cols); seed from distinct `products.category` folding in `category_account_mappings`; `products.category_id` FK backfilled by name. `products.category` text kept (transitional). |
| 0025 | `inventory_product_columns` | `products` += `sales_description` / `purchase_description` / `preferred_supplier_id` / `supplier_item_code` / `reorder_quantity` / `preferred_stock_level` / 4 nullable account overrides. `valuation_method` → `NOT NULL DEFAULT 'weighted_average'`. `cost_price numeric(14,4)` formalised. |
| 0026 | `inventory_stock_balances` | `stock_balances` per-(product,warehouse) cache; backfilled from the ledger |
| 0027 | `inventory_adjustments_and_transfers` | `warehouses.notes`; `stock_adjustments` / `stock_adjustment_lines`; `stock_transfers` / `stock_transfer_lines`; draft/approval/dispatch/receive lifecycles |
| 0028 | `inventory_stock_takes` | `stock_takes` / `stock_take_lines`; persistent freeze/count/review/post snapshot and variance evidence |
| 0029 | `inventory_opening_stock_and_supplier_returns` | `opening_stock_batches` / `opening_stock_batch_lines`; `supplier_returns` / `supplier_return_lines`; persistent costing and source evidence |
| 0030 | `inventory_permissions` | +6 `inventory:*` actions (`adjust`, `stocktake_post`, `cost_edit`, `opening_stock`, `account_map`, `import`); granted to `accountant` + `stock_controller` |

All additive; RLS `{authenticated}` `company_id = get_my_company_id()` (append-only tables keep the
SELECT+INSERT shape); the only existing-column changes are `valuation_method` NOT NULL/DEFAULT and the
formalised `cost_price` scale.

**Normalized document lines (Review 2C — kept):** migrations 0027-0029 originally proposed only
header tables with embedded JSON lines. That failed the pre-apply gate because a posted movement
cannot replace the original document line or preserve a frozen draft/review snapshot. The canonical
models are now `stock_adjustments` / `stock_adjustment_lines`, `stock_transfers` /
`stock_transfer_lines`, `stock_takes` / `stock_take_lines`, `opening_stock_batches` /
`opening_stock_batch_lines`, and `supplier_returns` / `supplier_return_lines`. Header and line company
IDs are structurally paired; each line has product/location composite FKs, structural checks, lookup
indexes, a coarse company-tenant RLS policy in its own migration, and a stable UUID for movement
evidence. No embedded JSON canonical lines remain.

**Migration ordering and enum safety:** 0000-0020 are historical and unchanged. Bare 0021-0030
filenames would sort before that timestamped history, so the physical files are named
`20260830120021__0021_...` through `20260830120030__0030_...`; logical numbering is unchanged.
Migration 0021 is an
enum-only boundary: it adds the five `stock_movement_type` values and does not use them in a table
default, constraint, data statement, or function body in the same transaction. Migration 0022 and all
document schema follow in later migrations. The logical sequence remains 0021-0030; no manual or undocumented
`ALTER TYPE` fallback is allowed. A fresh-install/replay audit must re-run before apply.

**Exact migrations waiting for application:**

1. `20260830120021__0021_inventory_stock_movement_types.sql`
2. `20260830120022__0022_inventory_stock_movement_columns.sql`
3. `20260830120023__0023_inventory_gl_accounts.sql`
4. `20260830120024__0024_inventory_product_categories.sql`
5. `20260830120025__0025_inventory_product_columns.sql`
6. `20260830120026__0026_inventory_stock_balances.sql`
7. `20260830120027__0027_inventory_adjustments_and_transfers.sql`
8. `20260830120028__0028_inventory_stock_takes.sql`
9. `20260830120029__0029_inventory_opening_stock_and_supplier_returns.sql`
10. `20260830120030__0030_inventory_permissions.sql`

**Semantic account decision unchanged:** Inventory Asset → 1200, Inventory Adjustments → 5050,
Inventory in Transit → 1210, Opening Balance Equity → 3950. Services resolve semantic mapping keys
through product → category → generic fallback and never hardcode account UUIDs. The stale 1400/5500
inventory guidance remains superseded.

### Review 2C normalized DDL contract

All five headers have `id`, `company_id`, a company-scoped document number, status, timestamps and a
`unique (company_id, id)` candidate key (the target of the composite line FK).

| Header | Composite (tenant-consistent) FKs | Unique / **structural** checks |
|---|---|---|
| `stock_adjustments` | warehouse, optional journal entry | `(company_id, adjustment_number)`; reason/status enums |
| `stock_transfers` | from/to warehouse, optional dispatch/receipt JEs | `(company_id, transfer_number)`; `from <> to`; `expected_receipt_date`/`received_date` not before `transfer_date` |
| `stock_takes` | warehouse, optional journal entry | `(company_id, stock_take_number)`; `scope in ('all','category','items')` |
| `opening_stock_batches` | warehouse, offset account, optional journal entry | `(company_id, batch_number)` |
| `supplier_returns` | supplier, optional bill/PO/journal entry | `(company_id, return_number)`; `subtotal/tax_total/total >= 0` (non-negative bounds — **not** `total = subtotal + tax_total`) |

| Line | Composite FKs | Unique / **structural** checks |
|---|---|---|
| `stock_adjustment_lines` | header (CASCADE), product, warehouse | unique `(header, line_number)` + `(header, product, warehouse)`; `line_number > 0`; `quantity_delta <> 0`; `unit_cost >= 0` |
| `stock_transfer_lines` | header (CASCADE), product | unique `(header, line_number)` + `(header, product)`; `line_number > 0`; `quantity > 0`; `unit_cost >= 0` |
| `stock_take_lines` | header (CASCADE), product, warehouse | unique `(header, line_number)` + `(header, product, warehouse)`; `line_number > 0`; `counted_qty is null or counted_qty >= 0`; `unit_cost >= 0` |
| `opening_stock_batch_lines` | header (CASCADE), product, warehouse | unique `(header, line_number)` + `(header, product, warehouse)`; `line_number > 0`; `quantity > 0`; `unit_cost >= 0` |
| `supplier_return_lines` | header (CASCADE), product, optional warehouse/tax rate/source stock movement | unique `(header, line_number)`; `line_number > 0`; `quantity > 0`; `unit_price/tax_amount/line_total >= 0` |

**No computed-formula CHECK constraints.** `cost_effect`, `total_cost`, `variance_qty`,
`variance_value`, `line_total`, header totals are all computed by the service layer — the one
authoritative calculation contract — and proven by service / posting / reconciliation tests. Only the
structural bounds above are enforced in SQL.

**Composite `(company_id, id)` candidate keys** are added to exactly nine existing tables, each solely
because a composite FK below consumes it (audited individually — see the manifest):

| Table | Candidate key added in | Consumed by |
|---|---|---|
| `products` | 0027 | every `*_lines.product_id` |
| `warehouses` | 0027 | every header `warehouse_id` / `from`/`to` + every `*_lines.warehouse_id` |
| `journal_entries` | 0027 | header `journal_entry_id` / `dispatched`/`received_journal_entry_id` |
| `stock_movements` | 0022 | `stock_movements.reversal_of_movement_id` (self, same-company reversal) + `supplier_return_lines.source_stock_movement_id` |
| `accounts` | 0029 | `opening_stock_batches.offset_account_id` |
| `suppliers` | 0029 | `supplier_returns.supplier_id` |
| `bills` | 0029 | `supplier_returns.bill_id` |
| `purchase_orders` | 0029 | `supplier_returns.purchase_order_id` |
| `tax_rates` | 0029 | `supplier_return_lines.tax_rate_id` |

`id` is already the PK on all nine, so `unique (company_id, id)` is unique by construction and
`company_id` is `NOT NULL` on all nine (verified live) — the constraint cannot fail on existing data
and adds only a small covering index (an advisor `unused_index` INFO is expected until first query).
Plain single-column FKs are deliberately kept for: `product_categories` master-data account/tax FKs
(seeded per company, not user-picked cross-tenant); `products` account/supplier overrides and
`stock_balances` product/warehouse FKs (nullable convenience pointers / a rebuildable cache — same
treatment as the pre-existing `products.tax_rate_id`); and
`supplier_return_lines.source_document_line_id` (the originating bill/PO lines are still JSON, not
normalized — no FK target exists).

**RLS** is the coarse company-tenant model used by `invoices` / `bills` / `purchase_orders`: each of
the ten new tables gets one `<table>_all_own_company` `for all to authenticated` policy —
`using (company_id = (select public.get_my_company_id())) with check (…)` — **in the same migration
that creates the table** (0027/0028/0029), so no committed boundary ever leaves a table
RLS-enabled-with-no-policy. Lifecycle (draft-only edit/delete, posted immutability) is enforced by the
service layer, exactly as for every other document in the app. Migration 0030 only seeds the
`inventory:*` permission catalog + `role_permissions` grants for `accountant` / `stock_controller`;
it creates **no functions and no policies**.

**TS types** (`src/types/`): `Product` / `StockMovement` / `Warehouse` extended (all additive);
new `ProductCategory`, `StockBalance`, `StockAdjustment`, `StockTransfer`, `StockTake`,
`OpeningStockBatch`, `SupplierReturn` (+ line + status types). Barrel updated.

**Domain services** (Phase 2 = repository triples + service **skeletons** + tests; **GL posting +
stock-movement recording are Phase 3**, marked with `// PHASE 3` stubs referencing
`docs/INVENTORY_ACCOUNTING.md`): `ProductCategoryService`, `StockBalanceService` (both fully
implemented — no GL), and lifecycle-only skeletons for the 5 document entities (draft CRUD, number
generation, status-transition guards, posted-record immutability, audit DI). Supabase repo wiring in
`instances.ts` is deferred to Phase 3 (can't be exercised against unapplied migrations).

**GL flow + costing design:** `docs/INVENTORY_ACCOUNTING.md` (new) — the Phase 3 contract.

## REVIEW 2 CHECKPOINT SUMMARY

- **Files added:** `docs/INVENTORY_ACCOUNTING.md`; `src/features/inventory/pages/InventoryOverviewPage.tsx`;
  7 `src/types/*.ts`; ~45 files under `src/features/inventory/{repositories,services}/` + `src/mock-data/`;
  the entire `supabase/` folder (21 backfilled migrations + 10 authored inventory migrations + README).
- **Files modified:** `docs/CURRENT_TASKS.md`, `docs/ROUTES.md`, `src/app/router.tsx`,
  `src/features/auth/permissionRouteMap.ts`, `src/features/inventory/components/ProductDetail.tsx`,
  `src/lib/app/navigation.ts`, `src/mock-data/accounts.ts`, `src/types/{auditLog,index,product,stockMovement,warehouse}.ts`.
- **Migrations:** 10 authored (`supabase/migrations/0021`–`0030`), **0 applied** — Review 2 gate.
  0000–0020 backfilled (byte-perfect, already applied).
- **Schema changes to the live DB:** none (nothing applied).
- **Tests added:** +83 (5 new service suites + repo tests). **Test totals: 1373 / 190 files**
  (from 1290 / 183). type-check ✅ · lint ✅ · build ✅.
- **Accounting invariants verified:** N/A this phase — no posting code changed, no migration applied,
  live DB untouched (read-only baseline unchanged from Review 1).
- **GL / subledger reconciliation:** the former Phase-14-only statement is superseded. Phase 3 owns
  the programmatic `reconcileInventory()` engine and integration tests; Phase 14 owns Difference
  Investigator/evidence UI integration.
- **Independent QA (qa-bee, from scratch):** **PASS.** Gate re-verified. Migrations confirmed
  additive-only, RLS/append-only conventions correct, seeds idempotent, backfills touch no journal.
  Types confirmed additive. GL posting confirmed genuinely stubbed (no real `postJournalEntry` call
  anywhere in the new services), no hardcoded account IDs, posted-record immutability enforced.
- **Known issues / Phase 3 to-do (from QA, all LOW/INFO — none blocking):**
  1. `ProductCategoryService` has no `auditLogService` DI yet — wire it + emit
     `inventory_account_mapping_changed` in Phase 3 (noted in `docs/INVENTORY_ACCOUNTING.md`).
  2. Mock-repo document-number generators use `all.length + 1` (collision on delete-then-create in
     the Mock path only; the DB `unique (company_id, number)` constraint protects the real path —
     same pattern as the existing `fixedAssetService`).
  3. `openingStockBatchService.previewAccountingEffect` uses AccountMappingKey string literals as
     placeholder account IDs — Phase 3 resolves real per-category IDs via `AccountMapper`.
  4. Supabase repos + the 5 document services are **not wired into `instances.ts`** — deferred to
     Phase 3 (can't be exercised against unapplied migrations; Mock repos wired + tested now).
- **Screenshots / browser checks:** none (no browser tooling).
- **Review 2C stop:** independently audit the revised migrations/types/repositories and re-run the
  full gate. Report the normalized tables, constraints, RLS and enum ordering. **Do not apply any
  migration** until that report is approved. Phase 3 then implements atomic/idempotent posting,
  normalized source-line movement evidence, the same-product WAC race fix, real semantic account
  resolution, authorization/audit wiring, repository composition and `reconcileInventory()`.

---

# STOCK COMMITMENT (PHASE 5A + 5B.3)

**Added:** 2026-09-03 (5A) · **Evolved:** 2026-09-04 (5B.3 — remaining commitment) ·
**Status:** 5A committed `4233dc2`; 5B.3 code-complete, uncommitted on
`phase-9b-relationship-design-and-code`.

## Model — DERIVED, no schema change

`stock_balances.quantity_committed` stays **0 in storage**. There is **no `stock_reservations`
table, no migration, no Supabase write, and no `stock_movement`** is ever created by a commitment.
The real committed quantity is **recomputed on read** from confirmed Sales Order lines, netted
against posted-invoice progress — the same way aging and margin are already derived.

```
Available  =  On Hand  −  Committed  ( + On Order, still 0 until Phase 6 )
Committed  =  Σ  max(0, orderedQty − postedFulfilledQty)  over confirmed Sales Order lines,  per (product, warehouse)
             postedFulfilledQty = Σ  posted (non-draft, non-void) invoice-line qty
                                     linked to that SO line via  DocumentLineItem.salesOrderLineId
```

With **no linked posted invoice** this is byte-identical to the Phase 5A rule (`Committed =
orderedQty`). 5B.3 only subtracts real, posted fulfilment.

### Commit / release rule (exact)

| Sales Order status | Effect on Committed |
|---|---|
| `pending`   | commits **nothing** |
| `confirmed` | each line commits its **remaining** quantity `max(0, orderedQty − postedFulfilledQty)` of `productId` at `line.warehouseId` (→ `Warehouse.isDefault` when the line carries none) |
| `fulfilled` | commits **nothing** — `convertToInvoice()` flips the order to `fulfilled` once every line is fully invoiced |
| `cancelled` | commits **nothing** |

- A line with no `productId`, or a non-positive `quantity`, commits nothing. A warehouse-less line
  when no default warehouse exists commits nothing.
- A **draft** invoice releases **nothing** (`postedFulfilledQty` counts only `status ∉ {draft, void}`).
- A **void** invoice releases nothing.
- Netting is per SO line: invoicing from `wh_main` does not release a `wh_of` commitment.
- Over-invoicing a line floors the remaining commitment at 0 (never negative).

`StockCommitmentService` gained a read-only `IInvoiceRepository` (inventory `instances.ts`
`invoiceRepository`, same second-Supabase-instance safety note as `salesOrderRepository`). The
`SalesOrderForm` self-exclusion (`ownCommitmentMap`) takes the same
`sumInvoicedBySalesOrderLine(invoices, isPostedInvoiceStatus)` map so "own" and "global" net
identically.

## Layering — no service cycle

`StockCommitmentService` (`src/features/inventory/services/stockCommitmentService.ts`) depends on
the **`ISalesOrderRepository`** interface (from `@/repositories`), never on `salesOrderService`, so
there is no inventory ↔ sales **service** cycle. `instances.ts` constructs a second
`SupabaseSalesOrderRepository` — safe because it is a shared database with no in-memory divergence
(the hazard exists only with `Mock*Repository`).

## Read path

- `commitmentKey(productId, warehouseId)` → `"${productId}__${warehouseId}"` — the shared map key.
- `stockCommitmentService.getCommitmentMap(): Promise<Map<string, number>>` — confirmed-SO rollup.
- `applyStockCommitments(balances, map)` (`src/features/inventory/utils/`) — pure hydrator: replaces
  `quantityCommitted` on each fetched `StockBalance` from the map, and **synthesizes** a
  zero-on-hand `synthetic_<key>` row for every commitment key with **no** balance row (stock
  committed at a warehouse that has never physically held it — Available must show negative; the
  downstream row builders only iterate the rows they are handed). Synthetic rows carry empty
  timestamps and are never written back.
- `useStockCommitments()` — hook mirroring `useStockBalances` (`{ commitments, loading, error, refetch }`).

`buildInventoryRows` / `buildStockOnHandRows` are **unchanged** — they are fed hydrated balances by
their callers (`InventoryOverviewPage`, `useStockOnHandData`).

## Availability services

`stockService.getQuantityAvailable` and `stockBalanceService.getAvailable` take an optional
`StockCommitmentLookup` constructor dependency (default: the shared `stockCommitmentService`
singleton; a test injects a fake). Both now derive `committed` from the commitment map — the
`StockBalance` row's own `quantityCommitted` is **ignored** (always 0 in storage).
`applyDelta` / `rebuildFromMovements` still emit `quantityCommitted: 0` — committed is **not**
ledger-derivable.

## Over-commitment policy — WARN, DON'T BLOCK

The Sales Order line editor (`SalesLineItemsEditor`, opt-in via `showStockAvailability`, wired only
by `SalesOrderForm`) shows `On hand N · Committed N · Available N` under each tracked-product line
and turns the caption `text-status-warning` when `ordered > available`, with wording
*"this line orders X, more than the Y available (Z already committed to other confirmed orders)."*
It **never blocks submit** — real businesses take orders they cannot yet fill (the seed of a
backorder concept, Phase 6A). A Sales Order remains a non-posting commitment document. There is
**no** hard validation, silent quantity reduction, or stock / posting side effect.

## Document-context self-commitment exclusion

`getCommitmentMap()` is a **global** rollup. When you open an already-`confirmed` Sales Order for
editing, that order's own quantities are *already* inside the global map — so a naive
`available = onHand − globalCommitted` would tell the user the order's **own** reserved units are
"committed to other orders", and could show a spurious shortage on the order competing with itself.

The fix lives **only at the document-context availability layer in `SalesOrderForm`**, never in
`StockCommitmentService`:

```
ownCommitmentMap(order, defaultWarehouseId)   // the PERSISTED order's own contribution to the
                                              // global map; EMPTY unless order.status === 'confirmed'
externalCommittedFor(global, own, p, wh?)  =  max(0, global(key) − own(key))          // wh given
                                           =  max(0, Σ global for p − Σ own for p)     // wh omitted
editorAvailable                            =  onHand − externalCommittedFor(...)       // minus other
                                              //          lines on the same doc for the same product
```

- `ownCommitmentMap` reuses the exact same per-line filter + `warehouseId ?? Warehouse.isDefault`
  fallback as the global rollup (shared private `accumulateOrderCommitments`), so multiple lines of
  one product in one warehouse **sum**, and different warehouses stay in **separate buckets**
  (SO-A P/CPT=3, P/JHB=2 → subtract 3 from CPT and 2 from JHB, never 5 from both).
- It is computed from the **persisted** `salesOrder` prop, not the live-edited form state — the
  global map reflects what is persisted, and in-progress line edits are already netted by the
  editor's own `committedElsewhere`.
- A `pending` / `fulfilled` / `cancelled` persisted order contributes nothing to the global map, so
  `ownCommitmentMap` is empty for it and nothing is subtracted.
- **Only** `SalesOrderForm`'s per-line availability caption is affected. The global commitment map,
  the inventory register, the product-detail Stock tab, the stock-on-hand report and both
  availability services still count the edited order **normally** — the current order is never
  globally removed from `StockCommitmentService`.

Worked example — onHand 20, SO-A (being edited) commits 5, SO-B (elsewhere) commits 7, same
product + warehouse: `globalCommitted = 12`, `ownCommitted = 5`, `externalCommitted = 7`,
`editorAvailable = 20 − 7 = 13`. Ordering 5 on SO-A raises no warning; SO-B's 7 still counts.

## Phase 5C (Delivery Notes) — CP-5C-A applied + live-verified 2026-09-04; CP-5C-B/C/D COMPLETE 2026-09-05

**STATUS UPDATE (2026-09-05):** the service layer, UI, and reconciliation report described as
"pointer only" below are now implemented and tested — see `docs/DELIVERY_NOTES_DESIGN.md`
§ "CP-5C-B/C/D". In particular: `StockCommitmentService` now nets the generalized
`commitmentQty` formula below for real (via `sumPhysicallyIssuedBySalesOrderLine`, fed by a live
`DeliveryNoteRepository`); a Delivery Note posts `DR 1220 / CR 1200` at current WAC through the new
`post_delivery_note` RPC; a subsequent invoice for delivery-linked quantity clears the FROZEN cost
`DR COGS / CR 1220`; and a dedicated "Goods Delivered Not Invoiced" reconciliation report compares
outstanding delivered-not-invoiced value to GL `1220`. Nothing below in this historical section was
inaccurate — it is now backed by a real implementation rather than a design intent. **Not
committed, pushed, or deployed** as of this checkpoint.

### Original design pointer (superseded by the implementation above, kept for history)

**CP-5C-A final update (2026-09-04):** the complete migration set `0050`-`0055` is now LIVE on
`bcaffvpibpitpuqglszn` — `0050` a company-safe composite-key prerequisite on `sales_orders`/
`customers`; `0051` (`stock_movement_type` value `'delivery'`); `0052` (`delivery_notes` table +
RLS, ALL THREE FKs composite); `0053` (`1220` account seed, live on all 3 companies); `0054`
(`post_delivery_note` RPC); **`0055`** (a Phase 5C compatibility amendment upgrading
`create_invoice_from_sales_order` — the existing 5B.4 RPC that already implements this doc's own
`remainingToDeliver` formula's write-side counterpart — to also subtract posted-delivery quantity,
closing the over-issue gap found in the hardening pass). See `docs/DELIVERY_NOTES_DESIGN.md`
§ "CP-5C-A APPLIED + LIVE-VERIFIED" for the exact DDL, the full read-only safety investigation, a
formally-proven 18-scenario quantity matrix, and the live rollback-wrapped smoke-test evidence.
`stock_balances.quantity_committed` is unaffected either way; nothing below changes in the
TypeScript application layer until 5C-B (service layer) is built. **Phase 5B is NOT reopened** —
`0055` is proven byte-identical to `0049`'s original behaviour whenever no Delivery Note exists.

The 5B.3 formula above (`Committed = Σ max(0, orderedQty − postedFulfilledQty)`) is the formula
**while no Delivery Note evidence exists**. Phase 5C's design (`docs/DELIVERY_NOTES_DESIGN.md`
Part 8) generalizes it:

```
commitmentQty = max(0, orderedQty − (deliveredQty + directlyInvoicedQty))
```

where `deliveredQty` = Σ posted Delivery Note line quantities, and `directlyInvoicedQty` = posted
invoice-line quantity for a line with **no** prior Delivery Note (today's only path). This reduces
**exactly** to the 5B.3 formula above whenever `deliveredQty ≡ 0` (true for every SO today, and for
any company that never adopts Delivery Notes) — a proven, not assumed, zero-behaviour-change
guarantee. `stock_balances.quantity_committed` stays 0 in storage either way; nothing here is
implemented yet — this section is a pointer only.

## Phase 5B — COMPLETE (2026-09-04, uncommitted; migrations 0048 + 0049 APPLIED)

**DONE (5B.1 + 5B.2 + 5B.3):**

- `DocumentLineItem.salesOrderLineId?` (jsonb, invoice lines only — same "one document type"
  pattern as `fixedAssetDetails`). **No schema migration.** `sales_order_lines` normalized
  projection = deferred 5B.5.
- `invoicedQty` / `fulfilledQty` are **DERIVED** (`src/features/sales/utils/salesOrderFulfilment.ts`)
  from immutable posted-invoice lines — never stored counters. Field name is `fulfilledQty`, not
  `deliveredQty` (no independent delivery evidence until 5C).
- **5B.2:** `SalesOrderService.createInvoiceFromSalesOrder(soId, selections[])` — the caller picks
  `{ salesOrderLineId, quantity }`; the service derives everything else from the SO line and rejects
  a quantity > that line's current `remainingToInvoiceQty` (`= ordered − Σ posted − Σ draft`,
  re-derived from a fresh fetch → stale selections caught). `PartialInvoicePicker` large modal is
  the UI. `convertToInvoice` = "invoice all remaining" (delegates). Multiple invoices per SO;
  1:1 guard removed; legacy full conversions still blocked.
- Commitment formula (above): `max(0, orderedQty − postedFulfilledQty)` while `confirmed`.
  **Reduces to the 5A rule when nothing is invoiced.** Live prod has 0 `confirmed` SOs → no visible
  change; GL 1200 ↔ valuation unaffected (commitment never posts). A DRAFT invoice (picker output)
  releases nothing; only POSTING it moves stock + releases commitment.
- `fulfilmentStatus` / `invoicingStatus` are **derived selectors**. The stored
  `SalesOrderStatus` `confirmed → fulfilled` flip now happens **only at POST time** when every line
  is fully POSTED-invoiced (`InvoiceService.onInvoicePosted` → `syncSalesOrderStatusAfterPost`), so
  deleting/editing a draft can't strand a stale `fulfilled`.

**5B.4 (DONE):**
- **Atomic RPC** `public.create_invoice_from_sales_order` (migration **0049, APPLIED**) — `SECURITY
  INVOKER`, `search_path=public`, revoked from `public`/`anon`, granted to `authenticated`. Locks
  the `sales_orders` row `FOR UPDATE`, re-derives every line's `remaining = ordered − Σ non-void
  (draft+posted) linked qty` in-transaction, builds lines from the authoritative SO jsonb, inserts
  a `draft` invoice. **No `journal_entries` / `journal_lines` / `stock_movements`, no
  `create_journal_entry_with_lines`, no `post_inventory_transaction`. Does not `update
  sales_orders`.** The concurrency race from CP-5B.2 is closed — two racing callers serialise on the
  SO lock and the second sees the first's draft as "taken".
- **`closed` status** (migration **0048, APPLIED** — `ALTER TYPE sales_order_status ADD VALUE
  'closed'`). `closeRemaining()` abandons the un-invoiced remainder of a partly-invoiced `confirmed`
  order — no journal, no movement, no COGS/revenue/VAT/AR, no invoice. `StockCommitmentService`
  (`=== 'confirmed'` gate) stops committing the remainder purely by re-derivation, no DB write.
- **5B.1 relationship backfill RUN** — the 3 September SO→invoice pairs linked (9 lines,
  relationship-only, all accounting fingerprints byte-identical before/after).

**Deferred → future phases:** `sales_order_lines` normalized projection (Phase 6/7 with the 9B flag
review); delivery notes (5C — moves the stock-movement/COGS trigger to delivery); credit-note ↔
remaining + per-line partial cancel (5D); a request-id idempotency log on the RPC (Phase 7).
