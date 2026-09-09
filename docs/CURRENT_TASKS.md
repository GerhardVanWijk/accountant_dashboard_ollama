# Vertex Accounting — CURRENT TASKS

---

## ACCOUNTING DOCUMENT WORKSPACE UX + SA TERMINOLOGY + PO UUID FIX + FRIENDLY ERRORS (branch `accounting-document-workspace-ux-2026-09-09`) — 2026-09-09

**NOT pushed, NOT deployed.** Committed locally on `accounting-document-workspace-ux-2026-09-09` (branched from `main` `6f0dff1`). Option-2 scope: the PO→supplier-invoice UUID defect, the central accounting error mapper, the SA-terminology sweep for the affected purchasing surfaces, removal of the `Duplicate` action from posted/sensitive documents, a shared `RecordTabs` primitive, and the migration of the four high-traffic document pages (Customer Invoice, Purchase Order, Supplier Invoice, Sales Order) to a tabbed hero + KPI-strip + tabs structure. **No migration. No accounting-posting logic change** beyond the boundary sanitisation required to fix the defect.

### PO → Supplier Invoice UUID defect (`H`)

- **Malformed field:** `stock_movements.source_document_line_id` (a Postgres `uuid` column) — reached via `billService.postBill()` → `InventoryPostingEngine.applyInventoryTransaction()` → `post_inventory_transaction`'s `nullif(v_line->>'source_document_line_id','')::uuid` cast (migration 0035 line 109).
- **Root cause:** every document line-item form minted the line `id` as `` `li_${Date.now()}` `` (e.g. `li_1788987659412`). That client string was persisted verbatim into the jsonb `lineItems` array and never replaced with a UUID. `convertToBill()` copies `po.lineItems` straight onto the supplier-invoice draft, so on "Create supplier invoice" the tracked-inventory lines carried `sourceDocumentLineId: "li_1788987659412"` into the RPC, where `::uuid` aborted the whole posting with `invalid input syntax for type uuid`.
- **Fix (two layers, traceability preserved):**
  1. **Real UUIDs at the source** — all 8 line-item forms/editors (`PurchaseOrderForm`, `BillForm`, `InvoiceForm`, `QuoteForm`, `SalesOrderForm`, `CreditNoteForm`, `LineItemsEditor`, `SalesLineItemsEditor`) now generate line ids with `newUuid()` (`crypto.randomUUID`).
  2. **Boundary guard** — `src/lib/uuid.ts` gains `isUuid()` / `coerceUuidOrNull()`; `InventoryPostingEngine.applyInventoryTransaction()` runs `sanitizeSourceLineIds()` before the executor: a non-UUID `sourceDocumentLineId` is dropped to `null` (it can never be stored in the `uuid` column regardless) with a `console.warn`, and the movement keeps its document-level `source_document_id` / `source_document_type` link. Legacy POs already holding `li_` ids post cleanly; new documents keep full line-level traceability.
- **Regression tests:** `src/lib/uuid.test.ts`; `inventoryPostingEngine.test.ts` new block — the Fake executor now reproduces the exact `invalid input syntax for type uuid` cast failure, then proves the engine drops the bad id and still completes the posting, and that a real UUID passes through untouched. `creditNoteService.test.ts` line-id-evidence test switched to a UUID fixture.

### Central accounting error mapper (`I`)

- **Location:** `src/features/accounting/utils/accountingError.ts` — `mapAccountingError(error, { reference, action })` → `{ title, message, reference?, technical, noChangesPosted, code }`; `toAccountingErrorMessage()` logs the technical detail via `console.error` and returns only the safe message string.
- **Wired:** `PurchaseOrderDetailPage` (`Create supplier invoice`, all PO actions), `BillDetailPage` (`Post supplier invoice`), `InvoiceDetailPage` (`act()`), `SalesOrderDetailPage` (`handleCreateInvoice`, `act()`).
- **Behaviour:** ordered rule list maps `invalid input syntax for type uuid`, `already posted` / `already converted`, locked / missing period, insufficient stock, missing warehouse, FK/`missing relationship`, duplicate document number, RLS/permission, network. A deliberately-worded domain message with no technical tokens (`"only 2 remain to invoice"`) passes through unchanged; anything that *looks* technical falls to a safe generic. `noChangesPosted` is only asserted where atomicity is known.
- **Example:** `post_inventory_transaction: invalid input syntax for type uuid: "li_1788987659412"` → *"This document could not be processed. One of the document lines is stored in an old format and could not be linked to the ledger. No accounting entries were posted. Open the source document, re-save it, then try again. If the problem continues, contact support and quote PO-2026-0005."*

### South African terminology (`A`) — implemented mapping

| Surface | Old | New |
| --- | --- | --- |
| Sidebar nav + breadcrumb segment (`bills`) | Bills & Expenses | **Supplier Invoices & Expenses** |
| PO detail primary action | Convert to bill | **Create supplier invoice** |
| PO detail receiving action | Record receipt | **Receive goods** |
| PO detail — related/overview | Converted to bill | **Supplier invoice** |
| Supplier-invoice detail | Bill / Post bill / "Bill date" | **Supplier invoice / Post supplier invoice / Invoice date** |
| Supplier-invoice list (`BillList`) | "Bill" column, "No bills found", "Open bill …", register caption | **Supplier invoice** equivalents |
| Supplier-invoice create form/modal | New bill / Create Bill / Bill Number / "Bill created as a draft." | **New supplier invoice / Create supplier invoice / Supplier Invoice Number / "Supplier invoice created as a draft."** |
| Global search entity | Bill / Bills | **Supplier invoice / Supplier invoices** |
| BillsPage header + KPIs | Expenses / "Total bills" / "Loading bills…" | **Supplier Invoices & Expenses / "Total supplier invoices" / "Loading supplier invoices…"** |
| Printed customer invoice (non-VAT issuer) | INVOICE | **CUSTOMER INVOICE** (VAT issuer stays **TAX INVOICE**) |
| Help article (purchasing) | "convert the PO to a bill" | "create the supplier invoice from the PO" |
| `convertToBill()` already-converted error | "…converted to a bill" | "…converted to a supplier invoice" |

Kept: **Customer Receipt** (money in), **Credit Note**, **Delivery Note**, **Purchase Order**, **Sales Order**, **Quote/Quotes** nav. DB columns / types (`Bill`, `billNumber`, `bills` route, audit `recordType: "Bill"`) unchanged. `nextDocumentNumber(..., 'BILL')` prefix unchanged (document numbering).

### `Duplicate` action removal (`G`)

Removed from **Purchase Order, Customer Invoice, Quote, Sales Order** detail pages. Rationale: the user's explicit preference is removal from all four; a posted invoice/SO clone risks an accidental duplicate financial transaction, and PO/Quote cloning — while defensible on a non-posting document — was removed per that explicit instruction. The underlying service methods (`duplicatePurchaseOrder`, `copyInvoice`, `duplicateQuote`, `duplicateSalesOrder`) are **kept intact** for any future re-introduction; only the UI actions and their destructured hook references were removed.

### `RecordTabs` shared primitive + four migrated pages (`5`–`9`)

- **`src/components/app/record-page/RecordTabs.tsx`** — a Chrome-style workspace tab strip built on Vertex tokens: full-width `border-border` hairline, active tab = semibold `text-foreground` + 2px `border-brand` underline overlapping the strip, inactive = `text-muted-foreground` → `text-foreground` on hover; ARIA `tablist`/`tab`/`tabpanel` with roving `tabIndex`, `Arrow`/`Home`/`End` keys and a `focus-visible` ring; `overflow-x-auto` + `no-scrollbar` (scrolls only when tabs overflow, no stray track); optional per-tab count badge; panels kept mounted and toggled with `hidden`; optional `urlParam` mirrors the active tab to `?tab=` (skipped when `embedded`). Test: `RecordTabs.test.tsx`.
- **Migrated (each: hero = number + status badge + party + concise date line + primary actions; then a 4-tile `StatStrip`; then `RecordTabs`; reuses `RecordPageShell` / `RecordPageHeader` / `RecordSummaryGrid` / `DocumentLineTable` / `RelatedRecordsSection` / `RecordActivitySection`):**
  - **Customer Invoice** — Overview · Line items · Payments (posted only) · Accounting · Related records · Activity. KPIs: Total / Paid / Outstanding / Output VAT.
  - **Purchase Order** — Overview · Line items · Receiving · Supplier invoice · Related records · Activity. KPIs: PO total / Ordered / Received / Remaining.
  - **Supplier Invoice** — Overview · Line items · Payments · Accounting · Related records · Activity. KPIs: Total / Paid / Outstanding / Input VAT.
  - **Sales Order** — Overview · Line items · Fulfilment (delivery notes + related invoices + qty breakdown, rendered only when there is evidence) · Related records · Activity. KPIs: Order total / Ordered / Delivered / Invoiced.
- **Same-page duplication removed:** the standalone `Status` field is gone from every Overview grid (status lives once, in the hero badge); the bare customer/supplier name is no longer repeated as an Overview field (hero shows it; Related Records links it); document totals appear once in the line-items footer + once as KPI tiles (distinct purpose) rather than also in an Overview grid; the Sales Order Invoicing/Fulfilment status badges render once (Overview), not again in the Fulfilment tab; the PO/Bill journal-entry link sits in Accounting and Related Records only (relationship index), not also inline in Overview.

### Validation

- type-check — **PASS**
- lint (`--max-warnings 0`) — **PASS**
- focused tests — **PASS** (`uuid`, `accountingError`, `inventoryPostingEngine`, `RecordTabs`, all four detail pages, `QuoteDetailPage`, `PurchasesListPages`, `PurchasesFormModals`, `adapters`, `creditNoteService`)
- full suite — **PASS** (384 files, **3171 tests**)
- production build — **PASS**

