# HIVE TASK BOARD

## Phase 0: Foundation & Core System Shell
- [x] Base Vite + React + TypeScript setup — Vite 5 + React 18 + TS strict, ESLint, Vitest, `npm install`/`build`/`type-check`/`test` all pass
- [x] Shared Design System Tokens & Base UI Components (`src/components/ui/`) — `src/styles/tokens.css` (dark default, `[data-theme="light"]` override) wired into `tailwind.config.js`; base `Button`/`Card` primitives
- [x] Global Layout, Sidebar Navigation, Theme Toggle — `src/components/layout/{AppLayout,Sidebar,Topbar,ThemeToggle}.tsx`, nav driven by `src/config/navigation.ts` (1:1 with ROUTES.md)
- [ ] Generic Repository & Local Storage Mock Database Engine — `IRepository<T>` contract + one fully-wired example (`MockCustomerRepository`) done, but per ADR 001 it is an **in-memory** store, not localStorage-persisted; not checking this box as written since "Local Storage" specifically isn't implemented. Other feature mock repositories are not yet built — left for the owning feature bees.

## Phase 1: Core Business Modules — ✅ COMPLETE (2026-08-20)
- [x] Executive Dashboard Module — KPI cards, Revenue vs Expenses + Cash Flow charts (mocked, clearly flagged pending Banking/Accounting), real AR/AP aging aggregated from Customers/Suppliers, real Stock Status via Inventory's `LowStockAlertWidget`/valuation, recent-activity feed from real record timestamps; QA-verified
- [x] Customers Module — list/detail/create/edit, aging, credit control, inactivate-not-delete guard, 4-tab form; QA-verified
- [x] Suppliers Module — list/detail/create/edit, aging, AP summary, delete-guard on linked history, 4-tab form; QA-verified
- [x] Products & Inventory Module — products + warehouses + immutable stock-movement ledger, WAC valuation, low-stock service/widget consumed by Dashboard; QA-verified

Wave 1 (Customers/Suppliers/Inventory, parallel) + Wave 2 (Dashboard, sequential —
depends on Wave 1's aging/stock services) both independently QA-verified: full pass on
type-check/lint/build/test (90 tests total), scope discipline, icon-registry + contrast-
token enforcement, repository-import discipline, and — for Dashboard specifically — that
its AR/AP aggregation genuinely calls the real per-entity aging functions (not faked
numbers) and correctly normalizes the two differently-shaped bucket outputs Customers
Bee and Suppliers Bee independently produced (`days1to30/days31to60/days61Plus` vs
`days30/days60/days90Plus` — a real naming inconsistency between the two, worth a
normalization cleanup pass later, not blocking).

Wave 1 verification: 3 bees dispatched in parallel (disjoint feature folders, one named
exception file each for `/sales/customers` and `/purchases/vendors` per docs/ROUTES.md's
domain grouping), independently re-verified by QA Bee — full pass on type-check/lint/build/
test, scope discipline, icon-registry + contrast-token enforcement, repository-import
discipline, stock-ledger immutability, and delete-guard logic. 9 missing icon keys
(edit/add/delete/filter/download/view/sort/calendar/phone) added to the registry by UI Bee
as a follow-up, re-verified clean.

## Phase 2: Transactional Modules — 🚀 IN PROGRESS

### Wave 1 (Parallel Dispatch — Sales & Purchases)

#### Sales Module (Sales Bee) — ✅ COMPLETE (2026-08-21, Wave 1b), independently QA-verified
- [x] Quotes (draft, preview, convert to SO)
- [x] Sales Orders (from quote or standalone; convert to Invoice creates a draft invoice
  via the shared `invoiceService` singleton — posting to GL happens separately when the
  invoice is marked Sent, same as a standalone invoice)
- [x] Invoices (from SO or standalone, tax calculations, AR aging) — GL posting wired:
  `markInvoiceAsSent()` now delegates to `postInvoice()`, so "sent" always means "posted"
- [x] Credit Notes (issue posts a reversing GL entry; allocate against open invoices via
  `InvoiceService.recordPayment()`)
- [x] Customer Receipts (payment allocation across one or more open invoices)
- [x] Financial tables with proper number alignment (tabular-nums, semantic colors)
- [x] Use `FinancialNumber` and `FinancialTableCell` components
- [x] Integration: Inventory line items reused from Invoice pattern, GL posting real
  (not mocked) for Invoices/Credit Notes/Customer Receipts

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for number formatting patterns
- ✅ All currency displays use `FinancialNumber` component
- ✅ Invoice tables: right-aligned prices, tabular-nums
- ✅ Test light + dark theme
- ✅ Mock repository: `src/features/sales/repositories/MockSalesRepository.ts`
- ✅ Domain types: Quote, SalesOrder, Invoice, CreditNote, CustomerReceipt in `src/types/sales.types.ts`
- ✅ Definition of Done checklist in `docs/DO_NOT_BREAK.md` (20 points)

#### Purchases Module (Purchases Bee) — ✅ COMPLETE (2026-08-21, Wave 1b), independently QA-verified
- [x] Purchase Orders (to suppliers, line items, quantities, Send/Receive/Cancel/
  Convert-to-Bill lifecycle actions)
- [x] Supplier Bills (GL posting real — `postBill()` posts a balanced entry, not a TODO)
- [x] Payment Register (record a payment against one supplier, allocate across their
  outstanding bills, remainder left on-account)
- [x] Vendor Aging (Current/1-30/31-60/90+ buckets via `calculateAllVendorAging`, real
  Bill data, supplier names from the Suppliers module's own hook — no reimplemented
  supplier lookup)
- [x] Financial tables with proper alignment
- [x] Use `FinancialNumber` for all amounts
- [x] Integration: GL posting real for Bills/Payments; PO→Bill conversion always goes
  through `billService.createBill()` + `postBill()` so it can't bypass the GL

**Flagged gap (tracked in `docs/KNOWN_ISSUES.md`):** a Purchase Order can currently be
converted to a Bill more than once — no `billId`/converted-status field exists on
`PurchaseOrder` yet to prevent it.

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for financial UI patterns
- ✅ All amounts use `FinancialNumber` with `formatCurrency`
- ✅ Bill matching: highlight matched/unmatched pairs with semantic colors
- ✅ Mock repository: `src/features/purchases/repositories/MockPurchasesRepository.ts`
- ✅ Domain types: PurchaseOrder, Bill, Payment in `src/types/purchases.types.ts`

**Queen Bee note (2026-08-21):** Wave 1's remaining scope (Quotes, Sales Orders, Credit
Notes, Customer Receipts, a standalone Purchase Orders page, Payment Register, Vendor
Aging) was deferred past Wave 2 (Banking/Accounting) since Wave 2's own prerequisite — a
working GL posting engine — didn't need it. **Wave 1b — ✅ COMPLETE (2026-08-21)**:
Queen scaffolded routes/nav/icons + the shared `invoiceService` singleton
(`src/services/index.ts`) ahead of dispatch, fixed 2 stale call sites left over from
`BillService`/`InvoiceService` picking up a required `journalEntryService` constructor
arg, then dispatched Sales Bee and Purchases Bee in parallel (disjoint feature folders).
Both independently QA-verified: type-check/lint/build clean, 317 tests passing (up from
281), `billService.postBill()`'s GL-posting TODO now real.

