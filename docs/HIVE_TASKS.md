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

## Phase 2: Transactional Modules
- [ ] Sales (Quotes, Orders, Invoices, Credit Notes)
- [ ] Purchases (PO, Supplier Bills, Payments)
- [ ] Banking & Reconciliation
- [ ] General Ledger, Journals & Chart of Accounts

## Phase 3: Compliance & Reporting
- [ ] Tax & VAT Module
- [ ] Expenses & Reimbursements
- [ ] Fixed Assets Register
- [ ] Financial Reports & Management Statements
- [ ] Administration, Roles, Audit Logs & Settings