### Database

- Migrations authored? **No.** Migrations applied? **No.** The defect was pure client line-id generation + a posting-boundary guard; the RPC's `::uuid` cast is correct and unchanged.
- Accounting posting logic changed? **No** — only `sanitizeSourceLineIds()` was added at the engine boundary (drops an un-storable non-UUID to `null`; GL, VAT, WAC, document-status behaviour all unchanged).

### Deferred (explicitly out of scope for this run)

Full Customer / Supplier / Product workspace rebuilds; global forms redesign; the remaining document types (Quotation, Delivery Note, Return Note, Credit Note, Customer Receipt, Supplier Payment, Journal Entry, inventory documents); broad PDF/template redesign beyond the terminology directly touched here.

---

## INVENTORY WORKSPACE + STOCK INTEGRITY + DERIVED ON-ORDER (branch `inventory-workspace-integrity-2026-09-09`, commit `56ac5e8`) — 2026-09-09

**SHIPPED 2026-09-09** — on explicit user instruction ahead of human browser QA, `inventory-workspace-integrity-2026-09-09` was fast-forward-merged → `main` (`8357d99..56ac5e8`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). **UI + read-side services only — no migration, no schema change, no accounting-posting change, no DB write.** Inventory reconciles at R0.00 on live data throughout; the reconciliation engine, WAC/valuation contract, posting engine and stock ledger are untouched.

- **Product workspace** (`InventoryItemDetail`): KPI hero strip (on hand / available / committed / in transit / on order / stock value / WAC / gross margin); Overview regrouped into cards; tab **"Transactions" → "Traceability"** (internal value unchanged); ledger rebuilt on `DataTable` (type/direction/exception filters, `no source` + `reversal` badges, transfer-direction line) with a row-click **evidence drawer** (`RecordDetailSheet` over the page: movement / location / source + party / cost / accounting trace / audit); Purchasing + Sales tables gain Warehouse / Status / per-line Revenue-COGS-GP; Accounting tab gains a summary + per-account Debit/Credit related-journals table; Documents tab lists related source documents from the ledger.
- **Derived `quantityOnOrder`** (`stockOnOrderService`, `useStockOnOrder`): read-side from OPEN purchase orders (`status 'sent'`, no bill, no receipt journal), keyed by `commitmentKey`. **Storage stays 0, never written; NOT folded into Available.** Documented limitation: PO receipt is all-or-nothing (`partially_received` never produced), draft POs excluded.
- **Global Stock Movements page** — full rewrite: resolved product/warehouse/source names (no UUIDs), per-product running balance, evidence badge, filters (period / type / direction / warehouse / product / source type / exceptions), row-click evidence drawer.
- **Company Inventory Control Centre** (Inventory overview): old FigureBlock strip replaced with 11 drill-down linked stat tiles + a reconciled / "N findings require investigation" banner, all from `reconcileInventory()`'s result (no fabricated counts).
- **Warehouses page**: new "Warehouse control" rollup — per location on hand / committed / available / in-transit in / in-transit out / stock value + low/negative alert badges (`warehouseAggregates`, pure).
- **Stock integrity**: per-product `productIntegrity.ts` slices the company `reconcileInventory()` result (incl. **Check F**, now wired via `buildKnownDocumentRefs`) to the findings naming a product → `reconciled` / `attention` / `investigate`. Inventory Reconciliation report Section F now runs.
- Shared `useStockMovementResolvers` + `movementAccounting` remove duplicated resolution/accounting maps; `ProductForm` grouped into General / Pricing / Inventory `FormSection`s (no new fields). Operations registers + report pages inspected, already consistent, left untouched.
- **Deferred (migration required, not authored):** partial transfer receipt (`received_quantity` / `partially_received`), persisted in-transit balances, real `stock_lots` / FIFO.
- Gate: type-check · lint(`--max-warnings 0`) · **3141 tests** · build ALL PASS. 32 files, +3149 / −772, all under `src/features/inventory/`.
- **Post-deploy browser QA is now owed** — the product workspace (8 tabs, KPI strip, evidence drawer), the rewritten Stock Movements page, the Inventory Control Centre, the Warehouses control rollup, and the on-order figures across all four surfaces.

---

## REMOVE INTERNAL SPEC / DEVELOPER REFERENCES FROM USER-FACING UI (branch `remove-internal-spec-refs-2026-09-08`, commit `03cdce8`) — 2026-09-08