### Wave 2 (Sequential — Banking & Accounting, depend on Wave 1) — 🚀 DISPATCHED 2026-08-21

**Queen Bee scaffolding done ahead of dispatch** (shared-config files, so Queen edits
them directly per the established parallel-dispatch convention in
`docs/KNOWN_ISSUES.md` — bees only touch their own feature folder): `docs/ROUTES.md`,
`src/config/icons.ts` (+`trialBalance`/`bankTransactions`/`reconciliation` keys),
`src/config/navigation.ts` (+Trial Balance item, +Banking section), and
`src/app/router.tsx` all now have the Wave 2 routes wired to `PlaceholderPage` stubs —
`TrialBalancePage.tsx` and `src/features/banking/pages/{BankAccountsPage,
BankTransactionsPage,BankReconciliationPage}.tsx`. Build/type-check/lint verified clean
before dispatch. Each bee replaces its stub page bodies with real UI; neither needs to
touch router.tsx/navigation.ts/icons.ts/ROUTES.md.

#### Banking Module (Banking Bee) — ✅ COMPLETE (2026-08-21), independently QA-verified
- [x] Bank Accounts (setup, SA bank metadata — bank name/branch code/account number/
  account type/swift code — plus money_market/foreign_currency account types added)
- [x] Bank Transactions (direct receipts/payments, split allocation across GL accounts
  with per-line VAT, inter-account transfers posting debit-destination/credit-source)
- [x] Statement Import (real CSV/OFX/QIF/MT940 parsing, smart match suggestions)
- [x] Bank Reconciliation (workspace vs. GL cashbook, outstanding items, hard
  zero-variance enforcement *at the service layer*, append-only history snapshots)
- [x] Transaction lists with debit/credit columns (right-aligned, tabular-nums)
- [x] Integration: **GL posting fully wired**, not TODO'd — `bankTransactionService`
  builds and posts real balanced `JournalEntry`s via
  `journalEntryService.postJournalEntry()` for both direct transactions and transfers;
  verified against the real `JournalEntryService` in tests, not a stub

**Independently re-verified (Queen Bee, 2026-08-21):** `npm run type-check`/`lint`/
`build` clean, full suite 41 files / 281 tests passing, no stray `lucide-react` imports
or raw Tailwind color classes introduced in `src/features/banking/`.

**Flagged gaps, not blocking:**
- All seeded bank accounts currently share one GL control account (`acc_1000`) —
  Banking Bee deliberately didn't touch `src/mock-data/accounts.ts` to avoid a
  parallel-dispatch collision with Accounting Bee. Needs real per-account GL mapping
  in a follow-up pass.
- Reused `Icons.download` for "Import Statement" (closest existing concept, per scope
  boundary) rather than adding a new `upload`/`import` key — fine as-is, revisit if a
  dedicated import icon is wanted.
- ~~No `TaxRate` repository/service exists anywhere yet~~ — resolved 2026-08-21, see
  Tax Module section below: real `ITaxRateRepository`/`TaxRateService` now exist and
  Banking reads them via `useTaxRates()`, not the raw seed array directly.
- `docs/DO_NOT_BREAK.md`'s "tick-flash on running balance" wasn't verified in this
  pass — not re-checked against `FinancialNumber`'s `showFlash` usage; low risk, worth
  a follow-up glance.

