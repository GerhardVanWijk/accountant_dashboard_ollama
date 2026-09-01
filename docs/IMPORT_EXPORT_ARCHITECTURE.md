# SHARED IMPORT / EXPORT / PRINT FRAMEWORK — ARCHITECTURE

**Status:** Phase 6 (import) — **COMPLETE**, approved at Review 6. Phase 7
(print/export) — **COMPLETE**, awaiting Review 7. Two sibling, independently-built
engines under `src/features/import/` and `src/features/export/` — import has five
real adapters (Inventory Products, Opening Stock, Stock Take Counts, Customers,
Suppliers); export/print is a generic `ExportDataset`/`ExportColumn` model plus a
shared `ExportMenu` + `PrintableReport` pair, wired into every surface Phase 7 §9–15
named. Nothing Inventory-specific lives in either engine — Inventory is simply the
first (and largest) consumer of both.
**Parent:** `docs/INVENTORY_ACCOUNTING.md` for the Inventory-module accounting
boundaries these frameworks must never cross.

---

# PART A — IMPORT (Phase 6)

## 0. What existed before this phase (audit)

- `features/banking/utils/statementParsers.ts` — real CSV/OFX/QFX/QIF/MT940 parsers,
  but **bank-statement-specific**: fixed column semantics (date/description/amount or
  debit+credit), no column mapping, no XLS/XLSX. Its quoted-field CSV line parser
  (`parseCsvLine`) is the one piece of genuinely reusable logic — re-implemented as an
  independent copy in `parsers/csvParser.ts` rather than imported, since taking a
  dependency on a banking-domain module from a generic framework would be backwards.
- `features/banking/components/StatementImportWizard.tsx` — a real stepped wizard
  (`FormShell`/`FormHeader`/`FormBody`, file input → preview → confirm → done) that
  supplied the *visual language* `ImportWizard.tsx` follows, but it drives exactly one
  hard-coded flow (`useStatementImport`), not a pluggable one.
- No XLS/XLSX support anywhere — no SheetJS/`xlsx`/`exceljs` dependency existed.
- No column-mapping UI, no generic row-validation model, no duplicate-detection
  abstraction, no import audit trail anywhere in the codebase.
- No prior customer/supplier/product import attempt of any kind — every one of those
  five adapters is new.

**Gap this phase fills:** everything except the parser-level string handling and the
wizard's visual idiom, both of which were reused rather than rebuilt.

## 1. Pipeline

```
Select import type → Upload file → Parse → Select worksheet (if multi-sheet)
  → (adapter target, if needed) → Map columns → Validate + duplicate detection
  → Review → Confirm → Execute → Result
```

Implemented as `WizardStep` in `hooks/useImportWizard.ts`:
`'type' | 'file' | 'worksheet' | 'target' | 'mapping' | 'review' | 'result'`. The
`'type'` step is skipped when only one adapter is passed in (a page's own "Import"
button already knows what it imports); `'worksheet'` is skipped for CSV or a
single-sheet workbook; `'target'` only exists for an adapter that declares
`confirmFields` (today, only Stock Take Counts — "which frozen stock take").

The five concerns spec §2 asks to be kept separate are separate **files**, not just
separate steps:

| Concern | File |
|---|---|
| File parsing | `parsers/csvParser.ts`, `parsers/spreadsheetParser.ts`, `parsers/fileParser.ts` |
| Column mapping | `mapping.ts` |
| Validation / normalization | `normalize.ts` + each adapter's `normalizeRow()` |
| Import execution | each adapter's `execute()` |
| Result reporting | `ImportWizard.tsx`'s Result step + `errorReport.ts` |

No business posting logic lives in the parser or the wizard — both are 100% generic;
every rule (WAC protection, PPV, "never overwrite `expectedQty`", bank-detail
immutability, …) lives in one adapter file.

## 2. File formats + libraries

- **CSV** — hand-rolled parser (`parsers/csvParser.ts`), the same quoted-field state
  machine `statementParsers.ts` uses. No new dependency.
