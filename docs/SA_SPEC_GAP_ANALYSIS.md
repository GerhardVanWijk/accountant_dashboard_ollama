# SA Accounting Master Spec — Gap Analysis

What exists in this codebase today versus `docs/SA_ACCOUNTING_MASTER_SPEC.md` (117
sections, 12 build phases per §116). **Updated 2026-08-21** after Phase 2 Wave 1b
(Sales/Purchases module UIs + real GL posting) landed, re-reading the full spec against
the current codebase rather than just Phase 1. Phases 1-4 of the spec's own build order
(Accounting Core, Customers, Suppliers, Banking) now have real implementations to
assess; Phases 5-12 (VAT, Inventory valuation, Fixed Assets, Payroll, Tax, Financial
Reporting, Compliance, Advanced Accounting) are still not started, consistent with
§116's ordering — not reassessed in detail below beyond noting what's genuinely absent.

## Phase 1 — Accounting Core

| Spec requirement | Status | Where |
|---|---|---|
| Chart of Accounts | ✅ exists | `src/types/account.ts`, `src/features/accounting/{repositories,services}/*Account*` |
| General Ledger / Journals / Journal Lines | ✅ exists | `src/types/journalEntry.ts`, `journalEntryService.ts` |
| Debits = Credits enforced, no exception | ✅ exists (app layer only — see below) | `journalEntryService.validateLines()` |
| Trial Balance | ✅ exists | `journalEntryService.computeTrialBalance()` |
| No deletion of posted records | ✅ exists | `IJournalEntryRepository` has no update()/delete() |
| Reversal instead of edit | ✅ exists | `journalEntryService.reverseJournalEntry()` |
| **Company entity** (§2: legal entity type, reporting framework, year-end, functional/presentation currency, VAT/tax registration status) | ✅ exists | `src/types/company.ts`, `src/features/admin/{repositories,services}/*Company*` |
| **Financial Year** | ✅ exists (minimal) | `src/types/financialYear.ts`, `src/features/accounting/services/financialYearService.ts` |
| **Accounting Periods** (open/soft-closed/closed/locked, §35 + §68) | ✅ exists, and enforced | `src/types/accountingPeriod.ts`, `accountingPeriodService.ts`; `journalEntryService.postJournalEntry()`/`reverseJournalEntry()` now reject posting outside an 'open' period |
| **Audit Trail** (§37: append-only log of who/what/when/previous/new value, across create/edit/post/approve/reverse/period-close/reopen/permission changes) | ✅ exists, and wired in | `src/types/auditLog.ts`, `src/services/auditLogService.ts` (shared, append-only); every journal post/reversal and every period/financial-year/reporting-framework transition writes an entry |
| Public Interest Score engine (§3) | ❌ still missing, deliberately | requires verifying the exact Companies Regulations calculation methodology against source legislation — not done, not guessed. `Company.publicInterestScore` exists as a manually-entered field only. |
| Reporting framework determination (Full IFRS / IFRS for SMEs / other) (§2) | ❌ still missing, deliberately | same reason — depends on the Public Interest Score engine above. `Company.reportingFramework` defaults to `'not_yet_determined'` and can only be set via `CompanyService.setReportingFramework()`, which requires a recorded reason (the "authorized override" mechanism §2 requires) |

**Phase 1 core is now done**: Company, Financial Year, Accounting Periods (with real
open/closed/locked enforcement at the posting boundary), Chart of Accounts, General
Ledger, Journals, Trial Balance, and an append-only Audit Trail wired into every
posting/reversal/period-transition/reporting-framework-change. 203 tests passing,
build/lint/type-check clean as of 2026-08-21.

**Deliberately still open, and why that's the right call, not an oversight:**
- **Public Interest Score + automatic reporting-framework determination** — both
  require a verified reading of the Companies Regulations, 2011 methodology. Guessing
  the formula would violate §110 ("no unsupported claims"). `reportingFramework` is a
  manually-set, reason-required override in the meantime.
- **Real user attribution** — `JournalEntryService`/audit entries accept a `userId`
  parameter and fall back to a `SYSTEM_USER_ID` sentinel when none is supplied, because
  there's no real authenticated session yet (`src/stores/authStore.ts` is a boolean
  stub). Every audit entry today is either accurately attributed (when a caller passes
  a real id) or honestly marked "system", never falsely attributed to a specific person.
- **Segregation-of-duties / role-based "who may reopen a period"** — §38/§39's
  approval-workflow requirements aren't modeled; `reopenPeriod()` requires a reason but
  not a specific role, because there's no real roles/permissions system to check against
  yet (only a stub `Role`/`User` type exists — see `src/types/role.ts`).