**As of 2026-08-21, this module (and the project generally) must also follow
`docs/SA_ACCOUNTING_MASTER_SPEC.md` — a 117-section SA-compliance master spec — see
`docs/SA_SPEC_GAP_ANALYSIS.md` for what's done vs. outstanding against it. Phase 1
("Accounting Core" per the spec's own §116) is now done: Company, Financial Year,
Accounting Periods with real open/closed/locked enforcement, Chart of Accounts,
General Ledger, Journals, Trial Balance, and an append-only Audit Trail wired into
every posting/reversal/period-transition. 203 tests passing.

#### Accounting Module (Accounting Bee) — ✅ COMPLETE (2026-08-21), independently QA-verified
- ✅ Double-entry posting engine: `JournalEntryService` (validate/post/reverse,
  trial balance, per-account running ledger) + `AccountService`, backed by an
  append-only `IJournalEntryRepository` (no update/delete — same shape as Inventory's
  stock-movement ledger) and editable `IAccountRepository`. Seed Chart of Accounts +
  one balanced opening entry.
- ✅ Governance layer: `AccountingPeriodService` (open/closed/locked lifecycle,
  reopen-requires-reason) + `FinancialYearService`, both feature-local; `Company` +
  `AuditLogService` (shared, `src/services/auditLogService.ts`) since they're used
  across features, not owned by Accounting alone. `postJournalEntry()`/
  `reverseJournalEntry()` now reject posting outside an 'open' accounting period and
  write an audit log entry on every successful post/reversal. See
  `docs/LEDGER_ARCHITECTURE.md` § Accounting periods / § Audit trail.
- [x] Chart of Accounts page (list/create/edit UI over `AccountService`, hierarchy by
  master type, "Has Postings" badge via `accountService.hasPostings()`)
- [x] General Ledger page (account picker + full posted-line history with running
  balance, rendering `journalEntryService.getAccountLedger()` directly — no
  reimplemented running-balance math in the UI)
- [x] Journal Entries page (multi-line debit/credit form gated on
  `validateLines()`, list with expandable rows, Reverse action calling
  `reverseJournalEntry()`; reversed status derived from `reversalOfEntryId`, never a
  mutated field)
- [x] Trial Balance page (renders `journalEntryService.computeTrialBalance()` directly,
  clear `balanced` indicator)
- [x] Debit/Credit columns (right-aligned, tabular-nums), `FinancialNumber`/
  `FinancialTableCell`/`formatCurrency` used throughout, `font-mono` for entry/account
  codes
- [x] Integration: GL posting from Sales/Purchases — done in Wave 1b (2026-08-21).
  `billService.postBill()`, `invoiceService.postInvoice()` (via `markInvoiceAsSent()`),
  `creditNoteService.issueCreditNote()`, and `customerReceiptService` all post real
  balanced entries through `journalEntryService.postJournalEntry()`, same as Banking's
  `bankTransactionService`.

**Independently re-verified (Queen Bee, 2026-08-21):** `npm run type-check`/`lint`/
`build` clean, full suite 41 files / 281 tests passing (226 at Accounting Bee's own
completion, 281 after Banking Bee landed alongside it), no stray `lucide-react`
imports or raw Tailwind color classes introduced in `src/features/accounting/`.

**Flagged gap, not fixed by design:** Accounting Bee wanted an `isControlAccount` flag
on `Account` (to visually mark control accounts as non-postable) but that field
doesn't exist on the type. Per `docs/DO_NOT_BREAK.md` ("don't change core type shapes
without discussion"), it did not add one unilaterally — it surfaced the existing
`hasPostings()` signal instead. Worth a real decision in a follow-up pass, not urgent.

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for GL table examples
- ✅ Debit/Credit: right-aligned numbers, semantic colors for positive/negative
- ✅ Trial Balance: ensure balanced (total debits = total credits) — enforced by
  `JournalEntryService`, not something the UI needs to (re-)validate
- ✅ Repositories: `src/features/accounting/repositories/{MockAccountRepository,
  MockJournalEntryRepository}.ts` (two repos, not one — Account is editable CRUD,
  JournalEntry is append-only, so they don't share a contract)

### Wave 3 (Sequential — Tax & Reports, depend on Wave 1-2)

#### Tax Module (Phase 5, VAT) — ✅ COMPLETE (2026-08-21, Queen, solo)
- [x] Tax Rates engine — `TaxRate` redesigned effective-dated/versioned
  (`code`, `treatment`, `effectiveFrom`/`effectiveTo`, `jurisdiction`,
  `sourceReference` — SA_ACCOUNTING_MASTER_SPEC.md §9/§12/§82/§113).
  `TaxRateService` (`src/features/tax/services/taxRateService.ts`):
  `getEffectiveRate(code, asOf)`/`getCurrentRate(code)` for historically-
  correct lookups, `supersede()` to version-change a rate (reason-required,
  audit-logged — never edits an existing rate's `rate` in place, mirrors
  `CompanyService.setReportingFramework()`'s override pattern). Seeded with
  real SA VAT codes (STD @ 14%→15% on 2018-04-01, ZERO, EXEMPT, OOS,
  NODEDUCT) — flagged user-supplied/pending professional verification, not
  presented as confirmed, per §110/§111.
- [x] Tax Calculations wired into every consumer that previously imported
  the static `seedTaxRates` array directly: Sales/Purchases
  `LineItemsEditor` (now take a `taxRates` prop via `useTaxRates()`),
  Banking's `BankTransactionsPage`, Inventory's `ProductForm`/
  `ProductsTable` (also fixed a real bug along the way: `Product`'s
  placeholder tax-rate ids didn't match any real `TaxRate` record at all
  — now they do). `Company` extended with `vatFilingFrequency`/
  `vatAccountingBasis` (§10/§11).
- [x] VAT Reporting — `/tax/vat-return` (`VatReturnPage`) is real now: a
  month picker drives `computeVatReport()`
  (`src/features/tax/services/vatReportService.ts`), which classifies
  every real posted Invoice/Credit Note/Bill line item by its tax rate's
  `treatment` (never re-taxes an already-posted amount — sums the real
  stored `taxAmount`, per §97 "no fake accounting") into Output VAT (net
  of issued credit notes) and claimable Input VAT (non-deductible amounts
  reported separately, excluded from the claimable total per §12).
  Reconciled against what was actually posted to the VAT Output/Input GL
  control accounts THIS PERIOD (`reconcileVatControlAccounts` — a
  movement, not the account's all-time balance) via the same
  `SubledgerReconciliationCard`-style pattern the AR/AP reconciliation
  uses. Deliberately NOT labelled with official SARS VAT201 box numbers —
  see the service's doc comment (§110/§111: no unverified official-form
  claims). 8 tests for the aggregation, all passing. Also backfilled
  `taxRateId` on 29 seed Invoice/Credit Note line items and fixed 23 seed
  Bill/PO line items that referenced a non-existent `'tax_rate_15'` id —
  all verified to already carry exactly-15%-consistent `taxAmount`s
  before assigning them, not guessed.
- [x] Tax Rates settings page — `/tax/rates` (`TaxRatesPage`): every tax
  code grouped with its full effective-dated history, a "New Tax Code"
  form (`createTaxRate`), and "Supersede"/"Deactivate" actions on the
  currently-open version of each code (past versions are read-only, per
  §82/§83 — only the current version can act as the starting point for a
  new one). Supersede requires a reason, audit-logged, matching every
  other reason-required override in this codebase. 5 tests.
- [x] Non-deductible input VAT correctly excluded from what a Bill claims
  — `billService.postBill()` now resolves each line's tax-rate treatment
  and folds non-deductible VAT into the Expense line instead of VAT
  Input, capped so the split can never desync from the AP credit. 4
  tests. (Previously flagged in `docs/KNOWN_ISSUES.md`, now resolved.)
- [x] VAT reconciliation genuinely reconciles against real seed data —
  `generateSeedPostings.ts` backfills the real GL posting every non-draft
  seed Invoice/Bill/Credit Note was missing, so `reconcileVatControlAccounts`
  shows "Reconciled" rather than a variance purely from fixture
  incompleteness. Proven by an integration test wiring the real
  `JournalEntryService` against real seed data across all of 2026.
  (Previously flagged in `docs/KNOWN_ISSUES.md`, now resolved for VAT —
  the AR/AP side of the same underlying gap remains open, see there.)
- [ ] Seasonal tax analysis with charts
- [ ] Tax tables with percentages and amounts
- [ ] Use `FinancialNumber` for tax amounts

**Deliberately still out of Phase 5's scope, not a gap in it:** income tax
brackets/SBC calculations (§53, a different tax entirely from VAT —
Phase 9 per §116); no VAT Period open/closed lifecycle yet (§10's "VAT
period" — Accounting Periods exist for the GL but there's no VAT-specific
filing-period concept — a real Phase 5 gap, just not blocking, since
Accounting Periods already gate posting); the AR/AP subledger
reconciliation still shows a variance for partially-paid seed documents
(`docs/KNOWN_ISSUES.md` — a Phase 2/3 concern, not Phase 5's).

### Phase 6 (Inventory) — ✅ COMPLETE (2026-08-21/22, Queen, solo)

Products/Warehouses/immutable stock-movement ledger/WAC valuation shipped in Phase 1
(see above) — this wave is specifically §22-§24's "Cost of Sales" GL integration,
which nothing had wired up despite `StockMovementType` carrying `'sale'`/
`'goods_received'` variants since Phase 1.

- [x] Cost of Sales on sale (§24) — `invoiceService.postInvoice()` posts DR Cost of
  Sales / CR Inventory in the same journal entry as the sale, for every tracked-product
  line item, then reduces stock after the entry succeeds.
- [x] Inventory capitalization on purchase (§22) — `billService.postBill()` now
  classifies each line as Inventory (tracked product, capitalized) or Expense
  (everything else) instead of always expensing the full subtotal, records a stock
  receipt at the real purchase unit cost after posting, and recalculates the product's
  weighted-average cost.
- [x] `InventoryPostingAdapter` (`src/features/inventory/services/`) — constructor-
  injectable (not a bare singleton), composes productService/stockService/
  warehouseService behind a narrow interface, independently tested with isolated mock
  repositories (10 tests) rather than only reachable via the real singleton.
- [x] Valuation-method selection (§23) — fixed 2026-08-22, once PO/GRN receipt (below)
  gave FIFO a real per-lot cost source. `Product.valuationMethod` (defaults to
  `'weighted_average'` — every existing product unaffected); new `StockLot`/
  `StockLotService` (`src/features/inventory/services/stockLotService.ts`) costs FIFO
  sales from the oldest open lot first, mutating only `quantityRemaining` (a narrow,
  documented exception to `StockMovement`'s append-only rule — that ledger stays the
  sole authoritative audit trail regardless of valuation method).
  `InventoryPostingAdapter` branches all four operations on it. Selectable in
  `ProductForm`. 11 new adapter tests + 10 dedicated `StockLotService` tests (FIFO
  ordering across lots at different costs, cross-warehouse/cross-product isolation,
  throws rather than guessing when open lots can't cover a sale). See
  `docs/KNOWN_ISSUES.md`'s Resolved section.
- [x] Per-document warehouse attribution (§22) — fixed 2026-08-22.
  `DocumentLineItem.warehouseId?: ID` added (optional — every existing document keeps
  working unchanged); `InventoryPostingAdapter` resolves it, falling back to the
  default warehouse when unset or invalid, instead of always using the default. Both
  `LineItemsEditor`s show a Warehouse column, but only when `warehouses.length > 1` —
  a single-warehouse business sees no UI change at all. See
  `docs/KNOWN_ISSUES.md`'s Resolved section.
- [x] True 3-way (PO/GRN/Invoice) matching — fixed 2026-08-22.
  `purchaseOrderService.recordReceipt()` now posts DR Inventory / CR GRNI (new
  account `acc_2050`) for tracked-inventory lines and records the real stock receipt,
  instead of staying status-only. `billService.postBill()` clears GRNI instead of
  debiting Inventory again — and skips re-recording the stock movement — when its
  linked PO was already GRNI-received, avoiding the double-count the old
  status-only design was built to prevent. 9 new tests. See
  `docs/KNOWN_ISSUES.md`'s Resolved section.
- [x] Credit notes reverse Cost of Sales and restore stock quantity — fixed 2026-08-21
  in a later pass (found this exact gap already half-wired uncommitted in the working
  tree — `StockMovementType: 'sales_return'` and
  `InventoryPostingAdapter.recordReturnMovement()` existed with tests but nothing
  called them). `CreditNoteService` now takes an `InventoryReturnMover` dependency
  (the same `inventoryPoster` singleton Invoice/BillService use) and
  `issueCreditNote()` posts DR Inventory / CR Cost of Sales for tracked-inventory line
  items, but only when `reason === 'return'` — a pricing_error/discount/other credit
  note is a value adjustment with nothing physically coming back. Stock restores only
  after that entry posts. `recordReturnMovement()` deliberately doesn't recalculate
  weighted-average cost (a return isn't a new purchase at a new price). 4 new tests.
  See `docs/KNOWN_ISSUES.md`'s Resolved section.

375/375 tests passing (up from 371 after this wave), type-check/lint/build clean. The
`ProductsPage` test-order flake (introduced wiring `ProductsTable`/`ProductForm` to
the new `useTaxRates()`/`useAllTaxRates()` hooks during Phase 5, see
`docs/KNOWN_ISSUES.md`'s Resolved section) is also fixed as of the same later pass —
`findByText`'s internal polling wasn't reliably catching a second async hop
(`ProductsTable`'s `useAllTaxRates()` fetch); switched to `waitFor(getByText)`.
Neither fix is committed yet.

**2026-08-22 follow-up — the real remaining Phase 6 blocker turned out not to be
warehouse/FIFO.** Starting on those surfaced that no Sales/Purchases line-item editor
let a user pick a product at all, and Invoices/Bills had no working post action in the
UI — meaning every Cost of Sales/Inventory posting above was only reachable via seed
data, never real user input. Fixed: product pickers added to both `LineItemsEditor`s
(and every form that uses them), `InvoiceForm` rebuilt onto the real
`TaxRateService`/shared editor (was hardcoding 15% VAT), `InvoicesPage` now wires
`onMarkAsSent`, and a new `BillForm`/"+ New Bill" flow + `BillDetail` post action make
a standalone Bill creatable and postable for the first time. Full detail in
`docs/KNOWN_ISSUES.md` and `docs/SA_SPEC_GAP_ANALYSIS.md`. 381/381 tests passing (up
from 375), type-check/lint/build clean.

Per-warehouse attribution done immediately after, same day: `DocumentLineItem`
carries an optional `warehouseId`, threaded through `InventoryPostingAdapter` and
every posting service, with a Warehouse picker in both `LineItemsEditor`s (shown only
when there's more than one warehouse to choose from). 386/386 tests passing.

User then asked for both remaining Phase 6 gaps at once: real 3-way PO/GRN/Invoice
matching AND FIFO valuation. Built PO/GRN matching first (new GRNI account, real GL
posting on `recordReceipt()`, GRNI-clearing on a linked Bill's `postBill()`), which is
what gave FIFO a genuine per-lot cost source to draw on — then built FIFO on top of
it. 408/408 tests passing (up from 386), type-check/lint/build clean. Phase 6 is now
✅ complete — every §116 checklist item, plus both refinements beyond it. See
`docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 6 section and `docs/KNOWN_ISSUES.md`'s Resolved
section for full detail and the deliberately-still-open boundaries (no FIFO
valuation-report UI, no true partial PO receipt, no PO-to-Bill price-variance
handling).

### Phase 7 (Fixed Assets) — ✅ COMPLETE (2026-08-22, Queen, solo)

Genuinely new module — no asset register, depreciation, disposal, or tax-register
support existed at all. Built in `src/features/assets/`:

- [x] Asset Register (§116) — `FixedAsset` type + `fixedAssetService`, draft-then-
  capitalize lifecycle matching Bill/Invoice/PurchaseOrder: `createFixedAsset()` writes
  a `'draft'` row with no GL history; `postAcquisition()` posts DR Fixed Asset
  (`acc_1500`) / CR a user-chosen funding account and flips to `'active'`. Cost/useful-
  life/method/dates/GL-mapping lock once capitalized (posted-record-immutability guard,
  applied to *edit* here rather than delete).
- [x] Depreciation (§116) — `depreciationService.runDepreciation(periodEnd)` posts ONE
  combined balanced journal entry per run (DR Depreciation Expense `acc_5200` / CR
  Accumulated Depreciation `acc_1590`, a contra-asset, per eligible asset). Idempotent
  per exact period-end; caps the charge so accumulated depreciation can never exceed
  the depreciable base; auto-flips an asset to `'fully_depreciated'` once exhausted.
  Straight-line and reducing-balance both supported,
  `calculateMonthlyDepreciation()` shared between the real run and any future preview.
- [x] Disposals (§116) — `assetDisposalService.disposeAsset()` posts CR Fixed Asset /
  DR Accumulated Depreciation / DR proceeds account, balanced by a gain (CR new
  `acc_4200`) or loss (DR new `acc_5300`) line. Terminal `'disposed'` status; rejects
  disposing a draft or already-disposed asset.
- [x] Tax Register (§116) — `taxRegisterService.getTaxRegister(asOfDate)`, read-only,
  compares accounting carrying value against a SARS wear-and-tear tax written-down
  value per asset. Every default rate flagged "typical/indicative, pending
  professional verification" (same caveat as `TaxRate.sourceReference`, §110/§111) —
  no deferred-tax posting (genuinely Phase 12).
- [x] Four pages wired to a new "Fixed Assets" nav section: Asset Register
  (`/assets/register`), Depreciation (`/assets/depreciation`), Disposals
  (`/assets/disposals`), Tax Register (`/assets/tax-register`).
- [x] Seed data (`src/mock-data/fixedAssets.ts`) is deliberately all `'draft'` — no
  fabricated posted history without a real matching `JournalEntry` behind it (the exact
  gap Phase 5's VAT reconciliation work found and fixed for seeded Invoices/Bills).
- [x] 31 new tests (service-layer + one page-level smoke test). 445/445 tests passing
  (up from 408), type-check/lint/build clean.

Deliberately still open, tracked in `docs/KNOWN_ISSUES.md`/`docs/SA_SPEC_GAP_ANALYSIS.md`:
no Bill-line capitalization path yet (`FixedAsset.sourceBillId` exists on the type but
nothing sets it — an asset is registered manually today, not driven by flagging a Bill
line item the way Inventory lines already capitalize); account-mapping is fixed
constants again (§113, same known limitation as every other posting service); no
deferred-tax journal entry from the Tax Register's temporary difference.

### Phase 8 (Payroll) — ✅ COMPLETE (2026-08-22, Queen, solo)

Genuinely new module, `src/features/employees/` — no employee master data or payroll
processing existed at all:

- [x] Employees (§57/§116) — `Employee` type (salary/wages, standard allowances/
  deductions, pay frequency, UIF-exempt flag) + `employeeService`, plain CRUD like
  `productService.ts`. Delete guard: an employee referenced by any payroll run's
  payslip lines can't be deleted, only set to `'terminated'` (real SA practice — a
  terminated employee's record must be retained for tax-certificate/record-keeping
  purposes, §61).
- [x] Payroll engine (§57/§116) — `PayrollRunService`: draft-then-post lifecycle
  matching Bill/Invoice/FixedAsset. `createPayrollRun()` computes a `PayslipLine` per
  active employee via `computePayslipLine()` (basic + overtime/bonus overrides +
  allowances → gross; PAYE/UIF/SDL; net pay as the exact remainder so the run's combined
  entry balances by construction). `postPayrollRun()` posts ONE combined balanced
  journal entry for the whole run (mirrors `depreciationService.runDepreciation()`'s
  one-entry-per-run design). Idempotency guard on overlapping pay periods.
- [x] PAYE/UIF/SDL (§58/§116) — `PayrollTaxYearConfig` (effective-dated by SARS tax
  year, `payrollTaxConfigService.getConfigForDate()`), real annual-equivalent PAYE
  bracket math with age-based rebate tiers, UIF employee+employer (rate-capped at a
  pro-rated monthly ceiling), SDL (company-wide exemption flag, `Company.sdlExempt`).
  Six new dedicated liability accounts (PAYE Payable, UIF Payable - Employee, UIF
  Payable - Employer, SDL Payable, Other Payroll Deductions Payable, Net Pay Payable) —
  §58's "do not combine all payroll liabilities into one account" enforced by
  construction, not just convention. Three new expense accounts (Salaries and Wages,
  Employer UIF Contribution, Employer SDL Contribution).
- [x] Tax periods (§59) — `getSarsTaxYear()` (`utils/sarsTaxYear.ts`) computes the real
  1 March-end February SARS tax year independent of `financialYearService`/
  `accountingPeriodService`, used by EMP501 below.
- [x] EMP201 (§60/§116) — `emp201Service.computeEmp201Report()` (PAYE/UIF/SDL from real
  posted payroll runs only, deliberately not labelled with official SARS box numbers,
  same caution as `vatReportService.ts`'s VAT201 treatment) +
  `reconcilePayrollLiabilities()` (each of the four control accounts checked
  separately against its own GL movement — proven clean by an integration test against
  a real posted run, not just unit-tested). Page at `/payroll/emp201`.
- [x] EMP501 (§60/§116) — `emp501Service.computeEmp501Report()` rolls up a full SARS
  tax year's worth of EMP201-equivalent monthly totals (reusing `computeEmp201Report()`
  per month so the two can never disagree). Page at `/payroll/emp501`.
- [x] Five pages, new "Payroll" nav section: Employee Directory (`/payroll/employees`),
  Payroll Runs (`/payroll/runs`, with an inline review/edit-then-post flow reusing the
  same `computePayslipLine()` path a line was created with), EMP201 (`/payroll/emp201`),
  EMP501 (`/payroll/emp501`).
- [x] Seed data (`src/mock-data/employees.ts`) has no seeded `PayrollRun` at all — same
  "no fabricated posted history without a real matching `JournalEntry`" discipline as
  `seedFixedAssets.ts`. Run a real payroll run through the UI for genuine ledger history.
- [x] 60 new tests (pure PAYE/UIF/SDL math, service-layer CRUD/lifecycle/idempotency
  guards, an EMP201/EMP501 integration test against a real posted run proving
  zero-variance reconciliation, one page-level smoke test). 522/522 tests passing (up
  from 462), type-check/lint/build clean.

**Tax figures verified 2026-08-22** (§110/§111): the PAYE bracket/rebate/UIF-ceiling/SDL
figures in `src/mock-data/payrollTaxConfig.ts` shipped as a Claude-reconstructed
placeholder, flagged unverified — same day, replaced by fetching sars.gov.za's own pages
directly for the real 2026/2027 individual tax rate table, UIF rate/ceiling, and SDL
rate/threshold, each cited by URL in the seed record. Cross-checked two independent
ways, agreed exactly. Full before/after in `docs/KNOWN_ISSUES.md`'s Resolved section.
Still a live-web check as of one date, not a substitute for professional sign-off, and
any future tax year's config must repeat it. See `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase
8 section for the full list of other deliberate simplifications (allowance/deduction
taxability as a boolean, no retirement-fund deduction cap, UIF exemption as a boolean,
SDL exemption as a whole-company flag rather than a real trailing-12-month payroll
projection, no IRP5/tax-certificate generation, no payslip PDF, no settings UI to add a
new SARS tax year's config without a code change).

### Phase 9 (Tax) — Wave 1 ✅ COMPLETE (2026-08-22, three bees in parallel + Queen integration)

Income Tax (§51/§52/§53), Capital Gains Tax (§55), and Dividends Tax (§56) — dispatched as
three parallel bees on disjoint folders (`src/features/tax/incomeTax/`,
`src/features/tax/capitalGains/`, `src/features/tax/dividendsTax/`), each independently
QA-verified, plus a Queen Bee integration pass wiring Capital Gains Tax's real taxable
capital gain into Income Tax's reconciliation. Full detail in
`docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 9 section. 631/631 tests passing (up from 522),
type-check/lint/build clean.

- [x] Corporate income tax computation (flat 27% / SBC brackets, SARS-verified 2026-08-22)
- [x] Accounting-profit-to-taxable-income reconciliation, editable adjustment lines
- [x] SBC eligibility as a manual, reason-required override (no shareholder data modeled)
- [x] Capital Gains Tax — base cost vs. accounting carrying value, entity-type inclusion
  rate, R50,000 annual exclusion, genuinely GL-inert (read-only reconciliation)
- [x] Dividends Tax — declare/pay/remit lifecycle, 20% withholding, real GL postings to
  new Dividends Payable/Dividends Tax Payable accounts
- [x] Provisional Tax (§54) — Wave 2 ✅ COMPLETE (2026-08-22, sequential, solo bee dispatch)
- [ ] Deferred Tax (§50) — explicitly Phase 12 per §116, not Phase 9

**Key Requirements:**
- ✅ Every rate/threshold effective-dated config with a real `sourceReference` (sars.gov.za,
  fetched live 2026-08-22), never hardcoded in logic
- ✅ `FinancialNumber`/`FinancialTableCell` for all amounts, tabular-nums, light+dark theme
- ✅ No bee touched another's folder or a shared config file mid-dispatch

**Phase 9 (Tax) Wave 2 — Provisional Tax, ✅ COMPLETE (2026-08-22).** Dispatched sequentially
(depends on Wave 1's Income Tax engine) at `src/features/tax/provisionalTax/`.
`ProvisionalTaxPeriod` holds all three payment slots (first/second/top-up) with due dates
computed from the company's own FinancialYear (not the unrelated SARS individual tax year);
estimates reuse `calculateTaxLiability()` from Income Tax rather than reimplementing SBC/flat
math; `payProvisionalTax()` posts DR Income Tax Payable (`acc_2300`) / CR Cash and Bank
(`acc_1000`) — no new GL account, since a provisional payment simply pre-pays the same
liability the final `TaxComputation` will credit at year-end, so the reconciliation (paid vs.
actual liability) falls out of the GL for free. No underpayment-interest calculation — SARS's
rate floats with the repo rate rather than being a fixed statutory figure, so only the plain
Rand-value gap is surfaced (§110/§111). 23 new tests.

#### Reports Module — ✅ COMPLETE (2026-08-22, three bees in parallel + one sequential Wave 2 bee)
- [x] Profit & Loss (`src/features/reports/financialStatements/`) — classified: Revenue →
  COGS → Gross Profit → Operating Expenses → Profit Before Tax → Income Tax Expense (new
  Phase 9 account) → Net Profit After Tax
- [x] Balance Sheet (same folder) — Assets (net of contra-assets) vs. Liabilities + Equity
  (Owner's Equity + Retained Earnings + a "Current Year Earnings" line reusing the Income
  Statement calc) — proves `isBalanced`, never assumes it
- [x] Cash Flow Statement (`src/features/reports/cashFlow/`, indirect method) — Operating
  (net profit + depreciation/disposal addbacks + AR/Inventory/AP working-capital deltas),
  Investing (Fixed Asset acquisitions net of real disposal proceeds), Financing (Owner's
  Equity movement, dividends paid net of withholding) — reconciles to the real Cash and
  Bank movement, proven non-circular by a dedicated negative-control test
- [x] Customer Aging Report + Supplier Aging Report (`src/features/reports/aging/`) — one
  row per entity, reusing the existing per-entity aging math (and fixing a real latent bug
  in `calculateAgingForCustomer` found along the way — see `docs/KNOWN_ISSUES.md`)
- [x] `FinancialNumber`/`FinancialTableCell` throughout, tabular-nums, light+dark theme
- [ ] Comparative reports (YoY, budget vs actual) — no budget entity exists anywhere in this
  app; YoY explicitly out of scope for this pass
- [ ] Notes to Financial Statements (§43), Statement of Changes in Equity, export/PDF/print
  — all explicitly out of scope, flagged in-code

92 test files / 706 tests passing project-wide after this wave (up from 631), type-check/
lint/build clean, independently QA-verified (zero defects found).

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for P&L and Report examples
- ✅ P&L: revenue, COGS, opex, net with +/- signs and percentages
- ✅ Right-aligned numbers, semantic colors (positive green, negative red)
- ✅ Dark + light theme tested

#### Phase 11 (Compliance) — ✅ COMPLETE (2026-08-22, solo pass)
- [x] Public Interest Score engine (§3, reg 26(2)) — `src/features/compliance/`. Real
  employee/turnover/liability points from real Employee/GL data via the Phase 10 Reports
  module's own calculators; shareholder points from a manual input (no shareholder
  register exists anywhere in this codebase). Append-only history per company.
- [x] Audit/independent-review suggestion (reg 28-29) and reporting-framework suggestion
  (reg 27) — `complianceDeterminations.ts`, cross-checked against CIPC/RSM/RandCo/The
  Glass Castle (WebFetch couldn't extract the primary Gazette PDF text). Never applies a
  suggestion automatically — `CompanyService.setReportingFramework()`'s existing
  reason-required override is the only path, now with a real UI entry point for the
  first time (Public Interest Score page).
- [x] Compliance Dashboard (§108) — `/compliance/dashboard`, aggregates VAT/Income
  Tax/Payroll/Company/Accounting status by re-running each module's own existing
  computation for the current month/open financial year, no new calculation logic.
  "Certificates" (no IRP5 generation) and a suspense account (§40, not modeled) shown as
  explicitly absent rather than faked.
- 25 new tests, 727/727 total, type-check/lint/build clean. Full detail in
  `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 11 section.

#### Phase 12 (Advanced Accounting) Wave 1 — Deferred Tax, ✅ COMPLETE (2026-08-22, new session, solo pass)
User chose to pace Phase 12's 10-item checklist one piece at a time given its size —
Deferred Tax first, since it reuses real existing data rather than needing a brand-new
module.
- [x] Deferred Tax engine (§50) — `src/features/tax/deferredTax/`. Real temporary
  differences auto-suggested from the Fixed Asset Tax Register (Phase 7's
  `taxRegisterService`), not `accountingProfit x taxRate`. Taxable differences always
  recognize a Deferred Tax Liability; deductible ones only recognize a Deferred Tax Asset
  when the user explicitly confirms it (§50's recognition criteria — never assumed).
  Draft-then-post; posts only the period MOVEMENT since the prior posted computation, not
  the full balance every time.
- [x] Three new GL accounts: `acc_1600` Deferred Tax Asset, `acc_2400` Deferred Tax
  Liability, `acc_5600` Deferred Tax Expense.
- 20 new tests, 747/747 total, type-check/lint/build clean. Full detail in
  `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 12 section.

#### Phase 12 (Advanced Accounting) Wave 2 — Expected Credit Losses, ✅ COMPLETE (2026-08-22, same session, solo pass)
- [x] ECL provision matrix on trade receivables (§46/IFRS 9's simplified approach) —
  `src/features/financialInstruments/`. Real gross receivables per aging bucket from the
  Customer Aging Report (`getCustomerAgingReport()`, never re-derived); loss rates always
  a manual per-bucket entry (no historical default-rate data exists in this codebase),
  carried forward from the prior posted computation for continuity. Same draft-then-post,
  movement-only-posting shape as Deferred Tax — a genuine reversal (overdue balance
  shrinking year-over-year) is proven by test.
- [x] Two new GL accounts: `acc_1150` Allowance for Doubtful Debts (contra-asset, nets
  against Accounts Receivable), `acc_5700` Impairment Loss - Expected Credit Losses.
- 18 new tests, 765/765 total, type-check/lint/build clean. Full detail in
  `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 12 section.

#### Phase 12 (Advanced Accounting) Wave 3 — ✅ COMPLETE except Leases (2026-08-23, new session, 3 parallel bees + 2 solo Queen passes)
- [x] Related Parties (§88) — `src/features/relatedParties/`, disclosure-only register +
  transaction log + summary, no GL posting. 21 new tests.
- [x] Foreign Exchange infrastructure (§33) — `src/features/foreignExchange/`, exchange
  rate engine + realized/unrealized gain-loss calculators + a standalone FX Calculator
  tool. Explicitly does NOT integrate with real Invoices/Bills/Customers/Bank Accounts
  (none of them carry a foreign transaction currency yet) — flagged, not faked. 18 new
  tests.
- [x] Reporting Standards versioning (§48/§49) — `src/features/compliance/` (new
  `ReportingStandardService` alongside Public Interest Score). Resolves which edition of
  Full IFRS/IFRS for SMEs applies to a period; IFRS-for-SMEs 2025 edition date from the
  master spec text, IFRS 18's date independently verified live. 8 new tests.
- [x] Consolidation architecture (§87) — audited, not built (the spec's own wording is
  "architect for future support," not a feature). Findings recorded as ADR 003 in
  `docs/DECISIONS.md`: nothing in the schema blocks future consolidation, but the real
  prerequisite (multi-company tenant scoping, §75) doesn't exist yet.
- 844/844 tests total, type-check/lint/build clean. Full detail in
  `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 12 section.
- [x] Leases (§32/§47) — `src/features/leases/`, lessee-only, draft→commence→amortize→
  terminate lifecycle mirroring Fixed Assets. PV-of-annuity initial recognition,
  combined-entry periodic amortization run (interest + principal + ROU depreciation via
  the debit-vector technique), termination gain/loss reusing the existing Fixed-Asset
  disposal accounts. 32 new tests. All three bees resumed cleanly once after hitting the
  session usage-limit checkpoint mid-build (SendMessage-resume, same precedent as Phase
  9 Wave 2).

**Phase 12 (Advanced Accounting) — ✅ FULLY COMPLETE, 2026-08-23.** Every §116 checklist
item now has a real answer. 844/844 tests total, type-check/lint/build clean.

#### Admin Module (Admin Bee) — BACKEND FOR COMPANY SETTINGS + AUDIT LOGS DONE, UI STILL TO DISPATCH
- ✅ `CompanyService` (`src/features/admin/services/companyService.ts`) — CRUD +
  `setReportingFramework()` (reason-required override, audit-logged). `AuditLogService`
  is shared at `src/services/auditLogService.ts`, not admin-owned, since Accounting/
  Sales/Purchases/Banking all write to it — but the existing `AuditPage.tsx`
  placeholder is exactly where a UI reads from it.
- [ ] Users & Roles (company setup, user management, permissions)
- [ ] Company Settings page (name, currency, tax IDs, fiscal year — service ready)
- [ ] Audit Logs page (transaction history, user actions, GL posting audit trail —
  `auditLogService.getAll()`/`getForRecord()` ready to consume)
- [ ] Backup & Export

## Phase 3: Compliance & Reporting
- [ ] Advanced Tax Scenarios (Input VAT recovery, withholding tax)
- [x] Fixed Assets Register (depreciation, disposal) — see Phase 7 section above,
  ✅ complete 2026-08-22 (`src/features/assets/`)
- [x] Employee Management & Payroll — see SA_ACCOUNTING_MASTER_SPEC.md Phase 8 section
  above/below, ✅ complete 2026-08-22 (`src/features/employees/`): Employee master data,
  a draft-then-post PayrollRun engine (PAYE/UIF/SDL), payroll GL posting to dedicated
  liability accounts, EMP201 monthly return + reconciliation, EMP501 annual reconciliation
- [ ] Workflow Rules & Approvals

---

## Phase 2 Kickoff Checklist

**For each worker bee:**
1. ✅ Read `docs/PHASE_2_READINESS.md` — understand financial UI infrastructure
2. ✅ Read `docs/FINANCIAL_UI_GUIDE.md` — implement patterns correctly
3. ✅ Import from `src/utils/formatFinancial.ts` for all number formatting
4. ✅ Use `FinancialNumber` component for all amounts
5. ✅ Test light + dark theme
6. ✅ Right-align all numbers, left-align labels
7. ✅ Show +/- signs on all P&L values
8. ✅ Use semantic color tokens (text-positive, text-negative, text-warning-financial)
9. ✅ Create mock repositories in feature folders
10. ✅ Implement 20-point Definition of Done before marking module complete

**Queen Bee coordination:**
- ✅ Dispatch Wave 1 (Sales + Purchases) in parallel
- ✅ Wave 2 (Banking + Accounting) waits for Wave 1 GL integration (2 days)
- ✅ Wave 3 (Tax + Reports) waits for Wave 2 GL & AR/AP posting (2 days)
- ✅ QA Bee validates each module before integration
- ✅ Integration Bee verifies cross-module data flow before mark done