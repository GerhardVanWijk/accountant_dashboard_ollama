# Phase 2 Kickoff Briefing — All Worker Bees

**Date:** 2026-08-21
**Status:** 🚀 READY TO DISPATCH
**Financial UI Infrastructure:** ✅ Complete (mdskills/financial-ui-patterns integrated)

---

## Phase 1 Complete — You're Ready for Prime Time

Phase 1 (Dashboard, Customers, Suppliers, Inventory) is fully QA-verified with 90 passing tests.

Phase 2 introduces **transactional modules** that display financial data (invoices, bills, P&L, bank transactions, ledger entries). These require professional number formatting, semantic colors, and strict alignment — all now provided by the financial UI infrastructure.

---

## 🎯 What Each Bee Will Build

### 🐝 Sales Bee — Build Order-to-Cash Pipeline

**Scope:** `src/features/sales/`

**Build These:**
1. **Quotes** — draft quotes with line items, conversion to sales order
2. **Sales Orders** — from quote or standalone, quantity tracking, ready-to-invoice
3. **Invoices** — from sales order or standalone, AR aging, payment tracking
4. **Credit Notes** — refunds, account credits, allocation to open invoices
5. **Customer Receipts** — payment application against specific invoices

**Financial Tables You'll Build:**
- Invoice line items table (description | qty | unit price | tax | total)
- Invoice summary (subtotal | tax | total) with `FinancialNumber`
- Customer receipts allocation table (invoice # | amount due | payment | remaining)

**Data Flow:**
- Customers Service → aging data (real, from Phase 1)
- Inventory Service → stock check, unit prices (real, from Phase 1)
- Accounting Service → GL posting (you'll create this, Banking Bee integrates)

**Definition of Done (20 points):**
✅ See `docs/DO_NOT_BREAK.md` — you must hit all 20 points.

---

### 🐝 Purchases Bee — Build Procure-to-Pay Pipeline

**Scope:** `src/features/purchases/`

**Build These:**
1. **Purchase Orders** — to suppliers, line items, quantities
2. **Supplier Bills** — receipt of bills, matching against PO
3. **Payment Register** — cash payments (cheque/EFT)
4. **Vendor Aging** — AP analysis (current/30/60/90+ buckets)

**Financial Tables You'll Build:**
- Bill line items table (description | qty | unit cost | tax | total)
- Bill summary with semantic colors (subtotal | tax | total)
- Vendor aging analysis (vendor | current | 30+ | 60+ | 90+ | total)

**Data Flow:**
- Suppliers Service → aging data (real, from Phase 1)
- Inventory Service → receipt & stock increase (real)
- Accounting Service → GL posting (Banking Bee connects)

**Definition of Done:**
✅ See `docs/DO_NOT_BREAK.md` — all 20 points must pass.

---

### 🐝 Banking Bee — Build Cash Management & Reconciliation

**Scope:** `src/features/banking/`

**Build These:**
1. **Bank Accounts** — multi-currency, SA bank metadata, GL linking
2. **Bank Transactions** — receipts, payments, transfers
3. **Statement Import** — OFX/CSV/MT940 parsers
4. **Bank Reconciliation** — matching, outstanding items, audit trail

**Financial Tables You'll Build:**
- Bank transaction list (date | description | debit | credit | balance)
  - Debit/Credit columns: right-aligned, semantic colors, `FinancialNumber`
  - Balance column: tick-flash animation on update
- Reconciliation workspace (statement items | GL items | matched | outstanding)

**Data Flow:**
- GL Accounts → linking bank accounts to COA (Accounting Bee provides)
- AR/AP Matching → invoice matching (Sales/Purchases Bee feed)
- GL Posting ← banking transactions (you post to GL)

**Definition of Done:**
✅ All 20 points in `docs/DO_NOT_BREAK.md`.

---

### 🐝 Accounting Bee — Build GL, Journals, Chart of Accounts

**Scope:** `src/features/accounting/`

**Build These:**
1. **Chart of Accounts** — asset/liability/equity/income/expense hierarchy
2. **General Ledger** — transaction-level detail, GL posting from sales/purchases/banking
3. **Journal Entries** — manual entry, reversals, corrections
4. **Trial Balance** — period-end summary, balance verification (must balance)

**Financial Tables You'll Build:**
- GL ledger (date | reference | description | debit | credit | balance)
  - Debit/Credit: right-aligned numbers, semantic colors
  - Balance: running total with tick-flash
- Trial Balance (account | debit | credit)
  - Total debits = total credits (must verify)
- Journal entry table (date | account | description | debit | credit)

**Data Flow:**
- GL Posting ← from Sales/Purchases/Banking (they call your GL posting service)
- AR/AP Aging feeds this (you provide the trial balance)
- Reports depend on you (Reports Bee queries your GL)

**Definition of Done:**
✅ All 20 points in `docs/DO_NOT_BREAK.md`.

---

### 🐝 Tax Bee — Build Tax Calculations & Reporting

**Scope:** `src/features/tax/`

**Build These:**
1. **Tax Rates** — VAT (standard/zero-rated/exempt), income tax brackets
2. **Tax Calculations** — auto-calc on sales/purchases documents
3. **VAT Reporting** — input/output VAT analysis, reconciliation
4. **Tax Statements** — seasonal analysis, deferred tax

**Financial Tables:**
- Tax rate tables (rate type | percentage | effective date)
- VAT reconciliation (input VAT | output VAT | balance)
- Tax liability statement (tax due | paid | balance)

**Data Flow:**
- Tax Rates Service ← used by Sales Bee (invoice tax calc)
- VAT Reporting ← from GL posting (tax GL accounts)
- Reports feed from you (Reports Bee needs tax liabilities)

---

### 🐝 Reports Bee — Build Financial Statements & Analysis

**Scope:** `src/features/reports/`

**Build These:**
1. **Profit & Loss** — revenue - COGS - opex = net income
2. **Balance Sheet** — assets = liabilities + equity
3. **Cash Flow** — operating, investing, financing
4. **Aging Reports** — customer aging (from Customers), vendor aging (from Suppliers)
5. **Key Financial Ratios** — liquidity, profitability, efficiency

**Financial Tables:**
- P&L statement (revenue | COGS | gross profit | opex | EBITDA | net income)
  - Use `FinancialNumber` with `formatCurrency` and `formatPercentage`
  - Semantic colors (revenue green, expenses red)
  - Segment analysis (by product, by customer, by region)
- Balance sheet (assets | liabilities | equity, with line subtotals)
- Cash flow (beginning balance | operating CF | investing CF | financing CF | ending balance)

**Data Flow:**
- GL data ← from Accounting Bee (query GL accounts by type)
- Customer aging ← from Customers/Invoices (AR aging)
- Supplier aging ← from Suppliers/Bills (AP aging)
- Cash flow ← from Banking Bee (transaction analysis)

---

### 🐝 Admin Bee — Build Admin & Settings

**Scope:** `src/features/admin/`

**Build These:**
1. **Users & Roles** — user management, role assignment, permissions
2. **Company Settings** — company info, currency, tax IDs, fiscal year
3. **Audit Logs** — transaction history, GL posting audit trail
4. **Backup & Export**

**Definition of Done:**
✅ All 20 points in `docs/DO_NOT_BREAK.md`.

---

## 📚 Critical Learning: Financial UI Patterns

**BEFORE YOU START CODING:**

Read these in order:
1. `docs/FINANCIAL_UI_GUIDE.md` (30+ code examples)
2. `docs/DESIGN_SYSTEM.md` (Financial UI Patterns section)
3. `docs/DO_NOT_BREAK.md` (Financial UI Patterns rules)

**Key Patterns (TL;DR):**

```tsx
// ✅ ALWAYS use FinancialNumber for amounts
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

<FinancialNumber value={1234.56} format={formatCurrency} minWidth={100} />

// ✅ Tabular-nums is automatic (component handles it)
// ✅ Semantic colors automatic (positive/negative)
// ✅ +/- prefix automatic (shows "+1,234.56" not "1,234.56")
// ✅ Tick-flash automatic (value changes flash green/red)

// ✅ Building a table
<div className="grid grid-cols-[2fr_120px_120px_120px] gap-2 tabular-nums">
  <div className="text-left">Label</div>
  <div className="text-right">
    <FinancialNumber value={123.45} format={formatCurrency} />
  </div>
  {/* more columns */}
</div>
```

**DO NOTs:**
- ❌ `text-green-500`, `text-red-500` (use `text-positive`, `text-negative`)
- ❌ No `tabular-nums` (digits shift on update, row reflows)
- ❌ No +/- sign (color-only fails for colorblind users)
- ❌ Center numbers (eye can't compare magnitudes)
- ❌ `bg-${color}-500/10` dynamic classes (won't render)

---

## 🚀 Dispatch Schedule

### Wave 1 (Parallel — Start Now)
- **Sales Bee** — Start building Quotes → Orders → Invoices
- **Purchases Bee** — Start building POs → Bills → Payments

**Dependency:** Both need GL posting from Accounting (start mock GL, finalize when Accounting Bee is ready)

### Wave 2 (After Wave 1 GL Posts — ~2 days)
- **Banking Bee** — Start building Bank Accounts → Transactions → Reconciliation
- **Accounting Bee** — Start building COA → GL → Journal → Trial Balance

**Dependency:** Wait for Sales/Purchases GL posting to finalize GL structure

### Wave 3 (After Wave 2 Complete — ~2 days)
- **Tax Bee** — Build Tax Rates → Tax Calculations → VAT Reporting
- **Reports Bee** — Build P&L → Balance Sheet → Cash Flow → Aging
- **Admin Bee** — Build Users → Settings → Audit Logs

---

## 📋 Acceptance Criteria

Every module must pass:

### Build
- ✅ `npm run build` — no errors
- ✅ `npm run lint` — no warnings
- ✅ `npm run type-check` — no type errors
- ✅ No hardcoded values, no console.error()

### Functionality
- ✅ List page with table (5+ rows visible)
- ✅ Create page/form
- ✅ Edit functionality
- ✅ View/detail page
- ✅ Delete/inactivate (where appropriate)
- ✅ Search (where appropriate)
- ✅ Filtering (where appropriate)
- ✅ Sorting (where appropriate)

### States
- ✅ Loading state (spinner)
- ✅ Empty state (message)
- ✅ Error state (error message)
- ✅ Success state (data displayed)

### Design
- ✅ Light theme works perfectly
- ✅ Dark theme works perfectly
- ✅ Mobile responsive (test at 320px, 768px, 1024px)
- ✅ Financial tables: `tabular-nums`, right-aligned numbers, semantic colors
- ✅ Numbers have +/- signs where applicable

### Quality
- ✅ 90% test coverage
- ✅ Mock repository fully wired
- ✅ Types defined (no `any`)
- ✅ Services use repositories (components never import repos)
- ✅ Zustand store for state management (if needed)

### Financial UI
- ✅ Every number uses `FinancialNumber` or manual formatting
- ✅ Every color is semantic token (text-positive, text-negative, etc.)
- ✅ All numbers right-aligned, labels left-aligned
- ✅ Tickers/IDs use `font-mono`
- ✅ No raw Tailwind colors

See full 20-point checklist in `docs/DO_NOT_BREAK.md`.

---

## 🎯 Success Metrics

**Phase 2 is complete when:**
1. ✅ Sales module ships (Quotes → Invoices)
2. ✅ Purchases module ships (POs → Bills)
3. ✅ Banking module ships (Accounts → Reconciliation)
4. ✅ Accounting module ships (COA → Trial Balance)
5. ✅ Tax module ships (Tax Rates → VAT Reporting)
6. ✅ Reports module ships (P&L → Balance Sheet → Cash Flow)
7. ✅ Admin module ships (Users → Settings → Audit)
8. ✅ All modules pass QA checklist
9. ✅ All modules integrated (data flows between them)
10. ✅ 200+ tests passing
11. ✅ Zero build errors / warnings / type errors
12. ✅ Light + dark themes perfect
13. ✅ Mobile responsive end-to-end

---

## 📞 Questions?

Each bee should:
1. Read `docs/PHASE_2_READINESS.md` (infrastructure overview)
2. Read `docs/FINANCIAL_UI_GUIDE.md` (implementation examples)
3. Read your specific bee definition (`.claude/agents/[your-bee]-bee.md`)
4. Read `docs/DO_NOT_BREAK.md` (hard constraints)
5. Ask the Queen Bee if unclear

---

## Let's Build! 🐝

**Status:** All worker bees are on standby, briefed, and ready to ship Phase 2.

Wave 1 bees (Sales, Purchases) should start immediately.
Wave 2 bees (Banking, Accounting) should prepare and stand by.

Let's make this the most professional accounting suite on the internet! 👑

**GO PHASE 2!** 🚀