**SHIPPED 2026-09-08** — on explicit user instruction ahead of human browser QA, `remove-internal-spec-refs-2026-09-08` was fast-forward-merged → `main` (`bdcad7f..03cdce8`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Presentation copy only — no migration, no DB write, **no accounting effect** (Trial Balance difference R0.00, GL1200 / journal count / stock-movement count unchanged; verified read-only).

- Global audit of authenticated + public UI, Help Centre and runtime data definitions for internal engineering leakage. Removed from **15 rendered strings**: `SA_ACCOUNTING_MASTER_SPEC.md` citations, spec section signs (`§NN`), `docs/*.md` references, internal phase names ("Phase 9B", "Phase 14"), and a "run migration 0045" instruction. Traceability kept in code comments (Trial Balance subledger section now carries an `// Accounting basis: …§17/§18/§70/§71` comment).
- Files: Trial Balance (subledger description), Balance Sheet / Income Statement / Cash Flow (page descriptions + out-of-scope notes), Tax Register, Tax Rate form, 4 inventory report footnotes, Inventory Reconciliation report, Credit Note detail, Capital Gains notes, Income Tax computation line, Compliance determination disclaimer, books-integrity / integrity-audit details, `reconcileInventory` diagnostic details, one Help article.
- **Comments, tests and `docs/*.md` citations were NOT touched.** `mock-data/*` fixtures left as-is (test-only; live DB verified clean).
- New guard tests: `TrialBalancePage.test.tsx` (subledger section renders plain copy, no `SA_ACCOUNTING_MASTER_SPEC` / `§NN`); `help/content/noInternalReferences.test.ts` (every Help article's rendered copy is free of spec filenames, `docs/*.md`, `§NN`, migration numbers, phase names, persistence jargon). One `reconcileInventory` assertion updated to the new wording.
- **AP variance (R354,200.00) was investigated read-only and deliberately NOT changed** — classified as a *reconciliation-engine modelling gap*, not a books error: `useSubledgerReconciliation()` calls `reconcileAccountsPayable()` without the `nonBillApAdjustments` argument, so legitimate non-bill AP postings (R368,000 fixed-asset-on-credit JE-4001, R28,175 opening balance JE-0001, −R9,200 supplier return JE-4137) surface as a variance. Trial Balance still balances; AP genuinely owes the money.
- Gate: type-check · lint(`--max-warnings 0`) · **3117 tests** · build ALL PASS.
- **Post-deploy browser QA is now owed** — spot-check the accounting/report/reconciliation screens (Trial Balance subledger card, financial statements, inventory reports, Help Centre) show plain accounting language with no `SA_ACCOUNTING_MASTER_SPEC` / `§` / migration / phase references.
- **2026-09-09:** empty commit `721d0bf` (`chore: trigger Cloudflare Pages production rebuild of main`) pushed to `origin/main` on explicit user instruction to force a fresh Cloudflare Pages production build of the current HEAD. No code change; build green locally; site returns HTTP 200.

---

## DATA IMPORT / MIGRATION + EXPORT CENTRE + LIGHT MODE (branch `import-export-light-mode-2026-09-08`) — 2026-09-08

**SHIPPED 2026-09-08** — on explicit user instruction ahead of human browser QA, `import-export-light-mode-2026-09-08` was fast-forward-merged → `main` (`105ab10..11d0445`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Migrations `0077` (schema + 2 private buckets + 3 RPCs) and `0078` (`data_migration` permission feature) were **already applied to live**; the merge itself carries no further migration. The light-mode continuation has **no DB write and no accounting effect** (CSS design tokens + component classNames + Help content only). Trial Balance difference **R0.00**; current-data accounting integrity verified (248/248 posted entries balanced, stock cache == movement ledger, AR/deposit control accounts match the reconciled figures). **Post-deploy browser QA is now owed** — the 7 import pages + role gates, and the softened light mode at 1920/1440/1366/tablet/mobile with a re-confirm that dark mode is visually unchanged.

Gate at ship: type-check / lint / **3045 tests** / build all pass; Supabase advisors **0 ERROR**. Import-schema live-verified with a rolled-back transaction — 0 artifacts persisted.

Ported: the `src/features/import/migration/*` service layer, `chartOfAccountsImportAdapter`, the wizard extended to SLC's superset (Account/Tax Mapping steps — wired but unreachable until the deferred adapters land), 7 admin pages at `/admin/imports*` + `/admin/exports`, nav under Administration, `data_migration` route gate. Working import types: **Chart of Accounts, Customers, Suppliers, Products, Opening Stock**.

**Deferred:** Trial Balance / GL detail / AR & AP opening-balance imports — they need a manual-journal-draft lifecycle Vertex does not have. See `docs/SLC_IMPORT_PORT.md` + `docs/DATA_MIGRATION.md`.

**Owed:** human browser QA of all 7 pages + role-gate click-through (`accountant` / `finance_manager` / `bookkeeper` in, everyone else out, `admin`/`superuser` bypass); then merge + deploy decision.

### Continuation — light mode + Help Centre (same branch) — 2026-09-08

**No DB writes. Gate: 3045/3045 tests, type-check / lint / build all pass. TB difference R0.00.**

- **Global light-mode softening** (`docs/LIGHT_MODE.md`): softened ~12 LIGHT-only v0 `:root` tokens in `src/styles/tokens.css` (soft cool off-white canvas, white cards elevated against it, deeper muted surface, gentle cool borders, charcoal-navy text, better secondary-text contrast). Form primitives (`input`/`textarea`/`select`/`combobox` triggers) get a `bg-muted/55` soft fill in light. Chart tooltip → `bg-popover`. **Dark mode byte-identical** (guarded by `src/styles/light-mode-tokens.test.ts`). Marketing site untouched (no `.app-shell` → keeps legacy `--color-*`). Codebase audit: 0 hardcoded app surfaces to fix beyond 3 intentional paper-white ones (2 logo previews, 1 invoice preview).
- **Help Centre**: 15 Administration articles for the data-migration/import/export subsystem (`docs/HELP_CENTRE.md`), all reflecting real behaviour (no native Pastel/Sage/Xero/Syspro connector claimed). Contextual `<HelpLink>` on 4 import page headers.
- **Import pages**: removed the last SLC hardcoded style (a navy card shadow → `shadow-sm`). New `src/features/import/importPortIntegrity.test.ts` locks: 0 SLC branding, deferred adapters absent + labelled, honest source-system state, routes/nav wired.

**Shipped with the merge above.** Still owed: browser QA of the softened light mode (1920/1440/1366/tablet/mobile) + a re-confirm dark mode is unchanged; browser QA of the 7 import pages.

---

## ACCOUNTING REGISTER PAGES — VISIBLE STRUCTURAL REDESIGN (branch `accounting-registers-structural-redesign-2026-09-07`, commit `7519446`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, `accounting-registers-structural-redesign-2026-09-07` was fast-forward-merged → `main` (`27c35a3..7519446`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Layout / composition / responsive presentation only — no migration, no DB write, no calculation / classification / posting / reconciliation / variance change. **Post-deploy browser QA (1920/1600/1440/1366/1024/tablet/mobile) of Bank Transactions, Chart of Accounts, General Ledger, Journal Entries and Trial Balance is now owed.**

- The prior consistency pass (`0ec4669`) was too subtle to see; this is a deliberate, noticeable upgrade.
- **New shared primitive** `StatTile` + `StatStrip` (`@/components/app/stat-tile`): icon chip + label + large tabular figure + supporting line; `warning`/`negative` tones add a coloured hairline + faint wash + coloured figure. `StatStrip` caps the widest layout (3 or 4) and collapses 2-up then 1-up so a 4-metric row is never crushed.
- **`DataTable` (global):** filter controls now sit in a bordered toolbar bar; new `toolbarLeading` slot renders the entity selector before the search box; header h-11 / `bg-muted/60` / 2px underline / `font-semibold`; body rows zebra-striped (hover / selected / brand-accent still win).
- **Bank Transactions:** 3 icon tiles (warning when awaiting-recon / needs-allocation non-zero); toolbar `[Account][Search][Status]`; vertical rule between Money in / Money out; description bold, reference + dot "Needs allocation" pill on a quiet 2nd line.
- **Chart of Accounts:** 3 tiles + a 5-cell type-count breakdown bar (derived from loaded `accounts`, no query); group headers get a brand left bar + count chip + bold wide tracking; code chip; normal-balance pill; filled Active badge; zebra rows.
- **General Ledger:** 3 icon tiles + a new current-view context bar (brand-tinted with the account when narrowed, neutral for All accounts); toolbar `[Account][Search][Source]`; JE ref as a file-icon link; source badge dot; balance column → "Running balance" + bold in single-account mode.
- **Journal Entries:** 4 icon tiles; journal number is now a brand link with a scroll icon (obvious click target, same navigation).
- **Trial Balance:** control strip = two tiles + a double-width Difference control card (2px coloured border + wash, Balanced/Out-of-balance pill, 3xl coloured amount, explanation folded in — old thin banner removed); heavier TOTALS row; subledger section promoted (divider, `Scale` icon, heading, "n/3 reconciled" pill); cards redesigned with a coloured top strip, dot status badge, Variance in its own tinted box promoted when non-zero.
- One TB copy assertion updated to the new "Balanced" pill wording.
- Gate: type-check · lint(`--max-warnings 0`) · **2973 tests** · build ALL PASS.
- **NEXT: post-deploy browser QA of the five register pages.**

---

## ACCOUNTING REGISTER PAGES — SHARED VISUAL LANGUAGE (branch `accounting-tables-visual-consistency-2026-09-07`, commit `0ec4669`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, `accounting-tables-visual-consistency-2026-09-07` was fast-forward-merged → `main` (`c7093e2..0ec4669`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Presentation only — no migration, no DB write, no calculation / classification / balance / pagination-semantics / reconciliation / variance change. **Post-deploy browser QA (1920/1600/1440/1366/1024/tablet/mobile) of Bank Transactions, Chart of Accounts, General Ledger, Journal Entries and Trial Balance is now owed.**

- Per-page refinement then a cross-page consistency pass so the five registers share page gutters, title/subtitle proportions, primary-action position, metric-card heights, filter-toolbar rhythm, table header height + row density, money alignment, badge sizing, pagination layout and responsive breakpoints — each page keeps its purpose (Bank = operational, CoA = structural, Ledger = evidence, Journals = journal-focused, Trial Balance = control/reconciliation).
- **Chart of Accounts:** `<colgroup>` column proportions (Account name largest), stronger group-header rows, right-aligned Actions; filter toolbar taken out of its `SectionCard` and re-classed to the shared `DataTable` control spec, wrapped with the table in a `gap-4` column; page is now a bare fragment.
- **General Ledger:** visible "Ledger account" label on the account selector (`aria-label` "Filter by account" → "Ledger account"); `headClassName` column widths; account-name + wider description truncation; bare-fragment page shell.
- **Journal Entries:** `headClassName` column widths; description truncation widened; Value cell drops `font-medium` to match every other money cell.
- **Trial Balance:** compact balanced/out-of-balance banner subordinate to the control totals; column widths; stronger TOTALS row; subledger cards get tonal status badges + variance emphasis only when non-zero.
- **Bank Transactions:** metric grid gap 6 → 4; account selector moved into the `DataTable` toolbar; `headClassName` column widths; Money in no longer force-coloured.
- Gate: type-check · lint(`--max-warnings 0`) · **2973 tests** · build ALL PASS.
- **NEXT: post-deploy browser QA of the five register pages.**

---

## DASHBOARD V3 (branch `accounting-page-visual-refinement-2026-09-07`, commit `a3bbf28`) — 2026-09-07

**SHIPPED 2026-09-07 FINAL COGS VERIFICATION** — on explicit user instruction ahead of human browser QA, `dashboard-v3-final-cogs-verification-2026-09-07` was fast-forward-merged → `main` (`8f434cf..305d901`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Reporting/read-model classification only — no migration, no DB write, no posting mutation. Dashboard realized stock margin now reuses the Income Statement COGS classifier, including category COGS accounts `5000`-`5049` while excluding `5050` inventory adjustment. **Post-deploy browser QA of Dashboard V3 is still owed.**

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, fast-forward-merged → `main` (`1362248..a3bbf28`, carried alongside the accounting-page pass below) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Frontend + read-model only — no schema, migration, RPC or posting change; every figure still comes from already-posted journal entries via `calculateMonthlyFinancials`.

- `MonthlyFinancials` splits `expenses` → `cogs` + `operatingExpenses`, keyed on the existing `COST_OF_GOODS_SOLD_ACCOUNT_CODE` (reused from the income-statement service); the total is unchanged.
- New `calculateDashboardV3Metrics` (gross/net profit, gross/net margin %, realized stock margin %) + `dashboardPeriods` (3m / 6m / 12m / financial-year / YTD / custom range helpers), both unit-tested.
- `useDashboardData`: trailing window 12 → 24 months, exposes `lastUpdated`.
- `DashboardPage` rebuilt: Revenue / Gross Profit / Net Profit / Cash Position KPIs; Gross Margin % / Net Margin %; Profitability trend + Cash movement charts; Receivables/Payables ageing. Drops the mock "Expense mix" / "Revenue by customer" panels. `useCanAccess` gate added.
- Gate: type-check · lint(`--max-warnings 0`) · **2971 tests** · build ALL PASS.
- **NEXT: post-deploy browser QA of the dashboard.**

---

## ACCOUNTING PAGES — VISUAL COHERENCE PASS (branch `accounting-page-visual-refinement-2026-09-07`, commit `87f4ee8`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, fast-forward-merged → `main` (`1362248..a3bbf28`) + pushed; Cloudflare Pages auto-deploys production (`vertex-accounting.pages.dev`). Frontend/responsive only — no schema, migration, service, calculation, journal, balance, filter, search, route, action, permission, badge or pagination change.

- Chart of Accounts gains the compact summary strip the other accounting list pages have (Accounts / Active / With postings — counts off loaded data, no fabricated balances).
- `AccountTable` rebuilt on the shared `Table` primitives so header / row-height / hover / border chrome matches every `DataTable` register; the account-hierarchy / group-header logic is unchanged.
- General Ledger: the account selector moves out of the KPI card into the table's own filter toolbar (one compact toolbar); KPI card keeps just its three figures.
- Journals / Ledger: long descriptions truncate with a full `title=` value instead of forcing the column wide.
- KPI strips: grid gap 6 → 4 across Journals / Ledger / Trial Balance / Financial Periods / Chart of Accounts.
- Gate: type-check · lint(`--max-warnings 0`) · **2971 tests** · build ALL PASS.
- **NEXT: post-deploy browser QA of the six accounting pages (1920/1600/1440/1366/1024/tablet/mobile).**

---

## BANK DETAIL PANEL + NEW BANK TRANSACTION FORM UX (branch `bank-detail-panel-txn-form-ux-2026-09-07`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, `bank-detail-panel-txn-form-ux-2026-09-07` was fast-forward-merged → `main` (`0a1755b..868817f`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Presentation/responsive UX only — no migration, no DB write, no accounting/DTO/calculation change. **Post-deploy browser QA (1920/1440/1366/1024/tablet/mobile) of the bank detail panel + the New/Edit bank transaction forms is now owed.**

- **Root cause of the narrow record-detail side panel:** `RecordDetailSheet` passed width as a plain `sm:max-w-*` className, which loses the CSS-specificity race against the shared `SheetContent`'s baked-in `data-[side=right]:sm:max-w-sm` — so *every* record-detail panel (Customer/Supplier "wide" ones included) was pinned at 384px regardless of the prop. Fixed with a `width="default" | "wide"` prop expressed as `data-[side=right]:` variants (`default` ≈ 26rem→30rem xl; `wide` ≈ 2xl→3xl lg). Callers' broken `className="sm:max-w-xl/3xl"` overrides removed; `recordSheetClass`/`wideRecordSheetClass` deleted from `form-surface.ts`.
- **Shared `RecordDetailSheet` relayout:** non-scrolling outer → pinned header / one scrolling body / pinned footer (the FormShell architecture) so the × close button stays reachable; footer is `bg-muted/50` border-t, `justify-end`, no longer `flex-1`-stranded at the bottom of a tall empty panel.
- **New shared primitives** in `record-detail-sheet.tsx`: `RecordDetailHero` (full-width headline figure, readable "R 0,00" → "R 1 250 000 000,00"), `RecordDetailGrid` (2-col metadata, never 3), `RelatedRecordItem.onActivate` (whole row becomes the click target + chevron).
- **Bank Account detail** rebuilt: hero Current balance + 2-col grid (Account number / Currency / Ledger account / Last reconciled / Status). Other in-sheet detail bodies (BankTransaction, Asset, Lease, Employee) dropped `sm:grid-cols-3` → 2-col. Audit-history list caps height + scrolls past 6 entries.
- **New Bank Transaction form:** `TransactionFormModal` (and the sibling `AllocateTransactionFormModal`) → `size="md" height="natural" className="sm:max-w-3xl"` — content-driven height, no full-viewport dead space. `TransactionForm` re-laid on `FormSection` + `FormGrid`; Gross amount is a fixed-width `InputGroup` "R" money field, not a full-bleed input. `AllocationRows` rebuilt: "Allocation" / "Add allocation", proportioned desktop grid that collapses to stacked cards below `sm`, and a real reconciliation summary (Transaction amount / Allocated / Remaining + semantic Balanced / needs-allocation / over-allocated pill). Same `computeAllocationTax` / submit path.
- Gate: type-check · lint(`--max-warnings 0`) · **2967 tests** (+14: `BankAccountDetail`, `AllocationRows`, `record-detail-sheet`) · build ALL PASS.
- **NEXT: human browser QA (1920/1440/1366/1024/tablet/mobile) of the bank detail panel + the New/Edit bank transaction forms, then merge.**

---

## GLOBAL FORM UX / VISUAL REFINEMENT (branch `global-form-ux-2026-09-07`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, `global-form-ux-2026-09-07` was fast-forward-merged → `main` (`5b878f8..f00bd21`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). No migration, no DB write, no accounting effect (frontend form UX only). **Post-deploy browser QA of the form pass (desktop/tablet/mobile) is now owed.**

- **Problem:** page-hosted forms (SupplierFormPage, the Create Delivery/Return pages) stretched fields edge-to-edge on a wide monitor; ~60 hand-rolled `grid grid-cols-1 gap-4 md:grid-cols-2` copies across ~30 forms; hand-rolled `<input type="checkbox">` in 8 RHF forms.
- **New shared primitives** (`@/components/app/form`): `FormGrid` (`columns` 1/2/3 responsive field grid), `FormField` (label+control+hint+error bundle, `span="full"`), `CheckboxField` (horizontal checkbox+label row), `FormPageLayout` (centred, `max-w-4xl` standard / `max-w-6xl` document, optional `backTo`). Decision taken with user: **centred card, max-w-4xl / 6xl**; **full sweep, all forms**.
- **Swept** every form named in the brief (Inventory ×8, Purchases ×3, Sales ×5, Customer, Supplier ×2, Accounting ×2, Banking ×2, Company, Assets ×2, Tax ×3, Leases, RelatedParties, Employees ×2, FX) → `FormGrid` + `CheckboxField`; SupplierFormPage / CreateDeliveryNotePage / CreateReturnNotePage → `FormPageLayout` (last two also dropped bespoke `h-9` input strings for shared `Input`/`Field`). Document forms: metadata grid + Notes capped `max-w-3xl`, line table full width.
- **N/A:** Radio groups (no component, 1 non-form usage); Services module (doesn't exist); the "27 ad-hoc dialogs" (already on FormShell since P3D–P3G).
- Gate: type-check · lint(`--max-warnings 0`) · **2953 tests** (+10) · build ALL PASS. Accounting byte-identical. Doc: `GLOBAL_FORM_UX.md`. `DO_NOT_BREAK.md` gained a "use FormGrid" rule.
- **NEXT: post-deploy browser QA of the form pass (desktop/tablet/mobile).**

---

## PRODUCT CATEGORIES + PRODUCT PICKER (branch `product-catalog-picker-2026-09-07`) — 2026-09-07

**SHIPPED 2026-09-07** — on explicit user instruction ahead of human browser QA, `product-catalog-picker-2026-09-07` was fast-forward-merged → `main` (`b2dcbfa..04d40c4`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). Migration 0076 was already applied to live prod. **Post-deploy browser QA of the picker + product/category flows is now owed.**

- **Root cause:** `SupabaseProductRepository` never mapped `products.category_id` → every `Product` in the app had `categoryId` undefined despite all 50 live products being linked. Fixed the repo (`ProductRow`/`rowToProduct`/`productToRow` + `sales_description`/`purchase_description`/account-override columns).
- Category selector on New/Edit Product (`SearchableSelect`, "No category" state, writes `categoryId`, mirrors name into legacy `category`). Categories page counts were already `categoryId`-based — fixed upstream. **No backfill needed** (50/50 linked, 0 ambiguous).
- **Account resolution** (product override → category → generic) now genuinely reachable — new `inventoryAccountResolver.test.ts`. Future postings for categorised products resolve category GL accounts (4010–4040/5010–5040) not the generic 4000/5000 — intended, dormant behaviour; posted journals untouched, TB balanced, GL 1200 unchanged.
- **Shared `ProductCombobox` redesigned** — one component, `sales`/`purchase`/`inventory` contexts. Name-primary rows (`name` / `SKU · category` / `stock · price`); sales shows sell price and NEVER WAC/cost; purchase→cost, inventory→WAC only with `inventory:cost_edit`; warehouse-aware stock; always-visible "name, SKU or barcode" search; in-popover category-filter chips; custom line set apart. Applied to all 6 line editors (Quote/SO/Invoice/CN, PO/Bill, opening stock/adjustment/transfer/supplier return).
- Migration **0076**: `products_category_company_integrity` trigger (cross-company `category_id` → 42501, verified live) + a no-op guarded self-heal backfill.
- Gate: type-check · lint(`--max-warnings 0`) · **2943 tests** · build ALL PASS. Advisors **0 ERROR / 122 WARN**. Accounting byte-identical (TB R0.00, GL 1200 R1,478,853.74, 247 JE, 343 movements). Doc: `PRODUCT_CATALOG_PICKER.md`.
- **NEXT: post-deploy browser QA of the picker + product/category flows.**

---

## ADMINISTRATION MODULE (branch `administration-module-2026-09-06`) — 2026-09-07

**Blocks A–G COMPLETE. `main` untouched, NOT deployed. Awaiting human browser QA before merge.**

- **A** inspection + matrices · **B** Company Documents + private Storage (0071) · **C** Audit Trail + Access Log hardening (0072) — all previously done.
- **D** Global Notifications (`0073` + `0073b`): `notifications` / `notification_reads` / `notification_mutes`; `evaluate_company_notifications()` — 9 deterministic checks over real data, condition-driven lifecycle (open → persist → auto-resolve → re-open with `event_seq+1`); `notification_feed` / `_unread_count` / `mark_*` / `set_notification_category_muted` RPCs; RLS company + role + permission + entitlement targeting; navbar bell (one only, no flashing) + `/notifications` page + Settings → Notifications. Noise test PASS (normal journal + bank txn → opened 0). Doc: `NOTIFICATIONS.md`.
- **E** Settings / Accounting Settings / Plan & Billing (`0074`): Settings gains a Notifications tab; Accounting Settings is a real config view (live company config + category account mappings) not a link hub; `companies` trigger audits every high-risk accounting-config change (before/after); Plan & Billing adds interval / current period / management state / in-plan vs locked module lists (no fabricated payment data).
- **F** Help Centre: 44 articles / 13 categories (incl. 14 real troubleshooting cases), ranked search, `/help/:articleId` pages, contextual `<HelpLink>` on 7 workflows. Doc: `HELP_CENTRE.md`.
- **G** app-wide hardening (`0075` + `0075b`): `documents` / `notifications` / `settings` / `accounting_settings` / `billing` permission features + 33 grants + route gates; `user_roles` + `profiles` audit triggers; `useLogSensitiveAccess` on Payroll (×4) / Income tax / Provisional tax / Superuser console / Documents. Cross-company isolation PASS (0 rows of company A visible to company B across documents/audit/access-log/notifications/notification-state/profiles/mappings/company). Signed download URL cannot be minted cross-company. Doc updates: `SECURITY.md` § "Administration module verification".

**Migrations applied to live prod:** `0073`, `0073b`, `0074`, `0075`, `0075b` (preflight → apply → rollback-wrapped verify, same process as 0071/0072). **Advisors: 0 ERROR / 123 WARN** (all pre-existing classes; the one new fixable WARN fixed in 0075b). **Accounting byte-identical:** TB `R0.00`, GL 1200 `R1,478,853.74`, 247 JE / 343 movements. **Gate:** type-check PASS · lint (`--max-warnings 0`) PASS · full test suite (2920) PASS · build PASS. **Production business-data writes:** only `public.notifications` rows for genuinely-derived conditions (2 for Office National Demo, 4 for `test 1`) — real feature output, self-maintaining, no accounting effect. No fake/test rows persisted.

**SHIPPED 2026-09-07** — on explicit user instruction **ahead of human browser QA**, `administration-module-2026-09-06` was fast-forward-merged → `main` (`58ec47d..98b2412`) + pushed; Cloudflare Pages auto-deploys `main` to production (`vertex-accounting.pages.dev`). This also carried Blocks B (0071) and C (0072) to `main` for the first time. **Post-deploy browser QA of the whole Administration module is now owed** (Notifications bell + page + noise behaviour; Settings/Accounting Settings/Plan & Billing; Help Centre search + articles + contextual links; role-based access to the new gates). Do not add further implementation phases.

---

**Authoritative project status**  
**Date:** 2026-09-06 (COMMERCIAL FOUNDATION — Blocks 1–4; migrations 0066–0069)  
**Branch:** `commercial-foundation-2026-09-06` (off `main` `15025ec`). `main` untouched, NOT deployed. Payment provider = **Paystack** (integration pending merchant credentials); server runtime = **Supabase Edge Functions** (not built). NO payments processed.  
**Gate:** 2833 tests / 343 files PASS · TypeScript PASS · ESLint (`--max-warnings 0`) PASS · Build PASS. Security advisors 96 WARN / **0 ERROR**. Live accounting byte-identical to baseline (TB `R0.00`, GL 1200 `R1,478,853.74`, 247 JE / 343 movements).  
**Blocks done this run:** (1) first-company creation FIXED — `create_company_and_become_admin` now atomic + seeds a default SA chart of accounts + financial year + 12 periods, no orphans (0066/0067); (2) public SEO + `robots.txt`/`sitemap.xml`/`_headers` (CSP, HSTS, X-Robots-Tag noindex on private routes) + last v0 content-fabrication removed; (3) plan/entitlement engine — Layer 2 of the three-layer access model, `subscription_plans`/`plan_features`/`subscriptions`, `company_entitlements()` resolver, `<EntitlementGate>` + nav gating + server `require_entitlement()` scaffold on inventory (0068); (4) secure new-user invitations — hashed single-use time-limited email-bound tokens, create/accept/revoke RPCs, `/accept-invite` page, dual-mode "Add user" dialog (0069).  
**Prior ship:** `hardening-2026-09-05` MERGED → `main` `8ec8c11` + Cloudflare prod deployed 2026-09-06 (0061–0065 + permission catalog + FIFO gate). Browser QA of that is still owed.  
**Gate:** 2767 tests / 335 files PASS · TypeScript PASS · ESLint (`--max-warnings 0`) PASS · Build PASS  
**Live accounting:** Trial Balance difference `R0.00` — byte-identical to pre-run baseline. GL 1200 `R1,478,853.74` = physical inventory valuation exactly. 247 JE / 928 lines / 0 unbalanced / 343 stock movements / 0 negative / 0 cross-company.  
**Latest applied migrations:** `0065_secure_company_onboarding` — APPLIED + LIVE-VERIFIED 2026-09-06 (1 RPC + 1 replaced trigger fn + 1 new trigger fn/trigger + grant revokes; zero DDL on business tables, zero RLS policy changes, zero data rows). Prior: `0063` + `0064` (2026-09-05).  
**Normalized document line flag:** `NORMALIZED_DOCUMENT_LINES_ENABLED = true` — ACTIVATED 2026-09-05 (parity 340/340 clean, forward smoke test passed — see P3)  
**FIFO flag:** `FIFO_VALUATION_ENABLED = false` — unchanged; 0 live products on FIFO; gate re-confirmed unreachable  
**Permission catalog:** 18 features (9 M11 + 9 new via 0064); route gates on every Sales/Purchasing/Banking/Assets/Tax/Compliance/Periods/Audit route; representative action gates; `user_roles` still 0 → no lockout (admin/superuser bypass)  
**User management (0065):** the admin "Add existing user to company" flow — previously a silent RLS no-op — now runs through the `add_existing_user_to_company` SECURITY DEFINER RPC (validated, concurrency-safe, controlled errors, never 0-row-success). DB-level admin self-lockout protection (can't self-demote / self-suspend; superuser + direct-DB recovery preserved). `user_roles` company-integrity trigger (a company-scoped role can only go to a user actually in that company). Security advisors 88→87 WARN / 0 ERROR.

## STATUS THIS RUN — read first

- **2026-09-06 — SUPERUSER → VERTEX PLATFORM ADMINISTRATION CONSOLE (migration 0070 + 0070b/c) DONE.**
  Branch `superuser-platform-console-2026-09-06` (off `main` after the commercial-foundation merge
  `347eae7`). `main` untouched, NOT merged, NOT deployed. The sparse single-screen Superuser page is
  replaced by a full platform-admin console at `/admin/superuser/*` — sidebar (Overview / Clients /
  Subscriptions / Users / Invitations / Security & Audit / Platform), Client Detail with 6 tabs.
  **Privacy boundary enforced**: no customer accounting data (GL, invoices, balances, payroll, tax) —
  config *health* (counts/booleans) only. Migration 0070: `companies` + suspension metadata;
  `get_my_company_id()` now returns NULL for a suspended-company member (client-suspension enforcement
  — every company-scoped RLS clause then denies); `my_workspace_suspended()` + a RouteGuard
  "workspace suspended" screen; `set_company_suspended()` (superuser-only, audited, deletes nothing);
  `audit_log_entries` superuser SELECT policy; `superuser_set_subscription_plan/_status()` (audited
  manual override, `provider='manual'` marker); `superuser_set_member_access` / `_remove_member` /
  `_assign_role` / `_unassign_role` / `_create_company_invitation` / `_revoke_company_invitation`;
  **`bookkeeper` fine-grained SYSTEM role** (54 grants; NO user_management / audit / period-close /
  tax:post — `profile_role` enum UNCHANGED, NOT mapped to Accountant); `platform_admin_metrics()` /
  `_company_users()` (incl. last sign-in) / `_client_setup()`. All guards use `IS DISTINCT FROM
  'superuser'` (a NULL role is blocked, not bypassed). Live behaviour proven rollback-wrapped
  (suspend/reactivate, NULL-gate, demo unaffected, plan override + events + audit, member admin,
  non-superuser rejections). Gate: **2854 tests / 345 files** PASS · tsc PASS · ESLint PASS · Build
  PASS. Advisors **0 ERROR** (+10 WARN, same `authenticated_security_definer_function_executable`
  class the invitation RPCs already carry). Live accounting byte-identical (TB `R0.00`, GL 1200
  `R1,478,853.74`, 247 JE / 343 movements). **PARTIAL/deferred**: grouped effective-permissions
  explorer on User Detail, support-access mode (designed not built), Paystack billing surface
  (placeholder). Doc: `docs/SUPERUSER_PLATFORM_ADMIN.md`. **Superuser browser QA owed.**
- **2026-09-06 — USER MANAGEMENT / ONBOARDING SECURITY FIX (migration 0065) DONE.** The admin
  "Add existing user to company" flow was a silent no-op (RLS filtered the companyless target row
  out of the plain `UPDATE profiles` before the update policy could act). Fixed with the
  `add_existing_user_to_company` SECURITY DEFINER RPC (caller from `auth.uid()`, every precondition
  validated, `FOR UPDATE` concurrency lock, controlled errors, never 0-row-success, in-transaction
  audit). Also: DB-level admin self-lockout protection in `protect_profile_privileged_columns`
  (can't self-demote/self-suspend; superuser + direct-DB recovery preserved), and a
  `user_roles_company_integrity` trigger (company-scoped role → only a user in that company). 14
  rollback-wrapped RLS scenarios all PASS. Gate: 2767/335 green. Advisors 88→87 WARN / 0 ERROR.
  Live accounting byte-identical. **MERGED → `main` `8ec8c11` + Cloudflare prod deploy (auto, from `main`) 2026-09-06**, on explicit user instruction ahead of browser QA.
- **CORE COMPLETE (2026-09-05):** normalized document lines activated · app-wide permission catalog + route enforcement + representative action enforcement + Financial-Periods self-lockout guard · FIFO gate re-confirmed · final accounting gate green · live accounting byte-identical to baseline.
- **HUMAN QA REQUIRED:** browser QA of the branch (§P1) — now also (a) a role-based click-through of the new permission gates (viewer / stock_controller / sales_manager / finance_manager / accountant / admin) and (b) the existing-company onboarding flow: sign up a second account → admin adds it via **Add user** → confirm it appears, then assign an access level + a fine-grained role. No browser tooling in this environment.
- **POST-V1:** exhaustive per-button action gating on banking/assets/tax/compliance + document detail pages (post/reverse/void) · jsonb `line_items` warehouse enrichment from posted movements · normalized-line reader migration · Accounting Settings (Block C) · FIFO persistence · multi-currency.

---

## 1. WHERE WE STAND

Vertex Accounting is now in **completion / production-hardening**, not core-engine construction.

The full system audit covered **128 routes across 17 feature domains**. The major accounting engines are real and operational: Sales/Fulfilment, Purchasing, Inventory, Banking/Reconciliation, General Ledger, Fixed Assets, Payroll, Tax, Reporting/Forecasting, Compliance, Related Parties, FX infrastructure, Leases, Administration, and Settings.

Current maturity is approximately **90%+ of the intended core product**. Remaining work is concentrated in production correctness, permissions, normalized-line activation, a small amount of accounting/settings hardening, browser QA, and optional post-v1 enhancements.

**FINAL CORE HARDENING progress (2026-09-05):** builds on the earlier Block A/B run (0061 return-aware fulfilment, FIFO gate, 0062 SO→invoice projection — all live). This run: (1) **normalized document lines ACTIVATED** — migration `0063` corrected 58 seed-written stray `warehouse_id` values, live parity swept 340/340 clean, rollback-wrapped forward-write smoke test passed, `NORMALIZED_DOCUMENT_LINES_ENABLED` flipped to `true`; (2) **app-wide permission catalog** — migration `0064` added 9 features / 38 permissions / 86 role grants under the brief's APPROVED policy, with `<PermissionRoute>` route gates on every Sales/Purchasing/Banking/Assets/Tax/Compliance/Periods/Audit route, representative `useCanAccess()` action gates, and a Financial-Periods self-lockout guard; no `user_roles` write (no lockout — admin/superuser bypass); (3) **FIFO gate re-confirmed** unreachable; (4) **final gate green** (2739/332, tsc/eslint/build); (5) **live accounting byte-identical** to baseline (TB 0.00, GL 1200 = physical inventory R1,478,853.74). Browser QA + role-based click-through: still REQUIRED (no browser tooling here). `main` unchanged at `f7ec377`; all code on `hardening-2026-09-05`, all migrations live, NO production deploy.

Do **not** reopen completed phases unless a verified regression requires it.

---

## 2. COMPLETED

### Core accounting and inventory

- Phases 0–8 + 9A complete.
- Phase 9B normalized document-line projection tables complete, backfilled, parity-checked.
- Immutable double-entry accounting engine in place.
- GL / Chart of Accounts / Journals / Trial Balance / Financial Periods complete.
- Inventory WAC accounting, movements, warehouses, stock takes, adjustments, transfers, supplier returns, opening stock and reporting complete.
- GL 1200 physical inventory reconciliation operational.
- Account company-safety hardening migration applied with zero live violations.

### Sales and fulfilment

- Quotes.
- Sales Orders.
- Stock commitments.
- Partial invoicing.
- Delivery Notes.
- Return Notes for delivered-but-uninvoiced goods.
- Invoices.
- Credit Notes.
- Customer Receipts.
- Customer Deposits / account 2600.
- Historical/frozen-cost return handling where evidence exists.
- Credit Note original invoice-line picker.
- Global document traceability and canonical full-page routes.

### Purchasing

- Suppliers/vendors.
- Purchase Orders.
- Goods receipt / GRNI flow.
- Bills.
- Supplier payments.
- Vendor aging.
- Real GL posting and reconciliation.

### Banking

- Bank accounts.
- Statement import.
- Split allocation with VAT handling.
- Bank reconciliation.
- Reconciliation intelligence / books-integrity investigation.

### Tax and compliance

- VAT201.
- Income Tax.
- Capital Gains.
- Dividends Tax.
- Provisional Tax.
- Deferred Tax.
- Expected Credit Losses.
- Public Interest Score / audit-review determination.
- Reporting-framework suggestion.
- Related Parties register.
- FX infrastructure/calculator.
- IFRS 16 lease accounting.

### Fixed assets and payroll

- Draft → capitalize → depreciate → dispose asset lifecycle.
- Straight-line / reducing-balance depreciation.
- Bill-line capitalization.
- SARS wear-and-tear tax register.
- Payroll employees / runs / EMP201 / EMP501.
- PAYE / UIF / SDL engines for current configured tax year.

### Reports and forecasting

- Income Statement.
- Balance Sheet.
- Cash Flow.
- Customer Aging.
- Supplier Aging.
- Budget vs Forecast vs Actual.
- Variance / Variance %.
- 6-month / 12-month views.
- Recharts graphics.
- Deterministic evidence-backed variance causes.
- Drill-down from variance to accounting evidence.
- Financial-advisor print/export report using current print/export framework.

### UX / architecture

- Record-detail full-page migration complete, including Journal Entry.
- Global Select migration completed for primary transaction UX.
- Global Search extended across major document types.
- A4 business-document framework and company profile complete.
- Audit Trail and Access Log real and populated.

---

## 3. ACTIVE — DO NEXT

### P0 — APPLY MIGRATION 0061 — PRODUCTION CORRECTNESS ✅ DONE (2026-09-05)

**Status:** APPLIED + LIVE-VERIFIED (registered `20260905132351`).  
**What was proven live (rollback-wrapped, zero persistence):**
- Scenario A — SO 10 → DN 6 → RN 2 uninvoiced → a **second DN of 6 SUCCEEDS**, remaining → 0; a 3rd delivery correctly rejected.
- Scenario B — SO 10 → DN 6 → RN 2 → direct invoice 3 succeeds (physical fulfilled 7, remaining 3); an over-invoice of 4 correctly rejected with `"6 already delivered, 2 already returned, 3 already directly invoiced"`; the exact remaining 3 accepted.
- Scenario C — two DNs (4 + 3) + one RN (1) net to remaining 4 with no double-count; over-delivery of 5 rejected, exact 4 accepted.
- Accounting: every delivery-note / return-note journal line touches ONLY GL 1200 / 1220 — no revenue, VAT, AR or COGS. Frozen delivery cost is re-used by the return.
- `security invoker` + `search_path=public` + `authenticated`-only grants preserved; `public`/`anon` revoked.

Trial Balance, GL 1200 (= physical inventory exactly), GL 1220, stock-movement count, negative-stock and unbalanced-journal counts all **unchanged** after apply.

_(Original P0 problem statement retained below for the record.)_

**Severity:** was HIGH PRIORITY / current production inconsistency  
**Schema impact:** none; replaces existing RPC/function logic  
**Expected accounting impact:** none beyond allowing valid fulfilment flow

#### Problem

The UI now correctly nets Return Notes when calculating remaining fulfilment, but the live DB RPCs still use the pre-return formula.

Worked example:

- SO ordered = 10
- Delivery Note delivered = 6
- Return Note returned uninvoiced = 2
- Net delivered = 4
- Remaining to deliver should = 6

The UI shows 6 remaining, but the live DB can reject the second delivery because `post_delivery_note` / `create_invoice_from_sales_order` still use the older formula.

#### Required action

1. Read-only preflight.
2. Reconfirm migration 0061 exact diff and test coverage.
3. Apply migration 0061 to the intended Supabase project.
4. Run rollback-wrapped/live-safe worked example proving 10 → 6 → return 2 → redeliver 6.
5. Verify no double-counting with direct invoices.
6. Verify GDN-I reconciliation nets Return Notes.
7. Recheck Trial Balance, GL 1200, GL 1220, stock movement count, negative stock and unbalanced journals.
8. Update docs after live verification.

**DONE when:** UI and DB use the same return-aware fulfilment formula and the full scenario succeeds without accounting drift.

---

### P1 — HUMAN BROWSER QA OF CURRENT PRODUCTION

**Status:** REQUIRED  
**Reason:** Recent major features are automated-test and DB verified, but not fully human browser tested.

Priority QA areas:

- Sales Order commitment / remaining-to-deliver / remaining-to-invoice.
- Delivery Note create/post/print/invoice.
- Return Note create/post/print/redelivery effect.
- Credit Note original-line picker and return quantities.
- Forecasting tables, charts, drill-down, 6/12-month filters and print report.
- Journal Entry full-page record and reversal/source display.
- Inventory product detail, committed/on-hand/available, movement links.
- Global Search for Invoice/Bill/Quote/SO/PO/DN/RN/CN/JE.
- Desktop/tablet/mobile layouts.
- Print output for Invoice, Delivery Note, Return Note and Forecasting report.
- **Permission gates (new — migration 0064):** sign in as (or assign a test user) each of `viewer`, `stock_controller`, `sales_manager`, `finance_manager`, `accountant`, `admin`. Confirm: viewer sees read-only everywhere and no create/post buttons; stock_controller can post a Delivery/Return Note but has no "New credit note" / "Record payment" / period-close; sales_manager works Quotes→SO→CN but cannot open Banking/Tax; finance_manager can open everything but sees no mutation buttons; accountant has the full operational set but not Users & Roles; admin/superuser unaffected. Direct-URL navigation to a gated route the role lacks shows Access Denied, not the page.
- **Existing-company onboarding (new — migration 0065):** from a second browser/incognito, sign up a fresh account (`/signup`) and stop at onboarding. As the company admin, `/admin/users` → **Add user** → type that exact email → **Look up** → **Add to company**. Confirm the dialog closes, the user appears in the list, and (before 0065 this silently did nothing) a page refresh still shows them. Then set their access level and assign a fine-grained role. Negative checks: adding an email that isn't a pending signup shows "No unassigned signup"; the admin's own access-level selector + Suspend button stay disabled for their own row.
- **Normalized-line flag (now `true`):** create + edit one Invoice, Bill, PO and Credit Note through the running app and confirm the document renders, prints, and appears in search exactly as before (jsonb stays authoritative; the normalized rows are a silent dual-write).

Record all visual defects into one consolidated batch. Do not create one phase per visual issue.

---

### P2 — APPLICATION-WIDE PERMISSIONS ROLLOUT ✅ CORE DONE (2026-09-05)

**Status:** APPROVED (FINAL CORE HARDENING brief) + APPLIED. Migration `0064_core_permission_catalog_extension` live: 9 new features (`sales_documents`, `fulfilment`, `purchasing`, `banking`, `assets`, `tax`, `compliance`, `financial_periods`, `audit`), 38 permission rows, 86 role grants. `permissionRouteMap.ts` + `router.tsx` `<PermissionRoute action="read">` on every previously-ungated core route. Action gates on the primary create/record controls of Quotes/SO/CN/Receipts/PO/Bills/Payments + Financial-Periods manage/self-lockout. Tests: `permissionCatalogHardening.test.ts` (36) + FinancialPeriodsPage gate tests.  
**No lockout:** `user_roles` = 0, only functional users are admin+superuser (bypass), 4 viewer profiles have no company. Migration writes zero `user_roles` / zero `profiles` changes. See `docs/PERMISSIONS.md` § "Ungated areas — CLOSED".  
**RLS / tenant isolation:** UNCHANGED. 0064 is catalog data only — no policy, no `ALTER TABLE`. RLS keyed off `profiles.role` stays the only DB boundary.  
**Remaining (POST-V1):** exhaustive per-button gating on banking/assets/tax/compliance + detail-page post/reverse/void controls — route `:read` gates already block every role lacking read; residual is a read-only role seeing a mutation button that then hits RLS (defense-in-depth). Continues with human QA.

_(original problem statement retained below for the record.)_

**Was:** STOPPED FOR PRODUCT APPROVAL.  
**Severity:** MEDIUM  
**RLS / tenant isolation:** existing company RLS remains separate and must not be weakened.

#### Live evidence gathered this run

- **6 system roles** (no custom roles): `accountant`, `employee`, `finance_manager`, `sales_manager`, `stock_controller`, `viewer`. Plus the coarse `profiles.role` — `admin` / `superuser` always get full access (`useCanAccess()` bypass — a UI block on them would be theatre, RLS already grants them everything).
- **9 permission features**, 35 permission rows, 71 role→permission grants: `customer_management`, `dashboard`, `gl`, `inventory`, `invoicing`, `payroll`, `reports`, `supplier_management`, `user_management`. No feature exists for **purchasing**, **non-Invoice sales documents**, **banking**, **assets**, **tax**, **compliance / related-parties / FX / leases**, **financial_periods**, or the **audit pages** / **settings**.
- Live `user_roles` = **0 assignments**. Live `profiles.role` = `viewer` ×4, `admin` ×1, `superuser` ×1. So the 4 viewer accounts currently reach every ungated page freely; adding + route-gating new features would REMOVE that access with no fine-grained grant to restore it — the exact lockout the decision rule forbids acting on by guesswork.

#### PROPOSED default matrix — approve / edit, then a single additive migration + gating pass implements it

Full grid in **`docs/PERMISSIONS.md` § "PROPOSED (NOT APPLIED) — Block B permission-catalog extension"**. Summary, mapped to the REAL role names:

| New feature | `viewer` | `employee` | `sales_manager` | `stock_controller` | `finance_manager` | `accountant` | `admin`/`superuser` |
|---|---|---|---|---|---|---|---|
| `sales_documents` read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (bypass) |
| `sales_documents` create/update/delete | — | — | ✔ | — | — | ✔ | ✔ |
| `sales_documents` post *(confirm SO / post DN / RN / issue CN)* | — | — | ✔ | ✔ *(DN/RN only)* | — | ✔ | ✔ |
| `sales_documents` export | ✔ | — | ✔ | — | ✔ | ✔ | ✔ |
| `purchasing` read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `purchasing` create/update/delete | — | — | — | ✔ | — | ✔ | ✔ |
| `purchasing` post *(confirm PO / post Bill / record Payment)* | — | — | — | — | — | ✔ | ✔ |
| `purchasing` export / import | export ✔ | — | — | ✔ | export ✔ | ✔ | ✔ |
| `banking` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `banking` create/update/delete + reconcile | — | — | — | — | — | ✔ | ✔ |
| `assets` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `assets` create/update/delete + post *(capitalize / depreciate / dispose)* | — | — | — | — | — | ✔ | ✔ |
| `tax` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `tax` create/update + post | — | — | — | — | — | ✔ | ✔ |
| `compliance` read *(incl. related parties, FX, leases)* | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `compliance` update *(register entries, framework override, run amortization)* | — | — | — | — | — | ✔ | ✔ |
| `financial_periods` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `financial_periods` manage *(open / soft-close / close / lock / reopen)* | — | — | — | — | — | ✔ | ✔ |
| `audit` read *(Access Log + business Audit Trail)* | — | — | — | — | ✔ | ✔ | ✔ |

Every grant mirrors the role's EXISTING shape (e.g. `sales_manager` already has full `invoicing` CRUD → gets the same on `sales_documents`; `stock_controller` already owns `inventory` → gets purchasing CRUD + the two physical-stock post actions but not accounting posts; `finance_manager` is read+export everywhere; `viewer` reads everything, matching its current all-`:read` grant; `employee` stays minimal). One open policy question flagged: **should `stock_controller` be able to POST a Delivery Note** (a real "ship the goods" action)? — proposed YES, needs an explicit call.

#### Engineering after approval

1. Inventory all feature/action permissions.
2. Extend permission catalog in one additive migration.
3. Seed safe role grants without locking current users out.
4. Route-level gating.
5. Action-level gating.
6. Service-level enforcement where architecture supports it.
7. Self-lockout protection.
8. Tests by representative role.
9. Verify RLS remains tenant boundary independent of UI permissions.

**DONE when:** every sensitive route/action has an explicit, tested permission policy and existing authorized users retain correct access.

---

### P3 — NORMALIZED DOCUMENT LINES: ✅ ACTIVATED (2026-09-05)

**Status:** `NORMALIZED_DOCUMENT_LINES_ENABLED = true` on branch `hardening-2026-09-05`. Controlled activation procedure executed in full — flag-off-window scan (nothing needing re-backfill), read-only parity sweep (found + corrected 58 seed-written stray `warehouse_id` values via migration `0063`), re-verified 340/340 lines MATCH with zero orphans/dupes/count-mismatches/cross-company, rollback-wrapped live forward-write smoke test of `create_invoice_from_sales_order(p_project_lines := true)` (exact field-for-field parity, 0 persisted), then flipped. Full detail: `docs/PHASE_9B_DESIGN.md` § 4c.  
**What the flag gates:** the WRITE side only (`SupabaseDocumentLineProjector` dual-write + the RPC's `p_project_lines`). NO reader consults the normalized tables yet, so jsonb `line_items` stays authoritative and every report/search/print path is unchanged.  
**Rollback (no data loss):** flip back to `false` — dual-write stops, jsonb untouched, any normalized rows written while `true` are inert. Migration 0063 independently reversible (re-set `warehouse_id` on 58 seed line ids — list in the migration's `raise notice` + `docs/KNOWN_ISSUES.md`). `line_items` NOT dropped this release or next.  
**Deferred:** enriching jsonb `line_items[].warehouseId` from the posted `stock_movements` (which confirm the warehouse) instead of nulling the projection — an explicit data-quality call, not taken here. Normalized-line reader migration (reports/search read `*_lines` instead of jsonb) is separate future work.

_(original state retained below for the record.)_

**Was:** SO→Invoice RPC blocker RESOLVED (migration `0062`), forward parity proven live, flag still off.

#### What was done

- **Writer audit:** every runtime path that creates/updates a normalized-lined document was traced. Standalone Invoice create/edit, Bill (standalone + from-PO), Purchase Order create/update, Credit Note create/update (+ `originalInvoiceLineId`) all already route through their TS service and the flag-gated `SupabaseDocumentLineProjector` — **the ONLY bypass was `create_invoice_from_sales_order`** (partial-SO invoicing + delivery-linked invoicing — both go through the same single RPC call in `RpcSalesOrderDraftInvoiceWriter`). No other RPC inserts into `invoices`/`bills`/`purchase_orders`/`credit_notes` directly.
- **Fix (migration 0062):** the RPC gains an OPT-IN `p_project_lines boolean` param and, when true, does an **atomic** `insert into invoice_lines` from the SAME `v_new_lines` array it writes to the jsonb `line_items` — no second calculation, `id` preserved from the line, 1-based `line_number`, stale FK refs → NULL (the 0042 backfill's own defensive pattern). It runs inside the SAME function transaction as the invoice insert, so there is **no path where the invoice is created but its lines silently are not**. `RpcSalesOrderDraftInvoiceWriter` passes `NORMALIZED_DOCUMENT_LINES_ENABLED` — the RPC dual-write turns on/off with the SAME single flag as the TS projector.
- **Forward-write parity proven LIVE** (rollback-wrapped, zero persistence):
  - `p_project_lines = false` → writes **zero** `invoice_lines` (byte-identical to pre-0062).
  - `p_project_lines = true`, DIRECT selection → `invoice_lines` match `line_items` jsonb **exactly**: count + every field (`line_number`, `description`, `quantity`, `unit_price`, `tax_amount`, `line_total`, `product_id`, `warehouse_id`, `tax_rate_id`) + `id` + `company_id`.
  - `p_project_lines = true`, DELIVERY-LINKED selection → same exact parity.
  - No duplicate ids, no orphans.
- **Tests:** new `src/repositories/salesOrderInvoiceProjectionMigration.test.ts` (11 tests — static-SQL contract + a structural-parity arithmetic proof); `salesOrderDraftInvoiceWriter.test.ts` updated to assert `p_project_lines` is passed.

#### Remaining before the flag flips (a separate, controlled change)

1. Run a fresh full backfill (0042-style) for any invoice/bill/PO/credit-note **created or edited during the flag-off window** (today: none live since the 2026-09-02 seed — but re-check at flip time).
2. Run `DocumentLineParityChecker` against the live DB with the privileged client → expect zero findings.
3. Flip `NORMALIZED_DOCUMENT_LINES_ENABLED = true` in its own commit; deploy; monitor.
4. JSONB `line_items` stays authoritative and is NOT removed in the same release.

**DONE when:** the flag is flipped, parity is zero-findings live, and the app has run for a period reading `invoice_lines` with no divergence.

---

### P4 — FIFO SAFETY ✅ GATED (2026-09-05)

**Status:** DONE for v1 — FIFO can no longer be newly selected.  
**Live check:** 50/50 products are `weighted_average`, **0 on `fifo`** — so the gate changes nothing for any live product, zero accounting impact, no migration needed.

#### What was done

- New `FIFO_VALUATION_ENABLED = false` flag (`src/config/featureFlags.ts`), same one-time-flip shape as the normalized-lines flag.
- `ProductForm` hides the FIFO option unless the flag is on OR the product being edited is already `fifo` (grandfather — none exist); the field description now names Weighted Average Cost as the supported method.
- `ProductService.createProduct` / `updateProduct` **reject** a new switch to `fifo` at the service layer (`"FIFO valuation is not available yet…"`) so the UI gate cannot be bypassed by a direct call. A product already on `fifo` can still be edited in other respects and switched back to WAC.
- 8 new regression tests in `productService.test.ts` (create rejects fifo, update rejects the switch, grandfather + switch-back allowed, flag-ships-off assertion).
- The FIFO lot-walking **engine** (`stockLotService`, `InventoryPostingAdapter` FIFO branches) is UNTOUCHED and still tested — only the selection path is gated.

#### Future optional action

Build:

- `stock_lots` schema
- SupabaseStockLotRepository
- FIFO allocation engine persistence
- migration/backfill strategy
- valuation/reconciliation tests

Do not build FIFO now unless it is an explicit product requirement.

---

## 4. IMPORTANT PRODUCT-COMPLETION WORK AFTER P0–P4

### Accounting Settings — currently link-hub / incomplete

Build a real settings model for:

- Document numbering prefixes/sequences.
- Rounding rule / precision policy.
- Default sales account mapping.
- Default expense account mapping.
- Default bank account mapping.
- VAT basis setting only if the accounting/tax requirements are explicitly approved.

Central document numbering needs service/database uniqueness and concurrency safety. Avoid per-page ad hoc numbering.

### Correction / reversal framework

Audit one-way posted workflows:

- Income Tax computations.
- Deferred Tax.
- ECL.
- Payroll runs.
- Depreciation runs.

Immutable accounting remains correct; correction should be reversal + repost, not mutation.

Create a shared pattern where practical rather than five unrelated mechanisms.

### Payroll completion candidates

- Payslip generation.
- IRP5 generation.
- Net Pay Payable settlement / mark-paid workflow.
- Configurable SARS tax-year settings.
- Retirement-fund PAYE deduction cap/rules.

These are important if Vertex is marketed as full payroll, but do not block the current core accounting release unless scope requires them.

### Financial statement completion candidates

- Statement of Changes in Equity.
- Notes to Financial Statements.
- Professional export/PDF for classified statements.

---

## 5. KNOWN GAPS — NON-BLOCKING / POST-V1 CANDIDATES

### Purchasing

- Partial PO goods receipt not yet modeled; current receipt is all-or-nothing.
- PO→Bill purchase-price variance flow not separately modeled because current Bill-from-PO path copies PO lines.

### Inventory

- Inventory Reconciliation Section F movement-source evidence completeness is still not fully resolved (honest `Not run` state on the report, not a fabricated pass).
- Real FIFO persistence deferred; **the UI + service are now gated** (`FIFO_VALUATION_ENABLED = false`) so FIFO cannot be newly selected — `MockStockLotRepository` stays wired but is unreachable via the product forms.

### GL

- Journal Entry source is plain text; no universal reverse FK from JE back to originating document.

### Tax

- Income Tax / Deferred Tax / ECL lack correction/reversal path.
- SBC eligibility and dividend allocation remain manual because there is no shareholder register.

### Payroll

- No IRP5/payslip generation.
- No payroll settlement step.
- No in-app next-year SARS configuration.

### Reports

- No Notes to Financial Statements.
- No Statement of Changes in Equity.
- Classified financial-statement PDF/export polish remains.

### Foreign Exchange

FX infrastructure exists, but transactional entities do not yet support a transaction currency distinct from ZAR.

### Related Parties

Manual register only; no automatic relationship detection or enforced Invoice/Bill links.

### Compliance

Current-year view only; historical compliance trend is deferred.

### Deferred by design

- Multi-company-per-login / tenant switching in Vertex.
- Role-based approval workflows.
- Suspense account workflow.
- Full document/attachment management platform.
- Central Reconciliation Centre across Banking + AR/AP + Compliance.
- In-app notifications backend.

These are roadmap items, not blockers for current accounting correctness.

---

## 6. DATABASE / ACCOUNTING SAFETY RULES

For all remaining work:

- Inspect first.
- Read-only live verification before migrations.
- No casual production service-layer writes.
- No test/demo records in live DB unless explicitly approved and rollback-proven.
- No posted-accounting mutation.
- Reversal instead of mutation for posted accounting corrections.
- No historical cost fabrication.
- No force push.
- Keep company isolation and RLS intact.
- Re-run Trial Balance and affected GL reconciliations after accounting changes.

Standard gate:

```bash
npm run type-check
npm run lint -- --max-warnings 0
npm run test
npm run build
```

---

## 7. FINITE ROADMAP TO FINISH CURRENT VERTEX RELEASE

### BLOCK A — Production correctness + browser QA

- ✅ Apply/verify migration 0061.
- ✅ Gate unsupported FIFO.
- ⏳ Human browser QA of recent production features — STILL REQUIRED (checklist in §P1; no browser tooling in this environment).
- ⏳ Batch-fix visual/UX defects — after browser QA.

**Definition of DONE:** no known production correctness bug ✅; unsupported valuation method cannot be selected ✅; current live features visually verified ⏳.

### BLOCK B — Permissions + normalized-line activation ✅ CORE DONE (2026-09-05)

- ✅ Permission matrix APPROVED (FINAL CORE HARDENING brief) + APPLIED (migration 0064).
- ✅ App-wide permission catalog + route enforcement + representative action enforcement + Financial-Periods self-lockout guard + no-lockout transition (zero `user_roles` writes).
- ✅ Fix `create_invoice_from_sales_order` normalized projection (migration 0062).
- ✅ Forward-write parity testing (live, rollback-wrapped — direct + delivery-linked, exact).
- ✅ Controlled normalized-line flag activation — migration 0063 parity correction, 340/340 clean, forward smoke test, flag flipped.
- ✅ **User management / onboarding security fix (migration 0065, 2026-09-06)** — `add_existing_user_to_company` RPC replaces the silently-no-op plain UPDATE; DB-level admin self-lockout protection; `user_roles` company-integrity trigger; 0016 grant regression on `protect_profile_privileged_columns` re-closed. 14 rollback-wrapped RLS scenarios PASS; advisors 88→87 WARN / 0 ERROR.
- ⏳ POST-V1: exhaustive per-button action gating on banking/assets/tax/compliance + detail pages.

**Definition of DONE:** explicit permissions across sensitive modules ✅ and normalized relational document lines active as a dual-write with a documented rollback ✅.

### BLOCK C — Accounting product hardening

- Real Accounting Settings.
- Central numbering/rounding/account mappings.
- Shared reversal/correction pattern for one-way accounting workflows.
- Prioritized payroll/reporting completion items.

**Definition of DONE:** remaining core operational policies are configurable and posted calculations can be corrected through auditable reversal.

### BLOCK D — Final release QA

- Full role-based QA.
- Full accounting invariant sweep.
- Mobile/responsive/print QA.
- Security-advisor review.
- Documentation cleanup.
- Production release confirmation.

**Definition of DONE:** no unresolved core blocker, green gate, balanced accounting, human QA completed, docs current.

---

## 8. NEXT

P0 (0061), P2 (permission catalog → 0064), P3 (normalized lines → 0062/0063 + flag flip), P4 (FIFO gate) and the **user management / onboarding security fix (0065)** are all **DONE**, and `hardening-2026-09-05` is **MERGED → `main` `8ec8c11` + deployed to Cloudflare prod** (2026-09-06, on explicit user instruction ahead of QA).

What remains — now **post-deploy**:

1. **Human browser QA** against `https://vertex-accounting.pages.dev` (§P1 checklist) — role-based click-through of the permission gates (viewer / stock_controller / sales_manager / finance_manager / accountant / admin); the existing-company onboarding flow end to end (§P1 "Existing-company onboarding"); confirming existing documents still render/print/search identically with the normalized-line flag on. Then batch-fix any visual defects in a follow-up branch.
2. Block C (real Accounting Settings, shared reversal/correction pattern) + the POST-V1 items.

Then Block C (real Accounting Settings, shared reversal/correction pattern) as one block, and the POST-V1 items listed in "STATUS THIS RUN". Do not add unrelated new features until the above are resolved.