- **Multi-company tenant scoping** (§75) — `Company` exists as a real entity, but no
  other type (Customer, Invoice, JournalEntry, etc.) carries a `companyId` yet, and
  there's no access-control layer enforcing per-company isolation. This MVP is
  effectively single-company; true multi-tenancy is a larger, separate migration.

## Known deviation from the spec, already flagged before this spec existed

`src/types/taxRate.ts` (`TaxRate`) is exactly the anti-pattern §9 forbids: a flat
`rate: number` with no `effective_from`/`effective_to`, no jurisdiction, no source
reference, no distinction between VAT treatment types (standard/zero-rated/exempt/
etc.). This predates the master spec (Phase 0 scaffold) and needs to be redesigned
as part of Phase 5 (VAT), not patched in place — a real config/versioning model per
§82/§113, not an extra column bolted onto the existing type.

## Phase 2/3 (Customers/Sales, Suppliers/Purchases) — GL posting real, gaps fixed (Wave 1b + 2026-08-21 follow-up)

| Spec requirement | Status | Where |
|---|---|---|
| Invoices post to GL (§8, §100) | ✅ | `invoiceService.postInvoice()` (called by `markInvoiceAsSent()`): DR AR, CR Sales Revenue, CR VAT Output |
| Bills post to GL (§8, §100) | ✅ | `billService.postBill()`: DR Expense, DR VAT Input, CR AP |
| Credit notes reverse the GL entry, not the original (§15, §36) | ✅ | `creditNoteService.issueCreditNote()` posts a genuinely reversing entry; original invoice is untouched |
| Credit note allocation against open invoices (§15) | ✅ | `creditNoteService.allocateToInvoice()` → `InvoiceService.recordPayment()` |
| Customer receipts, multi-invoice allocation (§17) | ✅ | `customerReceiptService` |
| Vendor payments, multi-bill allocation (§18) | ✅ | `paymentService` (Purchases) |
| Quote → Sales Order → Invoice conversion chain (§63, §99 traceability) | ✅ (partial) | `quoteService.convertToSalesOrder()`, `salesOrderService.convertToInvoice()` — the resulting invoice is a draft, posted separately when the user marks it Sent (deliberate: matches "sending" an invoice being a distinct action, not silently posting on conversion) |
| PO → Bill conversion (§63) | ✅, and no longer double-clickable | `PurchaseOrdersPage`'s convert action composes `createBill()`+`postBill()`; `PurchaseOrder.billId` (added 2026-08-21) blocks converting the same PO twice, enforced in `purchaseOrderService.convertToBill()` itself, not just the UI |
| Debtors/Creditors ageing (§17, §18, §64) | ✅ fixed 2026-08-21 | `invoicesToOpenItems()`/`billsToOpenBills()` adapters feed real, non-draft/non-void Invoice/Bill data (aged on outstanding balance) into the existing aging math — Customer/Supplier Detail pages and the Dashboard's fleet-wide aggregation all consume real data now |
| Customer/Supplier subledger reconciles to AR/AP control account (§17, §18, §70) | ✅ fixed 2026-08-21 | `src/features/accounting/services/subledgerReconciliation.ts`'s `reconcileAccountsReceivable()`/`reconcileAccountsPayable()`, compared against `journalEntryService.getAccountLedger()`'s real posted balance; surfaced on the Trial Balance page, 5 tests |
| Tax invoice required fields (§13) | ✅ fixed 2026-08-21, still partial | `InvoiceDetail`/`CreditNoteDetail` now render the real `Company` name + VAT registration number + CIPC registration number via `useCompany()`. Still missing: `Company` has no address field to render (not fabricated — genuinely absent from the type) |
| Invoice numbering is sequential/unique/immutable (§14) | ⚠️ partial, not addressed in this pass | Seed data and UI-suggested next-numbers (`nextDocumentNumber.ts`) follow a `PREFIX-YEAR-NNNN` pattern, but no service enforces uniqueness or sequentiality at creation time — `createInvoice()`/`createBill()`/etc. accept whatever `invoiceNumber`/`billNumber` string the caller passes. Not exploitable via the current UI (forms pre-fill the suggested next number), but not enforced at the layer the spec requires. |
| No deletion of posted documents (§14, §36, §72, §79) | ✅ fixed 2026-08-21 | All 8 services (Invoice/Bill/CreditNote/Quote/SalesOrder/PurchaseOrder/Customer/Supplier) now guard `delete*` — see `docs/KNOWN_ISSUES.md`'s Resolved section for the exact rule per service |

