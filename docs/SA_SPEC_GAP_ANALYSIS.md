# SA Accounting Master Spec — Gap Analysis

What exists in this codebase today versus `docs/SA_ACCOUNTING_MASTER_SPEC.md` (117
sections, 12 build phases per §116). **Updated 2026-08-21** — Phase 5 (VAT) is
complete: `TaxRate` redesigned as an effective-dated engine, VAT calculation wired into
every Sales/Purchases/Banking/Inventory consumer, a Tax Rates settings page, VAT
Reporting with real GL reconciliation, and non-deductible input VAT correctly excluded.
Phase 6 (Inventory) is now ✅ complete (2026-08-22): Cost of Sales posts on Invoice,
tracked inventory capitalizes on Bill instead of expensing, credit notes reverse Cost
of Sales/restore stock for returns, per-document warehouse attribution, real 3-way
PO/GRN/Invoice matching, and a FIFO valuation-method option alongside WAC — see that
section below. **Updated 2026-08-22** — getting there also meant fixing a gap that had
made all of the above practically unreachable: no Sales/Purchases line-item editor let
a user pick a product, and Invoices/Bills had no working post action in the UI (see
the Phase 2/3 section below and `docs/KNOWN_ISSUES.md`). **Updated 2026-08-22 (later
same day)** — Phase 7 (Fixed Assets) is now ✅ complete: an Asset Register with a
draft-then-capitalize flow, a straight-line/reducing-balance depreciation engine
posting real combined GL entries, disposals computing genuine gain/loss, and a Tax
Register comparing accounting vs. SARS wear-and-tear book values — see that section
below. Phases 1-7 (Accounting Core, Customers, Suppliers, Banking, VAT, Inventory,
Fixed Assets) now have real implementations to assess; Phases 8-12 (Payroll, Tax,
Financial Reporting, Compliance, Advanced Accounting) are still not started, consistent
with §116's ordering — not reassessed in detail below beyond noting what's genuinely
absent.

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
| Invoices post to GL (§8, §100) | ✅, and reachable from the UI as of 2026-08-22 | `invoiceService.postInvoice()` (called by `markInvoiceAsSent()`): DR AR, CR Sales Revenue, CR VAT Output. Until 2026-08-22, `InvoicesPage` never wired `onMarkAsSent` to `InvoiceDetail`, so this never rendered — see `docs/KNOWN_ISSUES.md` |
| Bills post to GL (§8, §100) | ✅, and reachable from the UI as of 2026-08-22 | `billService.postBill()`: DR Expense, DR VAT Input, CR AP. Until 2026-08-22, a standalone Bill had no create form or post action at all (`BillsPage`'s "+ New Bill" button had no handler) — only PO→Bill conversion could post one — see `docs/KNOWN_ISSUES.md` |
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

### No document line item created through the UI could carry a productId (fixed 2026-08-22)
Every Sales/Purchases line-item editor (`LineItemsEditor` on both sides, plus
`InvoiceForm`'s separate older implementation) had no product picker — `productId`
could only ever be set via seed data or a direct service call, which meant Phase 6's
Cost of Sales/Inventory-capitalization/credit-note-reversal logic (§22-§24) could never
actually fire from real user input. This is a Phase 2/3 gap in the strict sense
(it lives in the Sales/Purchases document forms, not Inventory), but it's what made
Phase 6 unreachable, so it's fixed and logged together with the invoice/bill posting
fix above — full detail in `docs/KNOWN_ISSUES.md`.

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

## Phase 5 (VAT) — ✅ complete, 2026-08-21

`src/types/taxRate.ts`'s flat `{ rate: number, appliesTo, isActive }` shape (flagged
before this spec existed) is now a real effective-dated engine: `treatment`
(standard_rated/zero_rated/exempt/out_of_scope/capital_goods/import_vat/
reverse_charge/non_deductible — §9, §12), `effectiveFrom`/`effectiveTo`,
`jurisdiction`, `sourceReference`. `TaxRateService` (`src/features/tax/services/`)
resolves the historically-correct version for a past transaction (§83) and versions a
rate forward via `supersede()` rather than editing history. A settings page
(`/tax/rates`) lets a user actually create/version/deactivate codes — not just the
service API. `computeVatReport()`/`VatReturnPage` (`/tax/vat-return`) classify every
real posted Invoice/Credit Note/Bill line by treatment into Output/Input VAT (§64),
reconciled against the real GL VAT control accounts for the period
(`reconcileVatControlAccounts`, §17/§70/§71 applied to VAT) — proven by an integration
test against real seed data, not just unit-tested in isolation. Non-deductible input
VAT is correctly excluded from what a Bill claims (`billService.postBill()`'s
`splitDeductibleVat()`), never posted to VAT Input.

Deliberately still open, consistent with §116's own scope for Phase 5 specifically (not
a Phase 5 gap — these are OTHER phases/concerns): §53's SBC/income-tax brackets are
Phase 9, not VAT; there is no VAT Period open/closed lifecycle (§10) separate from the
existing Accounting Periods — a real, if non-blocking, Phase 5 gap; the tax invoice
required-fields work (company name/VAT number on rendered documents, §13) shipped
earlier in the known-issues pass, not this one. See `docs/KNOWN_ISSUES.md` for the
AR/AP-side residual reconciliation gap (payment/receipt entries aren't backfilled,
only original postings) — that one is Phase 2/3's concern, not Phase 5's.

