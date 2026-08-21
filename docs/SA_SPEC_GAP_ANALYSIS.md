# SA Accounting Master Spec — Gap Analysis

What exists in this codebase today versus `docs/SA_ACCOUNTING_MASTER_SPEC.md`'s Phase 1
("Accounting Core"), the mandatory first phase per the spec's §116. Later phases
(Customers, Suppliers, Banking, VAT, Inventory, Fixed Assets, Payroll, Tax, Reporting,
Compliance, Advanced Accounting) are not assessed here in detail — Phase 1 has to be
real before any of them can be, per §115 ("do not blindly add new modules without
understanding the existing accounting architecture") and §116's explicit ordering.

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

## Phase 2/3 (Customers/Sales, Suppliers/Purchases) — already partially built, pre-dates this spec

Invoices, Bills, Purchase Orders, Customers, Suppliers all exist (Phase 2 Wave 1, built
before this spec was supplied). None of them post to the General Ledger yet — GL
posting was left as a TODO (`billService.postBill()`) pending the engine this document
describes. That's consistent with the master spec's ordering (Phase 1 core before
Phase 2/3 can be considered "real" accounting rather than document tracking), but it
means the existing Invoice/Bill modules are not yet compliant with §100
("reconciliation-first design": invoices must reconcile to Debtors must reconcile to
GL) — wiring that up is real, not-yet-started work.

## What this document is not

This is not a verification that VAT 15%, corporate tax 27%, the R2.3m VAT threshold, or
the SBC brackets quoted in the master spec are currently correct SARS/legislative
figures — those numbers were supplied by the user, not independently verified against
SARS/the Income Tax Act/the VAT Act by this session. Per the spec's own §110 ("no
unsupported claims") and §111 ("professional review"), any tax/VAT configuration seeded
into this system from those figures must be flagged as user-supplied and pending
professional/accounting verification, not presented as confirmed.