### Account-mapping is hard-coded per service, not a configurable mapping table (§113)

Every posting service (`invoiceService`, `billService`, `creditNoteService`,
`customerReceiptService`, `bankTransactionService`) has its own fixed
`const AR_ACCOUNT_ID = 'acc_1100'`-style constants. This satisfies §8's specific
double-entry examples correctly, but §113 asks for account mappings to live in
configuration rather than scattered through source code. Not urgent while there's a
single Chart of Accounts and no multi-entity/multi-mapping requirement, but worth a
real config table (e.g. "which GL account does a Sales Revenue posting from a ZAR
standard-rated invoice resolve to") before Phase 6+ (Inventory COGS, Fixed Assets,
Payroll) each add their own hard-coded constants the same way.

## Phase 4 (Banking) — built, Wave 2

Already assessed as complete in `docs/HIVE_TASKS.md`'s Banking Bee section: real GL
posting, split allocation with per-line VAT, statement import, hard zero-variance
reconciliation. One relevant gap already flagged there: all seeded bank accounts share
one GL control account (`acc_1000`) — no real per-account GL mapping yet.

## Phases 5-12 — not started, per §116's own build order

Nothing below has been built yet. Noted here only so a future session can see at a
glance what's genuinely absent versus partially built, without re-deriving it from
scratch:

- **Phase 5 (VAT)** — no dedicated VAT engine exists. `src/types/taxRate.ts` is still
  the flat `{ rate: number, appliesTo, isActive }` shape flagged before this spec
  existed: no effective-dating, no distinction between standard/zero-rated/exempt/
  capital-goods/imported/reverse-charge treatments (§9, §12), no VAT period/return/
  reconciliation model (§40-§41 as applied to VAT, §60). Invoices/Bills carry a single
  `taxTotal` number, not itemized tax-code-level detail. This is the single largest
  gap versus the spec's own priorities (§9-§16), and is explicitly Phase 5 in §116 —
  i.e. next per the spec's own ordering, now that Phases 1-4 are real.
- **Phase 6 (Inventory)** — Products/Warehouses/stock-movement ledger exist (Phase 1),
  but no automatic Cost-of-Sales journal fires when a sale is recorded (§24), and no
  valuation-method (FIFO/weighted-average) selection exists at the accounting-policy
  level (§23).
- **Phase 7 (Fixed Assets)** — not started. No asset register, no accounting-vs-tax
  depreciation split (§26, §27).
- **Phase 8 (Payroll)** — not started. No employee master data, PAYE/UIF/SDL control
  accounts (§58), EMP201/EMP501 support.
- **Phase 9 (Tax)** — not started. No income tax computation, no accounting-profit-to-
  taxable-income reconciliation (§51), no SBC eligibility engine (§53), no provisional
  tax (§54), no CGT (§55), no dividends tax (§56), no deferred tax (§50).
- **Phase 10 (Financial Reporting)** — Trial Balance exists (Phase 1); no Income
  Statement/Statement of Financial Position/Cash Flow/Statement of Changes in Equity
  derived from the GL yet (§42), no notes framework (§43).
- **Phase 11 (Compliance)** — Public Interest Score and automatic reporting-framework
  determination remain deliberately unbuilt (§3; see Phase 1 section above — still the
  right call, still requires verified Companies Regulations methodology, not guessed).
  No Compliance Dashboard (§108).
- **Phase 12 (Advanced)** — not started: no deferred tax, lease accounting (§32,
  §47), financial instruments (§46), consolidation (§87), related parties (§88).

Also cross-cutting and still absent regardless of phase: role-based approval workflows
(§38-§39; only a stub `Role`/`User` type exists), suspense account (§40), a central
Reconciliation Centre (§71 — Banking's own reconciliation and the new AR/AP subledger
reconciliation, both 2026-08-21, are two independent checks, not the single tied-together
view §71 describes — Inventory/Payroll/Tax reconciliation don't exist to tie in yet
anyway), document/attachment management (§62), multi-company tenant scoping (§75 —
noted in Phase 1 section above).

## What this document is not

This is not a verification that VAT 15%, corporate tax 27%, the R2.3m VAT threshold, or
the SBC brackets quoted in the master spec are currently correct SARS/legislative
figures — those numbers were supplied by the user, not independently verified against
SARS/the Income Tax Act/the VAT Act by this session. Per the spec's own §110 ("no
unsupported claims") and §111 ("professional review"), any tax/VAT configuration seeded
into this system from those figures must be flagged as user-supplied and pending
professional/accounting verification, not presented as confirmed.
