# HIVE TASK BOARD

## Phase 0: Foundation & Core System Shell
- [x] Base Vite + React + TypeScript setup — Vite 5 + React 18 + TS strict, ESLint, Vitest, `npm install`/`build`/`type-check`/`test` all pass
- [x] Shared Design System Tokens & Base UI Components (`src/components/ui/`) — `src/styles/tokens.css` (dark default, `[data-theme="light"]` override) wired into `tailwind.config.js`; base `Button`/`Card` primitives
- [x] Global Layout, Sidebar Navigation, Theme Toggle — `src/components/layout/{AppLayout,Sidebar,Topbar,ThemeToggle}.tsx`, nav driven by `src/config/navigation.ts` (1:1 with ROUTES.md)
- [ ] Generic Repository & Local Storage Mock Database Engine — `IRepository<T>` contract + one fully-wired example (`MockCustomerRepository`) done, but per ADR 001 it is an **in-memory** store, not localStorage-persisted; not checking this box as written since "Local Storage" specifically isn't implemented. Other feature mock repositories are not yet built — left for the owning feature bees.

## Phase 1: Core Business Modules — Wave 1 ✅ COMPLETE (2026-08-20)
- [ ] Executive Dashboard Module — Wave 2, next up (depends on Wave 1 services below)
- [x] Customers Module — list/detail/create/edit, aging, credit control, inactivate-not-delete guard, 4-tab form; QA-verified
- [x] Suppliers Module — list/detail/create/edit, aging, AP summary, delete-guard on linked history, 4-tab form; QA-verified
- [x] Products & Inventory Module — products + warehouses + immutable stock-movement ledger, WAC valuation, low-stock service/widget ready for Dashboard Bee; QA-verified

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