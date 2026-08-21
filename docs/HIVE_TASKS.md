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

#### Sales Module (Sales Bee) — DISPATCHED 2026-08-21
- [ ] Quotes (draft, preview, convert to SO)
- [ ] Sales Orders (from quote or standalone, line items with Inventory integration)
- [ ] Invoices (from SO or standalone, tax calculations, AR aging)
- [ ] Credit Notes (refunds, account credits, allocation to open invoices)
- [ ] Customer Receipts (payment allocation to invoices)
- [ ] Financial tables with proper number alignment (tabular-nums, semantic colors)
- [ ] Use `FinancialNumber` and `FinancialTableCell` components
- [ ] Integration: Customers aging, Inventory stock reduction, GL posting

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for number formatting patterns
- ✅ All currency displays use `FinancialNumber` component
- ✅ Invoice tables: right-aligned prices, tabular-nums
- ✅ Test light + dark theme
- ✅ Mock repository: `src/features/sales/repositories/MockSalesRepository.ts`
- ✅ Domain types: Quote, SalesOrder, Invoice, CreditNote, CustomerReceipt in `src/types/sales.types.ts`
- ✅ Definition of Done checklist in `docs/DO_NOT_BREAK.md` (20 points)

#### Purchases Module (Purchases Bee) — DISPATCHED 2026-08-21
- [ ] Purchase Orders (to suppliers, line items, quantities)
- [ ] Supplier Bills (receipt & matching against PO)
- [ ] Payment Register (cash disbursement, cheque/EFT)
- [ ] Vendor Aging (AP analysis by age bucket)
- [ ] Financial tables with proper alignment
- [ ] Use `FinancialNumber` for all amounts
- [ ] Integration: Suppliers aging, Inventory receipt, GL posting

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for financial UI patterns
- ✅ All amounts use `FinancialNumber` with `formatCurrency`
- ✅ Bill matching: highlight matched/unmatched pairs with semantic colors
- ✅ Mock repository: `src/features/purchases/repositories/MockPurchasesRepository.ts`
- ✅ Domain types: PurchaseOrder, Bill, Payment in `src/types/purchases.types.ts`

### Wave 2 (Sequential — Banking & Accounting, depend on Wave 1)

#### Banking Module (Banking Bee) — READY TO DISPATCH
- [ ] Bank Accounts (setup, multi-currency, SA bank metadata)
- [ ] Bank Transactions (receipts, payments, transfers, reconciliation)
- [ ] Statement Import (OFX, CSV, MT940 formats)
- [ ] Bank Reconciliation (matching, outstanding items, audit trail)
- [ ] Transaction lists with debit/credit columns (right-aligned, tabular-nums)
- [ ] Running balance with tick-flash on updates
- [ ] Use `FinancialNumber` with tick-flash animation
- [ ] Integration: Links to GL accounts, AR/AP matching

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for Bank Transaction example
- ✅ Debit/Credit columns: right-aligned numbers
- ✅ Running balance: `FinancialNumber` with `showFlash={true}`
- ✅ Reconciliation workspace: semantic colors for matched/unmatched
- ✅ Mock repository: `src/features/banking/repositories/MockBankingRepository.ts`

#### Accounting Module (Accounting Bee) — READY TO DISPATCH
- [ ] Chart of Accounts (asset/liability/equity/income/expense structure)
- [ ] General Ledger (transaction-level detail, GL posting from sales/purchases/banking)
- [ ] Journal Entries (manual entry, reversals, corrections)
- [ ] Trial Balance (period-end summary, balance verification)
- [ ] GL reports with proper number formatting
- [ ] Debit/Credit columns (right-aligned, tabular-nums)
- [ ] Use `FinancialNumber` for all amounts
- [ ] Integration: GL posting from Sales/Purchases/Banking, feeds into Trial Balance

**Key Requirements:**
- ✅ Read `docs/FINANCIAL_UI_GUIDE.md` for GL table examples
- ✅ Debit/Credit: right-aligned numbers, semantic colors for positive/negative
- ✅ Trial Balance: ensure balanced (total debits = total credits)
- ✅ Mock repository: `src/features/accounting/repositories/MockAccountingRepository.ts`

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

#### Admin Module (Admin Bee) — READY TO DISPATCH
- [ ] Users & Roles (company setup, user management, permissions)
- [ ] Company Settings (name, currency, tax IDs, fiscal year)
- [ ] Audit Logs (transaction history, user actions, GL posting audit trail)
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