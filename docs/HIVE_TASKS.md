# HIVE TASK BOARD

## Phase 0: Foundation & Core System Shell
- [x] Base Vite + React + TypeScript setup — Vite 5 + React 18 + TS strict, ESLint, Vitest, `npm install`/`build`/`type-check`/`test` all pass
- [x] Shared Design System Tokens & Base UI Components (`src/components/ui/`) — `src/styles/tokens.css` (dark default, `[data-theme="light"]` override) wired into `tailwind.config.js`; base `Button`/`Card` primitives
- [x] Global Layout, Sidebar Navigation, Theme Toggle — `src/components/layout/{AppLayout,Sidebar,Topbar,ThemeToggle}.tsx`, nav driven by `src/config/navigation.ts` (1:1 with ROUTES.md)
- [ ] Generic Repository & Local Storage Mock Database Engine — `IRepository<T>` contract + one fully-wired example (`MockCustomerRepository`) done, but per ADR 001 it is an **in-memory** store, not localStorage-persisted; not checking this box as written since "Local Storage" specifically isn't implemented. Other feature mock repositories are not yet built — left for the owning feature bees.

## Phase 1: Core Business Modules
- [ ] Executive Dashboard Module
- [ ] Customers Module
- [ ] Suppliers Module
- [ ] Products & Inventory Module

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