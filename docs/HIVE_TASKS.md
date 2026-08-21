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
- No `TaxRate` repository/service exists anywhere yet (Tax module is Wave 3) — Banking
  reads a local `src/mock-data/taxRates.ts` seed typed against the real `TaxRate`
  model, same stopgap Inventory used pre-Sales.
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

#### Tax Module (Tax Bee) — READY TO DISPATCH
- [ ] Tax Rates (VAT standard/zero-rated/exempt, income tax brackets)
- [ ] Tax Calculations (auto-calc on sales/purchases documents)
- [ ] VAT Reporting (input/output VAT analysis, reconciliation)
- [ ] Seasonal tax analysis with charts
- [ ] Tax tables with percentages and amounts
- [ ] Use `FinancialNumber` for tax amounts

#### Reports Module (Reports Bee) — READY TO DISPATCH
- [ ] Profit & Loss (revenue - COGS - opex = net income)
- [ ] Balance Sheet (assets = liabilities + equity)
- [ ] Cash Flow (operating, investing, financing activities)
- [ ] Customer Aging (current/30/60/90+ buckets)
- [ ] Supplier Aging (current/30/60/90+ buckets)
- [ ] Key P&L reports with financial number formatting
- [ ] Use `FinancialNumber` for all currency and percentage displays
- [ ] Comparative reports (YoY, budget vs actual)

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for P&L and Report examples
- ✅ P&L: revenue, COGS, opex, net with +/- signs and percentages
- ✅ Right-aligned numbers, semantic colors (positive green, negative red)
- ✅ Dark + light theme tested

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
- [ ] Fixed Assets Register (depreciation, disposal)
- [ ] Employee Management & Payroll (not Phase 2 scope)
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