- **XLS / XLSX** — [SheetJS `xlsx`](https://www.npmjs.com/package/xlsx) `^0.18.5`, the
  only maintained npm package for this (SheetJS's own patched builds since are only
  distributed from their CDN, not npm). `parsers/spreadsheetParser.ts` reads with
  `cellDates: true` (a date-formatted cell becomes a real `Date`, not a serial number)
  and `raw: true` (a text-formatted cell — e.g. a SKU with leading zeroes — stays a
  string, never gets coerced through a number).

  **Known issue:** `npm audit` flags `xlsx@0.18.5` high-severity (prototype pollution +
  ReDoS, GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9), **no fix available** on the npm
  registry. Mitigated, not eliminated, by: `fileParser.ts`'s `MAX_IMPORT_FILE_BYTES`
  (10 MB) and `MAX_IMPORT_ROWS` (20,000) limits applied before parsing; formulas are
  never evaluated (only cached cell values are read — SheetJS doesn't execute anything
  regardless); every uploaded file is company-internal master data, never a
  Office-National or third-party file. Flagged here rather than silently accepted —
  worth a conscious decision (accept, pin an older/different version, or wait for a
  registry fix) rather than an assumption.

## 3. The adapter contract (`types.ts`)

```ts
interface ImportAdapter<TNormalized, TContext> {
  id, label, description;
  permission: { feature: string; action: string };      // gates the "Import type" card
  fields: ImportFieldDef[];                              // key/label/required/type/aliases
  loadContext(): Promise<TContext>;                       // reference data, loaded once
  confirmFields?(ctx): ImportConfirmField[];               // extra pre-mapping input, if any
  applyParams?(ctx, params): TContext;                     // folds confirmFields selections into ctx
  normalizeRow(raw, rowNumber, ctx): { normalized?, messages };
  detectDuplicates(rows, ctx): ImportRowResult[];          // pure — returns a new array
  execute(rows, ctx, options): Promise<ImportExecutionSummary>;
}
```

`useImportWizard` is the only thing that calls these five methods, in this order, and
never has any domain knowledge of its own. Adding a sixth import target — Price List
(spec §15, **not built** — see § Limitations) or anything else — is "write one adapter
file", not "extend the framework".

## 4. Column mapping (`mapping.ts`)

`suggestColumnMapping(headers, fields)` matches a spreadsheet header to a field's
`label` or one of its `aliases` **only on an exact match after normalizing** (lower-case,
strip everything but letters/digits) — never a fuzzy/partial match. A header that
doesn't exactly match anything is left unmapped, always shown to the user to fill in by
hand on the Mapping step (spec §5: "do not guess mappings silently if confidence is
low"). Two headers that both alias the same field resolve first-column-wins.

Alias catalogs are defined per-adapter (`PRODUCT_IMPORT_FIELDS` etc.) — every alias
list spec §5 specified (SKU/Item Code/Product Code/…, Cost/Cost Ex VAT/Unit Cost, …) is
implemented verbatim on the relevant adapter's `fields`.

## 5. Validation model (`types.ts` `ImportRowResult`)

```ts
interface ImportRowResult<T> {
  rowNumber;                    // 1-based, header = row 1 (matches the spreadsheet)
  raw: Record<string, cell>;    // post-mapping, pre-normalize
  normalized?: T;                // present only when normalizeRow() fully succeeded
  severity: 'valid' | 'warning' | 'error' | 'duplicate' | 'skipped';
  messages: { field?, message, severity: 'warning' | 'error' }[];
}
```

A row with an `error` message never gets a `normalized` value — `execute()` can't
accidentally act on it. A row that resolves an optional reference (category, supplier,
tax rate) to nothing gets a `warning` and still imports (spec's own worked examples:
"Category 'Cape Town' does not exist" reads as advisory, not fatal, for every field
except a hard foreign key an adapter genuinely cannot proceed without — SKU→product for
Opening Stock/Stock Take Counts is the one place an unresolved reference is always an
`error`, since there is nothing sensible to import against).

One bad row never aborts the file — `normalizeRow()` never throws; every adapter's
`execute()` iterates every row and records a per-row outcome even for `error` rows.

## 6. Duplicate handling

| Target | Natural key | Strategy offered |
|---|---|---|
| Products | SKU (case-insensitive) | skip / update / error |
| Customers | code, else email | skip / update / error |
| Suppliers | code, else name | skip / update / error |
| Opening Stock | — (see below) | n/a |
| Stock Take Counts | — (see below) | n/a |

A within-file repeat of the same key is always an **error** for Products (two rows
claiming to be the same SKU is a contradiction of master data, not a legitimate
scenario) and for Stock Take Counts (setting the same line's count twice in one file);
for Opening Stock, a repeated SKU+Warehouse pair is a **warning** only — the spreadsheet
legitimately might record two lots at different costs and both lines land on the draft.

**Opening Stock and Stock Take Counts never post twice by construction, not by
duplicate detection**, per spec §8's own framing:

- Opening Stock's `execute()` only ever creates a **new `draft`** batch — nothing an
  import does can post it. Running the same file twice creates two visible draft
  batches on the Opening Stock register; the user sees both and deletes the stray one
  before either is ever confirmed. The actual "can this post twice" guarantee is Phase
  5's own `openingStockBatchService.confirmBatch()` gate (`{ confirmed: true }` +
  `draft`-only), unchanged by this phase.
- Stock Take Counts writes `countedQty` via `stockTakeService.enterCounts()`, which is
  a plain overwrite of the SAME line by `lineId` — running the same file twice sets the
  same counts again, it doesn't create a second entry. The count is only ever the
  starting point for `postStockTake()`, itself already idempotent.

## 7. Inventory Product import (spec §9–10)

Fields (see `adapters/productImportAdapter.ts`'s `PRODUCT_IMPORT_FIELDS`): SKU\*,
Name\*, Barcode, Description, Category, Preferred Supplier, Supplier Item Code, Unit of
Measure, Selling Price\*, Cost Price, Reorder Level, Reorder Quantity, Preferred Stock
Level, Track Inventory, Active, Tax Treatment — every one a real field on `Product`
(`src/types/product.ts`); nothing invented. Category/Supplier/Tax Treatment resolve to
the real relational `categoryId`/`preferredSupplierId`/`taxRateId` by exact name match
— an unresolved reference never fabricates a new category/supplier/tax rate (spec: "do
not create duplicate free-text relationships").

**Accounting safety (spec §10):**
- `productService.createProduct()` always starts `quantityOnHand` at `0` — this adapter
  never sets it (the DTO doesn't even expose it), and never posts anything to the GL.
- **WAC protection:** updating an EXISTING product whose `quantityOnHand > 0` never
  changes `costPrice`, even if the spreadsheet carries a different value — the update
  patch substitutes the product's current `costPrice` and the row's outcome message
  says so explicitly ("cost price left unchanged … use a stock adjustment to revalue
  it"). A brand-new product (no stock, no history) may set `costPrice` freely. This is
  enforced in `productImportAdapter.execute()`, not left to the user to remember.

## 8. Opening Stock import (spec §11)

Fields: SKU\*, Warehouse\*, Quantity\*, Unit Cost\*. SKU must already exist (an unknown
SKU is an error — this adapter loads stock onto existing products, it never creates
them) and Warehouse must already exist (never auto-created). `execute()` builds every
valid row into ONE `openingStockBatchService.createOpeningStockBatch()` call —
`effectiveDate` defaults to today (there is no date column per spec's own field list;
the user adjusts it, if needed, on the draft afterwards, the same as any other field on
that batch) and the header `warehouseId` is the first line's warehouse. **No GL, no
stock movement, during import** — the created batch is `draft`; the existing Phase 5
Opening Stock workflow (preview → explicit confirmation checkbox → post) is the only
path that can ever post it.

## 9. Stock Take Count import (spec §12)

Fields: SKU\*, Counted Quantity\*, Notes. This is the one adapter with a `target` step
(`confirmFields`): the user must pick which `status: 'counting'` stock take the counts
belong to before mapping even starts — `normalizeRow()` resolves a SKU to a `lineId`
**already on that take's frozen sheet**; a SKU outside the frozen scope, or that
doesn't exist at all, is always an error. `execute()` calls
`stockTakeService.enterCounts(stockTakeId, [{ lineId, countedQty }])` — the ONLY field
this can ever touch. `expectedQty` and the frozen unit cost were snapshotted atomically
when the take was frozen (Phase 3C's `freeze_stock_take` RPC) and there is no code path
here that reads or writes either.

## 10. Customer / Supplier import (spec §13–14)

Fields inspected off the real `Customer`/`Supplier` types
(`src/types/customer.ts`/`supplier.ts`) — code, name, email, phone, VAT number, a
single-line address (line1/city/country — `country` defaults to `'South Africa'` when
omitted, matching this application's single-jurisdiction scope), payment terms, credit
limit (Customers only). A row with no code gets a sequential `CUST-000N`/`SUPP-000N`
code, the same convention every other document register in this codebase already uses.
Neither adapter posts to the GL — `customerService.createCustomer()` /
`supplierService.createSupplier()` are plain directory writes, `balance` always starts
at `0`.

**Supplier bank details are not an import field at all** (spec §14: "do not overwrite
sensitive supplier information silently") — `SUPPLIER_IMPORT_FIELDS` has no bank-detail
entries, and an update's patch never touches `bankDetails`, so a spreadsheet can never
redirect where a supplier gets paid.

## 11. Not built this phase

- **Price-list import** (spec §15) — explicitly conditional in the spec ("if the
  architecture fits cleanly"); not built, to keep Phase 6 bounded. The architecture
  does fit it (a `SKU + Selling Price` adapter is a strict subset of the Product
  adapter's shape) — left as a follow-up adapter, not a framework change.
- **Export as XLSX** — the error-report download (spec §20) is CSV only
  (`errorReport.ts`); an XLSX export would reuse the same `xlsx` write path
  `spreadsheetParser.test.ts` already exercises for test fixtures, but wasn't built for
  the one CSV-is-enough result file.
- Everything in Phase 7 (print/export/reports) — out of scope for this phase entirely.

## 12. Permissions (spec §16)

Every adapter declares `permission: { feature, action: 'import' }` — `'inventory'` for
the three Inventory adapters, `'customer_management'`/`'supplier_management'` for the
other two (this codebase's own existing feature keys for those modules — confirmed
against `CustomerListPage.tsx`/`SupplierListPage.tsx`'s real `useCanAccess()` calls,
not invented). `ImportWizard`'s Type step filters adapter cards by
`useCanAccess(permission.feature, permission.action)`; each page's own "Import" button
is separately gated the same way, so a user without the permission never even sees the
entry point. No new database-role-aware RLS — same UI/service-layer-only gate every
other Phase T permission uses (`docs/PERMISSIONS.md`).

## 13. Audit (spec §17)

`services/importAuditService.ts`'s `recordImportAudit()` writes ONE
`auditLogService.log()` row per completed run — `action: 'data_imported'` (new
`AuditAction` value, `src/types/auditLog.ts`; the column is `text`, no migration, same
precedent as `stock_import_committed`), `recordType: 'ImportBatch'`, a synthetic
`import_<timestamp>` id, and `newValue` carrying only counts (`rowsRead`/`imported`/
`updated`/`skipped`/`errored`) + the file name — never the parsed rows or the uploaded
file itself. Per-record actions (a `Product`'s own audit trail, a stock adjustment's
`stock_import_committed`, …) are whatever the adapter's own service calls already log —
this is purely the batch-level summary row.

## 14. UI integration (spec §21)

- `InventoryOverviewPage`'s "Import" button opens `ImportWizard` with all three
  Inventory adapters (Products / Opening Stock / Stock Take Counts) — replaces the old
  "coming in the import framework" `ConfirmDialog` placeholder.
- `CustomerListPage` / `SupplierListPage` each gained their own "Import" button, gated
  on `useCanAccess('customer_management'|'supplier_management', 'import')`, opening
  `ImportWizard` with just their one adapter.
- Only adapters with a complete, real implementation are ever passed to `ImportWizard`
  — no placeholder/fake option anywhere.

## 15. Tests

`src/features/import/**/*.test.ts(x)` — 102 tests across 13 files: CSV/XLSX/file-level
parser tests (quoting, blank rows, multi-worksheet, dates, numbers, text-formatted
leading zeroes, malformed/oversized/empty files); column-mapping tests (alias match,
low-confidence non-match, first-column-wins, required-field gating); `normalize.ts`
tests (number formats incl. SA comma-decimal, boolean tokens, DD/MM/YYYY dates);
per-adapter tests for all five adapters (`normalizeRow`/`detectDuplicates`/`execute`,
including the WAC-protection and frozen-scope-boundary cases specifically); an
`ImportWizard` component integration test driving a real CSV through file → mapping →
review → execute → result end-to-end, plus permission filtering. See
`docs/CURRENT_TASKS.md`'s Phase 6 entry for the exact gate numbers.

## 16. Limitations

- XLSX support carries the `npm audit` advisory noted in §2 — a real, open trade-off,
  not silently accepted.
- Column-mapping suggestion is exact-match only; a header with an unanticipated
  spelling always requires a manual pick — a deliberate safety choice, not an
  oversight.
- Opening Stock's `effectiveDate` isn't a spreadsheet column (not in spec's own field
  list) — defaults to today, edited afterwards if needed.
- No streaming/chunked parsing — `MAX_IMPORT_ROWS` (20,000) bounds a single import;
  a larger dataset must be split into multiple files.
- Price-list import and XLSX error-report export are the two spec-optional pieces not
  built (§11 above).

---

# PART B — PRINT / EXPORT (Phase 7)

## B0. What existed before this phase (audit)

- No `window.print()`, no `@media print` rule, no print-only component anywhere in the
  app before this phase — a fresh build, not a refactor.
- No CSV download helper except `features/import/errorReport.ts`'s narrow
  row-number/message export (Phase 6, kept as-is — it's a different, smaller shape
  than the generic model below and still the right tool for an import error report).
- No Excel/XLSX export anywhere; `xlsx` (SheetJS) was already a dependency from
  Phase 6, reused here rather than adding a second library.
- No report/list layout, no PDF library, no company-branding lookup for a document
  (`useCompany()` existed, used only by tax-invoice-shaped screens — reused, not
  duplicated).

**Gap this phase fills:** the entire print/export layer — everything in this Part B.

## B1. Two engines, one shared consumer contract

`src/features/import/` (Phase 6) and `src/features/export/` (this phase) are
deliberately separate top-level features — reading a file in and writing one out are
different enough concerns (mapping/validation/duplicate-detection has no export
equivalent; print has no import equivalent) that merging them would blur both. They
share nothing at the type level, only the same architectural posture: a generic
model + adapters/callers, never business logic baked into the shared parts.

## B2. The export model (`src/features/export/types.ts`)

```ts
interface ExportColumn<T> {
  key, header;
  accessor(row: T): string | number | Date | null | undefined;  // machine-readable
  formatForPrint?(row: T): string;                               // display-only override
  align?: 'left' | 'right';
  total?(rows: T[]): ExportCellValue;                            // omit for no total
}

interface ExportDataset<T> {
  title, subtitle?, filters?: { label, value }[];
  columns: ExportColumn<T>[];
  rows: T[];
  filename;                       // no extension — each exporter appends its own
  generatedAt?: Date;             // defaults to now
}
```

Every consuming page builds one `ExportDataset` from its own real data — CSV, XLSX and
the printed report all render from the SAME dataset, so they can never drift from each
other or from a `DataTable`'s own rendered markup (spec §2: "do not let React table
markup become the export source of truth"). `accessor` is always the real value (a
number stays a number, a `Date` stays a `Date`); `formatForPrint` is the ONE place a
currency symbol, percent sign or other screen/print-only formatting is allowed
(spec §16) — CSV/XLSX never call it.

## B3. CSV (`csvExport.ts`)

Quoted/escaped commas, quotes and line breaks (spec §3); a `Date` cell becomes a plain
ISO date, never a locale string; `null`/`undefined` becomes an empty cell, not `"null"`
or `"0"`; a UTF-8 BOM is prepended so Excel (the overwhelmingly common opener) reads
non-ASCII characters correctly. A column with `total()` appends one final totals row.

## B4. XLSX (`xlsxExport.ts`)

Genuine SheetJS workbook via `aoa_to_sheet` with `cellDates: true` — a number or date
value keeps its real cell type (`t: 'n'` / a `Date` object), never a string dressed up
as data (spec §4: "do not rename CSV to .xlsx"). No formula is ever written — every
cell is a literal value, so nothing here can execute untrusted input even in principle.
`XLSX.writeFile` handles the browser download itself.

## B5. Print (`components/PrintableReport.tsx` + `src/styles/globals.css`)

**Layout** (spec §5): `PrintableReport<T>` renders the single configured company's
name + registration/VAT number (`useCompany()` — no `logo` field exists on `Company`
yet, so branding is text-only, gracefully absent while the company is still loading;
spec §18's "leave logo gracefully absent" is exactly this), the report title/subtitle,
active filters as plain text, a generated timestamp, the data as a plain HTML table
(using each column's `formatForPrint`), a totals row when any column defines one, an
empty-state message, and a "Generated by Vertex" footer. It renders NO button, search
box, sortable header or other screen-only control — spec's own list of what a printed
report must NOT include.

**Mechanism:** every export-capable page renders `<PrintableReport dataset={...}
className="hidden print:block" />` alongside its normal interactive view (which stays
visible on screen, hidden on print via the CSS below) — Tailwind's built-in `print:`
variant, no custom plugin needed. "Print / Save PDF" (in `ExportMenu`) is just
`window.print()`; the browser's own Print dialog offers "Save as PDF" — no PDF
generation dependency, per the Review-1-approved fork E decision
(`docs/INVENTORY_ARCHITECTURE.md` § Architecture Forks) and spec §7's explicit
"do not introduce a PDF-generation dependency unless there is a concrete need."

**Application-wide print CSS** (spec §6, `globals.css`'s `@media print` block): hides
the sidebar (`[data-slot='sidebar']` and friends), the topbar
(`[data-slot='app-topbar']`, a new marker added to `AppTopbar`'s `<header>`), and the
toast layer (`.toaster`) — a safety net for any page that forgets its own
`hidden print:block` split; forces a white background/black text; makes `<table>`
headers repeat via `display: table-header-group` and keeps a `<tr>` from splitting
across a page break; sets `@page { margin: 1.5cm; }`. Every rule is scoped inside
`@media print`, so screen styles are untouched (spec: "do not destroy normal screen
styles").

## B6. `ExportMenu` (`components/ExportMenu.tsx`)

The one action menu every surface shares (spec §8): **Print / Save PDF**, **Export
CSV**, **Export Excel**. Disabled whenever the dataset has zero rows; the Excel item
shows "Preparing Excel file…" and disables the whole menu while `buildWorkbook()` runs
(spec §20: loading state, disabled-when-empty, no accidental double-download). Gated
by an `allowed` prop the caller sets to `useCanAccess(feature, 'export')` — renders
nothing at all when `false`, matching Phase 6's `import` action's own precedent (no
new database-role-aware RLS, same UI/service-layer-only gate every Phase T permission
uses).

## B7. "Export the filtered result, not the visible page" (spec §19)

`DataTable` (the shared list component every register already used) gained one
additive, opt-in prop: `onVisibleRowsChange?(rows, activeFilters)`, fired whenever its
internal search/filter/sort result changes — the full matching set, BEFORE
pagination, plus a human-readable description of the active search term and any
chosen filter's own `label` (never its raw `value`; spec §17's "Warehouse: Main
Warehouse", not "Warehouse: wh_a1b2"). A page stores this in local state and builds
its `ExportDataset.rows`/`filters` from it — so "Export" always means the complete
filtered result the user is currently looking at, never just the 12–20 rows the table
happens to be paginated to. `DataTable`'s own pagination state (`page`/`pageSize`)
stays fully internal either way — this is the only thing it now exposes, and only to
callers that ask for it.

## B8. Surfaces wired (spec §9–15)

| Surface | Columns | Notes |
|---|---|---|
| Customers | code, name, email, phone, VAT, terms, balance (totalled), status | `CustomerListPage` |
| Suppliers | code, name, email, phone, VAT, terms, status | **No bank details** — not a column at all (spec §10), same rule Phase 6's supplier import already enforces |
| Inventory register | SKU, product, category, supplier, on hand, available, committed, reorder, WAC, inventory value (totalled), selling price, margin %, status | `InventoryOverviewPage`; the same `InventoryRow` the screen table already computes — never recalculated for export |
| Stock movements | date, SKU, product, warehouse, type, qty, unit cost, value, source type, source document, reference, reverses-movement | Preserves the append-only ledger's own evidence fields verbatim |
| Stock take — count sheet | SKU, product, (Expected Qty — Standard mode only), Counted Qty (blank write-in), Notes | Print-only, no CSV/XLSX — a physical form, not data; **never shows unit cost/WAC** (spec §13); Blind mode omits Expected Qty entirely |
| Stock take — result | SKU, product, expected, counted, variance, frozen WAC, variance value (totalled), reason | `ExportMenu` (Print/CSV/XLSX), available once `ready_for_review` or `posted` |
| Adjustments / Transfers / Supplier Returns / Opening Stock | number, [route/reason/warehouse], date, amount (totalled), status | List/history level only per spec §15 ("do not overbuild document PDFs yet") — no per-document printable layout |

`StockTakeCountSheetExport.tsx` is the one bespoke component in this set — it renders
the Print/Export controls appropriate to the stock take's own status (count sheet
while `counting`, full result once reviewed/posted) since those are two genuinely
different documents, not one dataset with optional columns.

## B9. Accounting/money formatting (spec §16)

Every export column's `accessor` returns the real numeric value — `1234.56`, never
`"R 1 234,56"`. `formatForPrint` is the only place currency formatting
(`formatCurrency()`) is applied, and only for the printed view — CSV/XLSX always get
the bare number, matching the audited fields against the same valuation contract the
screen already uses (`InventoryRow`, `StockAdjustment.totalCostEffect`, etc. — never
independently recalculated).

## B10. Permissions

Every export-capable page computes `canExport = useCanAccess(feature, 'export')` and
passes it to `<ExportMenu allowed={canExport} />` (and, for Stock Takes,
`<StockTakeCountSheetExport allowed={canExport} />` too) — `feature` is `'inventory'`
for every Inventory surface, `'customer_management'`/`'supplier_management'` for
Customers/Suppliers (this codebase's real existing feature keys, confirmed against
those pages' own `useCanAccess()` calls). Print/export intentionally uses its own
`canExport`, independent of `canManage`/`canUpdate` — printing a document is a read
action, not a management one; `StockTakeDetailSheet`'s action bar reflects this by
rendering `StockTakeCountSheetExport` outside the `canManage`-gated block.

## B11. Tests

`src/features/export/**/*.test.ts(x)` (CSV quoting/escaping/totals, XLSX real cell
types/no-formula/truncated-sheet-name, `PrintableReport` renders no interactive
controls + company/filters/timestamp/totals/empty-state, `ExportMenu` wiring/disabled/
busy states) plus `data-table.test.tsx`'s new `onVisibleRowsChange` coverage,
`StockTakeCountSheetExport.test.tsx` (blind vs standard columns, no WAC on the count
sheet, blank write-in never leaks `countedQty`, full result shows WAC/variance), and
page-level permission-gating tests on `CustomerListPage` for the new `export` action.
See `docs/CURRENT_TASKS.md`'s Phase 7 entry for the exact gate numbers.

## B12. Limitations

- No per-document printable layout for Adjustments/Transfers/Supplier Returns/Opening
  Stock — list/history export only, per spec §15's own "do not overbuild" instruction.
- No true running page footer ("Page X of Y") — browser `@page` margin boxes for this
  are inconsistently supported across browsers; the footer is a single
  "Generated by Vertex" line at the end of the content instead.
- No company logo — `Company` (`src/types/company.ts`) has no logo field yet; branding
  is name + registration/VAT text only, exactly as spec §18 allows.
- Price-list export/print was not requested by Phase 7's spec and was not built.
- `MAX_IMPORT_ROWS`-scale exports (Phase 6's own import limit) are not separately
  capped on the export side — a very large dataset's XLSX build runs synchronously on
  the main thread (mitigated by the busy/disabled state in `ExportMenu`, not
  eliminated).