## Phase 6 (Inventory) — ✅ complete, 2026-08-22

Products/Warehouses/stock-movement ledger existed since Phase 1 (with WAC valuation),
but nothing ever posted Inventory to the GL or moved stock automatically from a sale or
purchase — `StockMovementType` had carried `'sale'`/`'goods_received'` variants since
Phase 1 with no code ever using them. Fixed across several passes, all 2026-08-21/22:

- **Cost of Sales on sale (§24)** — `invoiceService.postInvoice()` now adds a Cost of
  Sales / Inventory line pair to the SAME journal entry as the sale, for every line
  item with a tracked product, then reduces stock after the entry posts successfully
  (`InventoryPostingAdapter.calculateCogs()`/`recordSaleMovement()`).
- **Inventory capitalization on purchase (§22)** — `billService.postBill()` now
  classifies each line as Inventory (tracked product) or Expense (everything else)
  instead of always expensing the full subtotal, and records a stock receipt at the
  real purchase unit cost after posting, recalculating the product's weighted-average
  cost (`recordReceiptMovement()`).
- Both directions are constructor-injected via `InventoryPostingAdapter`
  (`src/features/inventory/services/inventoryPostingAdapter.ts`), independently
  testable with isolated mock repositories (10 tests) rather than only via the real
  singleton.
- **Credit-note Cost of Sales reversal + stock restore (§15/§24, fixed 2026-08-21,
  later pass)** — `creditNoteService.issueCreditNote()` now takes an
  `InventoryReturnMover` dependency (the same `inventoryPoster` singleton
  Invoice/BillService already use) and posts DR Inventory / CR Cost of Sales for
  tracked-inventory line items, gated on `reason === 'return'` (a pricing_error/
  discount/other credit note is a value adjustment, not goods coming back).
  `InventoryPostingAdapter.recordReturnMovement()` restores stock without
  recalculating weighted-average cost — a return isn't a new purchase at a new price.
- **Per-document warehouse attribution (§22, fixed 2026-08-22)** —
  `DocumentLineItem.warehouseId?: ID` added; `InventoryPostingAdapter` resolves an
  explicit id (falling back to the default warehouse if it's missing/invalid) instead
  of always using the default. Both `LineItemsEditor`s show a Warehouse picker, but
  only when more than one warehouse exists — a single-warehouse business sees no
  change. See `docs/KNOWN_ISSUES.md`.
- **Real 3-way (PO/GRN/Invoice) matching (§22, fixed 2026-08-22)** —
  `purchaseOrderService.recordReceipt()` now posts DR Inventory / CR GRNI (a new
  liability/clearing account, `acc_2050`) for tracked-inventory lines and records the
  real stock receipt, instead of being status-only. `billService.postBill()` clears
  GRNI instead of debiting Inventory again (and skips re-recording the stock movement)
  when its linked PO was already GRNI-received. See `docs/KNOWN_ISSUES.md`.
- **FIFO valuation method (§23, fixed 2026-08-22)** — `Product.valuationMethod`
  (`'weighted_average'` default / `'fifo'`), a new `StockLot`/`StockLotService`
  costing oldest-received-first, and `InventoryPostingAdapter` branching all four
  operations on it. Only possible once PO/GRN receipt (above) existed to source real
  per-lot landed costs — see `docs/KNOWN_ISSUES.md` for the full design and its
  documented boundaries (no historical-lot backfill when switching an existing
  product; throws rather than guessing when open lots can't cover a sale).

Every §116 Phase 6 checklist item (Products, Warehouses, Stock, Movements, Valuation,
Cost of Sales) is now real, not just the terse spec list — including the two
refinements (warehouse attribution, real 3-way matching) that go beyond it. Genuinely
open, deliberately out of scope: a FIFO valuation-report UI (the engine is real and
tested; nothing surfaces open lots in the Inventory pages yet), true partial PO
receipt (only all-or-nothing per PO is modeled), and PO-to-Bill price-variance
handling (relies on the Bill's line items matching the PO's exactly, true today via
`convertToBill()`'s verbatim copy — see `docs/KNOWN_ISSUES.md`).

## Phase 7 (Fixed Assets) — ✅ complete, 2026-08-22

No asset register, depreciation, disposal, or tax-register support existed at all —
`StockMovementType`-style groundwork didn't apply here, this was a genuinely new
module. Built in one pass, `src/features/assets/`:

- **Asset register (§116)** — `FixedAsset` (`src/types/fixedAsset.ts`) with cost,
  residual value, useful life, category, and a choice of `straight_line`/
  `reducing_balance` depreciation. New draft-then-capitalize lifecycle, matching every
  other posting document in this codebase (Bill/Invoice/PurchaseOrder): `createFixedAsset()`
  only ever writes a `'draft'` register row with no GL history behind it;
  `postAcquisition()` is the explicit action that posts DR Fixed Asset (`acc_1500`) / CR
  a user-chosen funding-source account (typically Accounts Payable or Cash and Bank) and
  flips the asset to `'active'`. Cost/useful-life/method/dates/GL-mapping lock once an
  asset leaves draft — the same posted-record-immutability guard already applied to
  Invoice/Bill/CreditNote delete (`docs/KNOWN_ISSUES.md`), applied here to *edit*
  instead, since a register row (unlike those documents) is legitimately still editable
  in other respects (name, category, tax rate) after capitalization.
- **Depreciation (§116)** — `depreciationService.runDepreciation(periodEnd)` posts ONE
  combined journal entry per run (a DR Depreciation Expense (`acc_5200`) / CR
  Accumulated Depreciation (`acc_1590`, a contra-asset) line pair per eligible active
  asset — still a single balanced entry). Idempotent per exact `periodEnd` (a second run
  for the same date finds nothing left to do, mirroring
  `purchaseOrderService.recordReceipt()`'s already-received guard), and the per-period
  charge is capped so accumulated depreciation can never exceed `cost - residualValue`
  regardless of method — an asset that reaches that cap flips to `'fully_depreciated'`
  automatically. `calculateMonthlyDepreciation()` is a pure, independently-tested
  function shared by the real run (no separate "preview" implementation to drift out of
  sync, same principle as `stockLotService`'s shared lot-walking algorithm).
- **Disposals (§116)** — `assetDisposalService.disposeAsset()` posts CR Fixed Asset (at
  original cost) / DR Accumulated Depreciation (clearing whatever built up) / DR the
  proceeds account, with the balancing gain (CR `acc_4200`, new) or loss (DR `acc_5300`,
  new) computed from `proceeds - carryingValue` — proven balanced by test for a gain, a
  loss, an exact break-even (no gain/loss line posted at all), and a zero-proceeds
  scrapped-asset case. An asset can only be disposed once (`'disposed'` is terminal);
  disposing a still-draft asset is rejected (nothing capitalized to remove).
- **Tax Register (§116)** — `taxRegisterService.getTaxRegister(asOfDate)` compares each
  capitalized asset's accounting carrying value against a SARS wear-and-tear-based tax
  written-down value, surfacing the temporary difference — read-only, no GL posting, no
  deferred-tax journal entry (that computation is explicitly Phase 12, not built here).
  Every wear-and-tear rate (`src/features/assets/constants.ts`'s
  `WEAR_TEAR_RATE_DEFAULTS`, prefilled per category, always user-editable) carries the
  same "typical/indicative, pending professional verification against SARS Binding
  General Practice Note 7" caveat as `TaxRate.sourceReference` (§110/§111) — not
  presented as a confirmed statutory rate for any specific asset.
- Seed data (`src/mock-data/fixedAssets.ts`) is deliberately all `'draft'` — no
  fabricated `'active'` asset with depreciation history and no real matching
  `JournalEntry` behind it, the exact "status claims posted but nothing was really
  posted" gap Phase 5's VAT reconciliation work found and fixed for seeded Invoices/
  Bills. Use the Asset Register's Post Acquisition action to build genuine ledger
  history.
- New GL accounts: `acc_1500` Fixed Assets, `acc_1590` Accumulated Depreciation
  (contra-asset), `acc_4200` Gain on Disposal, `acc_5200` Depreciation Expense,
  `acc_5300` Loss on Disposal — added to the seed Chart of Accounts.
- 31 new tests (service-layer: creation guards, capitalization, edit-lock,
  delete-lock, straight-line/reducing-balance math, multi-asset combined-entry
  balancing, idempotent re-run, fully-depreciated cap, gain/loss/break-even/
  zero-proceeds disposal, tax-register computation; plus a page-level smoke test on
  the Asset Register's load/error/empty/create/post-acquisition flows).

**Bill-line capitalization — fixed 2026-08-22, later same day.** A supplier Bill line
can now be flagged "capitalize this as a fixed asset" (a new `fixedAssetDetails` on
`DocumentLineItem`, mutually exclusive with `productId`) instead of requiring a
disconnected manual Asset Register entry after the fact. `billService.postBill()`
debits Fixed Assets (`acc_1500`) for that line in the SAME journal entry as the rest of
the bill, and `FixedAssetService.capitalizeFromBillLine()` writes the register row
directly as `'active'` — the Bill's posting IS the capitalization event, same principle
as tracked-inventory lines capitalizing to Inventory in that same entry. Only rendered
on the Bill form (`LineItemsEditor`'s new `allowFixedAssetCapitalization` prop) — a
Purchase Order can't capitalize anything, nothing has been invoiced yet. 15 new tests
across `billService`/`fixedAssetService`/`LineItemsEditor`.

**Deliberately still open, not a Phase 7 gap in the strict §116 sense but worth
tracking**: account-mapping is fixed constants again, same known limitation as every
other posting service (§113, see the Phase 2/3 section above); no deferred-tax journal
entry from the Tax Register's temporary difference (genuinely Phase 12); no
partial-year proration UI beyond what the monthly-charge math already does implicitly.

462/462 tests passing (up from 408), type-check/lint/build clean.

## Phases 8-12 — not started, per §116's own build order

Nothing below has been built yet. Noted here only so a future session can see at a
glance what's genuinely absent versus partially built, without re-deriving it from
scratch:

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
