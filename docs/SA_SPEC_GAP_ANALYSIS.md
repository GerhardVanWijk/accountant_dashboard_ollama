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
below. **Updated 2026-08-22 (later same day)** — Phase 8 (Payroll) is now ✅ complete:
Employee master data, a draft-then-post payroll run engine, real PAYE/UIF/SDL
calculation against six new dedicated liability accounts, and EMP201/EMP501 statutory
reporting with GL reconciliation — see that section below, including its own stronger-
than-usual verification caveat on the seeded tax figures. **Updated 2026-08-22 (later
same day)** — Phase 9 (Tax) Wave 1 is now ✅ complete: Income Tax (corporate/SBC
computation and the accounting-profit-to-taxable-income reconciliation), Capital Gains
Tax (a read-only reconciliation layer, correctly separate from accounting gain/loss), and
Dividends Tax (declare/pay/remit lifecycle with real withholding) — see that section
below. Deferred Tax (§50) is explicitly Phase 12, not Phase 9. **Updated 2026-08-22 (later
same day)** — Phase 9 Wave 2 (Provisional Tax, §54) is now ✅ complete, and Phase 10
(Financial Reporting) core is now ✅ complete: Income Statement, Balance Sheet (proves
Assets = Liabilities + Equity), Cash Flow Statement (indirect method, reconciled to real
cash movement), plus Customer/Supplier Aging reports — see those sections below. Phases
1-10 core now have real implementations to assess; Phase 10's Notes/Statement of Changes
in Equity/comparatives are still not started. **Updated 2026-08-22 — Phase 11
(Compliance) core is now ✅ complete**: the Public Interest Score engine (§3 — the last
piece deliberately deferred from Phase 1, now built after live-verifying the Companies
Regulations 2011 methodology) and the Compliance Dashboard (§108) — see those sections
below. **Updated 2026-08-22 (new session) — Phase 12 (Advanced Accounting) Wave 1
(Deferred Tax, §50) is now ✅ complete**: a real temporary-difference-based deferred tax
engine reusing the Fixed Asset Tax Register, posting only the period movement — see that
section below. **Updated 2026-08-22 (same session) — Phase 12 Wave 2 (Expected Credit
Losses, §46/IFRS 9) is now ✅ complete**: a real provision-matrix engine on trade
receivables reusing the Customer Aging Report, same movement-only posting shape as
Deferred Tax — see that section below. **Updated 2026-08-23 — Phase 12 Wave 3 (the
remainder of the phase, dispatched as three parallel bees — Leases, Related Parties,
Foreign Exchange — plus two solo Queen passes for Reporting Standards versioning and the
Consolidation architecture audit) is now ✅ complete, closing out Phase 12 entirely.**
Every §116 phase (1 through 12) now has a real implementation or, where the spec itself
only asks for architecture (Consolidation), a real documented audit — see the Phase 12
section below for full per-piece detail.

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
| Public Interest Score engine (§3) | ✅ complete, 2026-08-22 (Phase 11) | `src/features/compliance/` — see the Phase 11 section below. `Company.publicInterestScore` (this row used to describe it as the only option) is now superseded by real per-financial-year `PublicInterestScore` history. |
| Reporting framework determination (Full IFRS / IFRS for SMEs / other) (§2) | ✅ suggested automatically, 2026-08-22 (Phase 11) | `publicInterestScoreService.calculateScore()` SUGGESTS a framework from the real score (see Phase 11 below) — it never applies it. `Company.reportingFramework` still only ever changes via `CompanyService.setReportingFramework()`, which requires a recorded reason (§2's "authorized override" mechanism), now with a real UI entry point on the Public Interest Score page. |

**Phase 1 core is now done**: Company, Financial Year, Accounting Periods (with real
open/closed/locked enforcement at the posting boundary), Chart of Accounts, General
Ledger, Journals, Trial Balance, and an append-only Audit Trail wired into every
posting/reversal/period-transition/reporting-framework-change. 203 tests passing,
build/lint/type-check clean as of 2026-08-21.

**Deliberately still open, and why that's the right call, not an oversight:**
- ~~Public Interest Score + automatic reporting-framework determination~~ — built
  2026-08-22, Phase 11 (see that section below). `reportingFramework` still only ever
  changes via the same manually-triggered, reason-required override — the score engine
  suggests, never applies.
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
| Customer receipts, multi-invoice allocation (§17) | ✅, and reachable from Invoice/Bill detail as of 2026-08-22 | `customerReceiptService`. Until 2026-08-22, `InvoiceDetail`/`BillDetail`'s "Record Payment" buttons existed but were never wired to a real page — both now open the real `CustomerReceiptForm`/`PaymentForm` pre-aimed at that document — see `docs/KNOWN_ISSUES.md` |
| Vendor payments, multi-bill allocation (§18) | ✅, and reachable from Invoice/Bill detail as of 2026-08-22 | `paymentService` (Purchases) — see the row above |
| Quote → Sales Order → Invoice conversion chain (§63, §99 traceability) | ✅ (partial) | `quoteService.convertToSalesOrder()`, `salesOrderService.convertToInvoice()` — the resulting invoice is a draft, posted separately when the user marks it Sent (deliberate: matches "sending" an invoice being a distinct action, not silently posting on conversion) |
| PO → Bill conversion (§63) | ✅, and no longer double-clickable | `PurchaseOrdersPage`'s convert action composes `createBill()`+`postBill()`; `PurchaseOrder.billId` (added 2026-08-21) blocks converting the same PO twice, enforced in `purchaseOrderService.convertToBill()` itself, not just the UI |
| Debtors/Creditors ageing (§17, §18, §64) | ✅ fixed 2026-08-21 | `invoicesToOpenItems()`/`billsToOpenBills()` adapters feed real, non-draft/non-void Invoice/Bill data (aged on outstanding balance) into the existing aging math — Customer/Supplier Detail pages and the Dashboard's fleet-wide aggregation all consume real data now |
| Customer/Supplier subledger reconciles to AR/AP control account (§17, §18, §70) | ✅ fixed 2026-08-21, gap closed 2026-08-22 | `src/features/accounting/services/subledgerReconciliation.ts`'s `reconcileAccountsReceivable()`/`reconcileAccountsPayable()`, compared against `journalEntryService.getAccountLedger()`'s real posted balance; surfaced on the Trial Balance page. `generateSeedPostings.ts` now backfills matching receipt/payment GL entries for every fully-allocated seed `CustomerReceipt`/`Payment`, not just the original invoice/bill posting — proven clean against the real seed ledger by an integration test, not just unit-tested in isolation (`docs/KNOWN_ISSUES.md`) |
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
earlier in the known-issues pass, not this one. The Phase 2/3-side AR/AP residual
reconciliation gap this paragraph used to flag (payment/receipt entries not backfilled)
is fixed — see the Phase 2/3 table row above and `docs/KNOWN_ISSUES.md`'s Resolved
section for the full 2026-08-22 fix, including two real seed-data bugs it surfaced
along the way.

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

## Phase 8 (Payroll) — ✅ complete, 2026-08-22

No employee master data, PAYE/UIF/SDL control accounts, or EMP201/EMP501 support
existed at all — genuinely new module, `src/features/employees/`:

- **Employees (§57)** — `Employee` type (basic salary/wage per `payFrequency`, standard
  allowances/deductions each flagged taxable/pre-tax, UIF-exempt flag, date of birth for
  the age-based PAYE rebate) + `employeeService`, plain CRUD like `productService.ts`.
  Delete guard mirrors the 8-service posted-record guard already in this codebase: an
  employee referenced by any payroll run's payslip lines can't be deleted, only set to
  `'terminated'`.
- **PAYE/UIF/SDL (§58)** — `PayrollTaxYearConfig` (`src/types/payroll.ts`), effective-
  dated by SARS tax year exactly like `TaxRate`, but with a lighter-weight
  create-only-per-year API (`payrollTaxConfigService.getConfigForDate()`) rather than
  `TaxRateService`'s full `supersede()`-with-audit-trail engine — a once-a-year
  government-published table doesn't need mid-year versioning the way a company's own
  VAT code choice does. Real annual-equivalent PAYE bracket math
  (`payrollCalculations.ts`: annualize by pay frequency, tax via SARS's cumulative
  base+rate% bracket format, subtract the primary/secondary(65+)/tertiary(75+) rebate,
  de-annualize), UIF employee+employer (rate applied below a pay-frequency-prorated
  monthly ceiling), SDL (company-wide `Company.sdlExempt` flag). **Six new dedicated
  liability accounts** (PAYE Payable, UIF Payable - Employee, UIF Payable - Employer,
  SDL Payable, Other Payroll Deductions Payable, Net Pay Payable) — §58's "do not
  combine all payroll liabilities into one account" is enforced by the chart of
  accounts itself, not just a convention nobody checks. Three new expense accounts
  (Salaries and Wages, Employer UIF Contribution, Employer SDL Contribution).
- **Payroll engine (§57)** — `PayrollRunService`: a draft-then-post lifecycle matching
  Bill/Invoice/FixedAsset. `createPayrollRun()` computes one `PayslipLine` per active
  employee via the single shared `computePayslipLine()` (used identically by run
  creation, per-line overtime/bonus edits, and — by construction — never re-implemented
  a second way); `netPay` is defined as the exact remainder of
  `grossPay - paye - uifEmployee - deductionsTotal`, so a run's combined journal entry
  balances by construction rather than needing a rounding-tolerance fudge.
  `postPayrollRun()` posts ONE combined balanced entry for the whole run, mirroring
  `depreciationService.runDepreciation()`'s one-entry-per-run design. An overlapping pay
  period is rejected (idempotency guard, same class as
  `purchaseOrderService.recordReceipt()`'s already-received guard).
- **Tax periods (§59)** — `getSarsTaxYear()` (`src/features/employees/utils/sarsTaxYear.ts`)
  computes the real 1 March-end February SARS tax year independent of
  `financialYearService`/`accountingPeriodService` — proof this codebase now actually
  understands the accounting year and the SARS tax year are not the same calendar, not
  just a comment saying so.
- **EMP201/EMP501 (§60)** — `emp201Service.computeEmp201Report()` sums PAYE/UIF/SDL from
  real POSTED payroll runs only (deliberately not labelled with official SARS EMP201 box
  numbers, same §110/§111 caution `vatReportService.ts` documents for VAT201), plus
  `reconcilePayrollLiabilities()` checking each of the four control accounts separately
  against its own GL movement for the period — proven clean by an integration test
  against a real posted run, not just unit-tested in isolation.
  `emp501Service.computeEmp501Report()` rolls up a full SARS tax year's EMP201-
  equivalent monthly totals by reusing `computeEmp201Report()` per month, so the two
  reports can never disagree on how a month's figures were derived. Neither service
  submits anything to SARS — both compute the figures an employer must prepare, same
  scope boundary as the existing VAT Return page.
- Five pages, a new "Payroll" nav section (`/payroll/employees`, `/payroll/runs`,
  `/payroll/emp201`, `/payroll/emp501`). Seed data (`src/mock-data/employees.ts`) has no
  seeded `PayrollRun` at all — same "no fabricated posted status without a real matching
  `JournalEntry`" discipline `seedFixedAssets.ts` already follows. 60 new tests (522/522
  total), type-check/lint/build clean.

**Tax figures verified 2026-08-22, same day as Phase 8 shipped** (§110/§111): the PAYE
bracket/rebate/UIF-ceiling/SDL rate-and-threshold figures in
`src/mock-data/payrollTaxConfig.ts` were originally a Claude-reconstructed placeholder
(flagged as such), then replaced the same day by fetching sars.gov.za's own pages
directly — the individual tax rate table, UIF rate/ceiling, and SDL rate/threshold —
each cited by URL in the seed record's `sourceReference`. The bracket table was
cross-checked two independent ways and agreed exactly. Real figures for the 2026/2027
tax year (1 March 2026 – 28 February 2027): brackets 18%/26%/31%/36%/39%/41%/45% at
R245,100/R383,100/R530,200/R695,800/R887,000/R1,878,600 (inflation-adjusted, the first
such adjustment since 2023/24); rebates primary R17,820, secondary R9,765, tertiary
R3,249; UIF 1%+1% capped at R17,712/month (unchanged since 2021); SDL 1%, exempt below
R500,000 annual payroll. Full history in `docs/KNOWN_ISSUES.md`'s Resolved section.
Still true, and always will be: this is a live-web verification as of one date, not a
substitute for professional/accounting sign-off, and it does not extend to any future
tax year's config, which must repeat the same verification when added.

**Deliberately still open, simplifications documented rather than silently made:**
- `EmployeeAllowance.taxable`/`EmployeeDeduction.preTax` are booleans — real SA
  allowances (a travel allowance especially) are often only PARTIALLY taxable under
  detailed fringe-benefit rules; that per-allowance-type legislation lookup is not
  modeled.
- No retirement-fund PAYE deduction cap (27.5% of remuneration, capped at R350,000/year)
  — a pre-tax deduction reduces `payeTaxableIncome` in full, unclamped.
- `Employee.uifExempt` is a single boolean, not the UIF Act's actual (narrower)
  exclusion list.
- `Company.sdlExempt` is a whole-company flag the user sets, not a real trailing-12-
  month leviable-payroll projection against `sdlAnnualPayrollExemptionThreshold`.
- No IRP5/IT3(a) tax-certificate generation, and no payslip PDF/print output — this app
  has no document-generation capability anywhere yet, not just here.
- No settings-page UI to add the next SARS tax year's `PayrollTaxYearConfig` without a
  code change (mirrors `/tax/rates` for VAT, which Phase 8 deliberately did not build an
  equivalent of yet, given a government table republishes once a year rather than
  needing frequent in-app edits).
- No separate "mark payroll as paid" settlement step when `Net Pay Payable` (rather than
  Cash and Bank directly) is chosen as the post-time contra account — unlike
  Invoice/Bill payments, nothing later clears that liability through this app.

## Phase 9 (Tax) — Wave 1 ✅ complete, 2026-08-22 (Income Tax, Capital Gains Tax, Dividends Tax)

Three bees dispatched in parallel on disjoint folders, independently QA-verified, plus a
Queen Bee integration pass wiring the two together. 631/631 tests passing, type-check/
lint/build clean.

- **Income Tax (§51/§52/§53)** — `src/features/tax/incomeTax/`. `IncomeTaxYearConfig`
  (flat 27% corporate rate + SBC bracket table, effective-dated, source-cited to
  sars.gov.za, verified live 2026-08-22) and `TaxComputationService`: a draft-then-post
  `TaxComputation` per company FinancialYear computing `accountingProfit` from real posted
  GL revenue/expense movement, a set of suggested (always user-editable) tax-adjustment
  lines — depreciation add-back, SARS wear-and-tear allowance for the period (reusing the
  Tax Register's per-asset temporary-difference math as an INPUT, not a deferred-tax
  posting), one line per Fixed Asset disposal reversing its accounting gain/loss, and the
  real taxable-capital-gain line (see Capital Gains Tax below) — down to `taxableIncome`,
  then `taxLiability` via the SBC brackets (if `Company.isSbcEligible`, a manual
  reason-required override mirroring `reportingFramework`'s pattern — real SBC-eligibility
  legislation depends on shareholder/ownership data this app doesn't model, so it is never
  auto-determined) or the flat rate otherwise. `postComputation()` posts ONE entry (DR
  Income Tax Expense `acc_5500` / CR Income Tax Payable `acc_2300`). Page at
  `/tax/income-tax`. 51 new tests.
- **Capital Gains Tax (§55)** — `src/features/tax/capitalGains/`, genuinely read-only, posts
  nothing to the GL. Per-disposal `proceeds - baseCost(original FixedAsset.cost, not
  accounting carrying value) - sellingCosts(user-entered)` — deliberately separate from the
  accounting gain/loss `AssetDisposalService` already posts, exactly per §55's own framing.
  Entity-type-based inclusion rate (natural-person-like 40%, company/trust 80%, sourced to
  sars.gov.za) and R50,000 annual exclusion (natural-person-like only) applied once against
  the aggregate net gain for a chosen period. Page at `/tax/capital-gains`. 28 new tests.
- **Dividends Tax (§56)** — `src/features/tax/dividendsTax/`. `DividendDeclaration`
  draft→declared→paid→remitted lifecycle, each transition its own balanced journal entry:
  declare (DR Retained Earnings `acc_3900` / CR Dividends Payable `acc_2500`, gross), pay
  (DR Dividends Payable / CR Cash and Bank `acc_1000` net / CR Dividends Tax Payable
  `acc_2510` withheld), remitToSars (DR Dividends Tax Payable / CR Cash and Bank). 20%
  withholding rate, sourced to sars.gov.za. Page at `/tax/dividends`. 29 new tests.
- **Integration**: `TaxComputationService` takes the real `capitalGainsService` as an
  optional `CapitalGainsLookup` dependency so Income Tax's capital-gain adjustment line is
  pre-filled from the real Capital Gains Tax module rather than a manual placeholder — see
  `docs/KNOWN_ISSUES.md`'s Resolved section.

**Deliberately still open** (§116's own ordering, not Wave 1 gaps): Deferred Tax (§50,
explicitly Phase 12, not Phase 9); no reversal/correction path for a posted `TaxComputation`.
Documented simplifications per module: no shareholder register anywhere in this codebase,
so Dividends Tax is gross/company-wide only (no per-shareholder allocation, no real s64F
exemption-eligibility test — a manual reason-required override amount instead); Capital
Gains Tax has no capital-improvement base-cost tracking, no special-trust 40% sub-rate, no
assessed-capital-loss carryforward; Income Tax has no assessed-loss-brought-forward
automation (a manual adjustment line) and SBC eligibility is a manual, reason-required
override, never auto-determined from real shareholding/personal-service-company tests.

## Phase 9 (Tax) — Wave 2 ✅ complete, 2026-08-22 (Provisional Tax, sequential)

`src/features/tax/provisionalTax/` — `ProvisionalTaxPeriod` (§54) holds all three payment
slots (first/second/top-up); due dates computed from the company's own FinancialYear, never
the unrelated 1 March–end-Feb individual/PAYE tax year (`getSarsTaxYear()`, a different
concept this module's doc comments explicitly distinguish, same reasoning Income Tax already
established). Estimates and the final reconciliation both reuse `calculateTaxLiability()`
from the Income Tax module rather than reimplementing SBC/flat-rate math a second way.
`payProvisionalTax()` posts DR Income Tax Payable (`acc_2300`) / CR Cash and Bank
(`acc_1000`) — deliberately no new GL account, since a provisional payment is just an early
debit against the exact liability the final `TaxComputation` will credit at year-end, so the
paid-vs-actual reconciliation falls out of the GL identity for free. No underpayment-interest
calculation (§110/§111 — SARS's rate floats with the repo rate, not a fixed statutory
figure); only the plain Rand-value gap is surfaced. 23 new tests.

## Phase 10 (Financial Reporting) — core ✅ complete, 2026-08-22 (Income Statement, Balance
Sheet, Cash Flow Statement)

Trial Balance existed since Phase 1. Built this session, three bees in parallel:
- **Income Statement** (§42) — `src/features/reports/financialStatements/`. A real
  classified P&L: Revenue → Cost of Goods Sold (`acc_5000`) → Gross Profit → Operating
  Expenses → Profit Before Tax → Income Tax Expense (`acc_5500`, the new Phase 9 account) →
  Net Profit After Tax — not a flat revenue-minus-expenses number.
- **Balance Sheet** (§42) — same folder. Assets (net of contra-asset accounts like
  Accumulated Depreciation) vs. Liabilities + Equity (Owner's Equity + Retained Earnings +
  a "Current Year Earnings" line reusing the Income Statement's own calculation) — the
  module computes and displays whether `Assets = Liabilities + Equity` rather than assuming
  it, proven against real posted GL data by a dedicated test. One honestly-flagged
  constraint: the identity only holds cleanly because this app has no year-end closing
  journal yet (a pre-existing data-model gap, not something this report introduced or could
  fix within its own scope) — verified this doesn't currently cause a problem against the
  real seed data, which spans only one still-open FinancialYear.
- **Cash Flow Statement** (§42, indirect method) — `src/features/reports/cashFlow/`.
  Operating (net profit + depreciation/disposal-gain-loss addbacks + AR/Inventory/AP
  working-capital deltas), Investing (Fixed Asset acquisitions net of real disposal
  proceeds from `AssetDisposal.proceeds`, not the accounting gain/loss), Financing (Owner's
  Equity movement, dividends paid net of Dividends Tax withholding — found and correctly
  fixed a real discrepancy from its own dispatch brief here, by reading
  `dividendDeclarationService.pay()`'s actual three-line posting rather than assuming a
  flat net figure). Reconciles to the real net Cash and Bank movement for the period, proven
  non-circular by a dedicated test that breaks the reconciliation on purpose (a cash
  movement through an untracked account) and confirms the check actually catches it.
  Working-capital tracking is scoped to AR/Inventory/AP only — any other cash-touching
  account (VAT, PAYE/UIF/SDL, Provisional Tax, a future loan) would correctly surface as a
  reconciliation variance rather than silently reconciling anyway.
- **Aging Reports** (a Reports-module addition, not itself a §42 line item but built
  alongside) — `src/features/reports/aging/`. Customer/Supplier Aging, one row per entity.
  Found and fixed a real latent bug in `calculateAgingForCustomer` while building this — see
  `docs/KNOWN_ISSUES.md`'s Resolved section.

706/706 tests passing (up from 631), type-check/lint/build clean, independently QA-verified
(zero defects — QA specifically traced the Balance Sheet identity and Cash Flow's
reconciliation non-circularity rather than trusting the tests alone).

**Deliberately still open, per §42/§43 and this pass's own scope**: Notes to Financial
Statements (§43); Statement of Changes in Equity; comparative/YoY columns (no budget entity
exists anywhere in this app, so budget-vs-actual specifically is out of scope, not just
deferred); export/PDF/print; a direct-method Cash Flow presentation (indirect only).

## Phase 11 (Compliance) — core ✅ complete, 2026-08-22

The last piece of §3 deliberately deferred since Phase 1 ("requires verifying the exact
Companies Regulations methodology against source legislation, not guessed" —
docs/SA_SPEC_GAP_ANALYSIS.md's own prior wording). That verification is now done:
cross-checked the Companies Regulations, 2011 (GN R351) regulations 26-29 against CIPC's
own summary page and several independent secondary sources (RSM South Africa, RandCo,
The Glass Castle) — WebFetch could not reliably extract the primary Government Gazette
PDF text directly (scanned/compressed), so this is a multi-source cross-check, not a
single verified primary-source quote; see `complianceDeterminations.ts`'s doc comment
for exactly what's high-confidence versus flagged `requires_professional_review`.

- **Public Interest Score engine (§3)** — `src/features/compliance/`.
  `publicInterestScoreService.calculateScore()` computes a real reg 26(2) score for a
  company FinancialYear: employee points from real `Employee` employment-date data
  (`calculateAverageEmployeeCount()`, monthly-sampled), turnover/third-party-liability
  points from real posted GL data via the Phase 10 Reports module's own
  `calculateIncomeStatement()`/`calculateBalanceSheet()` (never re-implemented), and
  shareholder/member points from a manual input (no shareholder register exists
  anywhere in this codebase — same honestly-flagged gap Dividends Tax already carries).
  Append-only history per company (`IPublicInterestScoreRepository`, no update/delete —
  same shape as `IJournalEntryRepository`), satisfying §3's "retain historical scores."
- **Audit/independent-review suggestion (reg 28-29)** — `determineAssuranceLevel()`:
  public/state-owned always audited; fiduciary assets over R5m always audited; score
  ≥350 always audited; score 100-349 audited only if internally compiled (defaults to
  the stricter "audit" outcome when the compilation method isn't recorded, rather than
  guessing); score <100 requires independent review, with the Companies Act s30(2A)
  "owner-managed" exemption explicitly flagged as unmodeled (no shareholder-vs-director
  overlap data exists) rather than silently assumed.
- **Reporting-framework suggestion (reg 27, §2/§3)** — `determineReportingFramework()`
  SUGGESTS a framework; it is never applied automatically anywhere in this codebase.
  Public/state-owned → full IFRS; score ≥100 or fiduciary assets over R5m → IFRS for
  SMEs; score <100 and independently compiled → IFRS for SMEs; score <100 and
  internally compiled (or compilation method unrecorded) → flagged
  `requires_professional_review`, since Regulation 27 itself leaves that one band to
  the company's own discretion. Applying a suggestion still requires
  `CompanyService.setReportingFramework()`'s existing reason-required override — the
  Public Interest Score page is now the first real UI entry point to that method (it
  previously had none, tested only via `companyService.test.ts`).
  `Company.financialStatementsCompilation` (`'internal' | 'independent'`, optional) is
  a new manually-set field feeding both determinations.
- **Compliance Dashboard (§108)** — `src/features/compliance/pages/ComplianceDashboardPage.tsx`
  at `/compliance/dashboard`. A read-only aggregation, not a new calculation source (per
  docs/DO_NOT_BREAK.md) — every figure is recomputed live by the SAME function its own
  dedicated page already uses (`computeVatReport`, `computeEmp201Report`,
  `reconcileAccountsReceivable`/`reconcileAccountsPayable`, the latest
  `PublicInterestScore`/`TaxComputation`/`ProvisionalTaxPeriod`). Two §108 bullets are
  deliberately shown as absent rather than faked: "certificates" (no IRP5/tax-
  certificate generation exists anywhere in this app) and a suspense account (§40, not
  modeled in this Chart of Accounts). Inventory/Fixed-Assets/Bank-Reconciliation are
  link-outs to their own dedicated pages rather than duplicated cards, matching
  `ReportsPage`'s existing hub-of-links precedent for pieces that already have a real
  page of their own.
- 25 new tests (`calculateAverageEmployeeCount`, `complianceDeterminations`,
  `publicInterestScoreService` — including a listed-public-company forces-audit case and
  an append-only-history/newest-first case), 727/727 total, type-check/lint/build clean.

**Deliberately still open, not Phase 11 gaps in the strict sense**: the two
`requires_professional_review` bands noted above (Regulation 27's discretionary band, the
s30(2A) owner-managed exemption); no Public Interest Score reversal/correction path (a
re-calculation adds a new record rather than editing, same one-way-door shape every other
compliance record in this codebase has); Compliance Dashboard shows the CURRENT month/open
financial year only, no historical trend view.

## Phase 12 (Advanced Accounting) — ✅ complete, 2026-08-23 (Deferred Tax, Expected Credit Losses, Related Parties, Foreign Exchange infrastructure, Leases, Reporting Standards versioning; Consolidation audited per the spec's own "architecture only" wording)

§116's Phase 12 checklist spans 10 items of very different sizes (IFRS/IFRS-for-SMEs
disclosure framework, deferred tax, leases, financial instruments, consolidation, related
parties, foreign exchange, impairment, advanced disclosures). Given the size, the user
chose to pace this phase one piece at a time rather than attempt it in one pass — Deferred
Tax first, since it's the one piece this codebase can build on real existing data rather
than a brand-new module with nothing to build on yet.

- **Deferred Tax (§50)** — `src/features/tax/deferredTax/`. Explicitly NOT
  `accountingProfit x taxRate` (the spec forbids that shortcut): `DeferredTaxComputationService`
  auto-suggests one temporary-difference item per Fixed Asset with a real difference between
  its accounting carrying value and its SARS wear-and-tear tax written-down value, reusing
  `taxRegisterService.getTaxRegister()` (Phase 7) as the source rather than re-deriving it —
  the one source of temporary differences this codebase can compute without guessing. Manual
  items (a provision, an assessed tax loss) can be added the same way `TaxComputation`'s
  adjustment lines work — auto-suggest what's real, let the user add the rest. A taxable
  temporary difference (carrying amount > tax base) always recognizes a Deferred Tax
  Liability; a deductible one (carrying amount < tax base) only contributes a Deferred Tax
  Asset if the user explicitly marks it `recognized` (§50's "probable future taxable profit"
  recognition criteria — a forward-looking judgment this system cannot make on its own,
  defaults to false). Draft-then-post lifecycle matching every other computation in this
  codebase; `postComputation()` posts only the MOVEMENT since the prior POSTED computation
  for the company (not the full balance every time — deferred tax accumulates on the balance
  sheet, unlike `TaxComputation`'s fresh annual charge), as one balanced entry built via the
  "debits and credits as vectors" technique `journalEntryService.ts` already established.
  Three new GL accounts: `acc_1600` Deferred Tax Asset, `acc_2400` Deferred Tax Liability,
  `acc_5600` Deferred Tax Expense (a credit balance there is a tax benefit, not an expense).
  Deliberately does NOT apply the SBC progressive bracket table to any item — every item uses
  the flat corporate rate regardless of `Company.isSbcEligible`, since deferred tax should in
  principle use the rate expected to apply when a temporary difference reverses, which is
  genuinely ambiguous for a progressive bracket years into the future — a documented
  simplification, not an oversight (§110/§111). 20 new tests, 747/747 total, type-check/
  lint/build clean.

**Deliberately still open, not Deferred Tax gaps in the strict sense**: no reversal path for
a posted `DeferredTaxComputation` (same one-way-door shape every other posted computation in
this codebase has); temporary differences are sourced from Fixed Assets only — no automatic
source for provisions or assessed tax losses (manual entry only, same honest "not modeled"
gap as everywhere else a shareholder register or profit forecast would be needed);
recognition of a Deferred Tax Asset is a per-item manual flag, not a modeled probability
assessment.

- **Expected Credit Losses (§46/IFRS 9)** — `src/features/financialInstruments/`. This
  codebase only models one financial instrument concretely — trade receivables — so this is
  scoped to IFRS 9's own "simplified approach" for trade receivables (a provision matrix by
  aging bucket), the one part of §46 that has real data to build on; loans/investments/other
  financial assets aren't modeled anywhere and weren't attempted. `EclComputationService`
  pulls real gross receivables per bucket from the SAME Customer Aging Report calculation
  the Reports module already uses (`getCustomerAgingReport()`, never re-derived); loss RATES
  per bucket are always a manual entry — this codebase has no historical default-rate data to
  derive them from, so it never guesses one, defaulting to 0% (or the prior posted
  computation's rate, carried forward for continuity across periods). Same draft-then-post,
  movement-only-posting shape as `DeferredTaxComputationService` — `postComputation()` posts
  only the change in the provision since the prior posted computation (including a genuine
  reversal, proven by a test where the overdue balance shrinks year-over-year), as one
  two-line entry: DR Impairment Loss (`acc_5700`, new) / CR Allowance for Doubtful Debts
  (`acc_1150`, new contra-asset, nets against Accounts Receivable on the Balance Sheet the
  same way Accumulated Depreciation nets against Fixed Assets — required zero changes to
  `calculateBalanceSheet()`, which already handles any `subType: 'contra_asset'` account
  generically). 18 new tests, 765/765 total, type-check/lint/build clean.

**Deliberately still open, not an ECL gap in the strict sense**: no reversal path for a
posted `EclComputation`; loans/investments/amortised cost/fair value (§46's other bullets)
have no real data anywhere in this codebase to compute against — not attempted, not faked.

**Related Parties (§88) — ✅ complete, 2026-08-22.** `src/features/relatedParties/`. A
manual disclosure-support register: `RelatedParty` records (director/shareholder/
subsidiary/associate/key_management/other_related_entity, with a free-text relationship-
detail field, since no shareholder register or org-chart exists anywhere in this codebase
to derive directorships/ownership percentages from automatically) and
`RelatedPartyTransaction` records against them, plus a pure
`buildRelatedPartyDisclosureSummary()` grouping transactions per related party (count +
total amount) for financial-statement disclosure. Genuinely read-only, no GL posting of
any kind (closest precedent: Capital Gains Tax) — a referenced-record delete guard blocks
removing a related party with transactions logged against it, same guard class every other
service in this codebase already uses. `natureOfTransaction` is deliberately free text, not
a closed enum — real related-party transactions are too varied to force into a taxonomy
this codebase hasn't verified against actual disclosure standards. 21 new tests.
Deliberately still open: no automatic detection of related parties from any existing data;
no enforced link against real Invoices/Bills (`sourceReference` is a free-text
cross-check pointer only).

**Foreign Exchange (§33) — infrastructure ✅ complete, real-document integration
deliberately NOT attempted, 2026-08-22.** `src/features/foreignExchange/`. A point-in-time
`ExchangeRate` engine (`getRateForDate()` resolves the most recent rate on/before a date,
never interpolates/guesses), pure realized/unrealized FX gain-loss calculator functions
with correct asset-vs-liability sign handling (proven by a hand-computable test: USD 1000
recognized at 18.00 then settled at 18.50 — an asset gains R500, a liability loses R500),
an Exchange Rates management page, and a standalone FX Calculator tool usable today with
zero other module dependencies. **Explicitly NOT built, and said so rather than faked**: no
Customer/Supplier/Invoice/Bill/Bank Account in this codebase carries a transaction currency
distinct from the functional currency (ZAR) — building that would mean touching Sales/
Purchases/Banking line items broadly, a much larger separate cross-cutting change, not
attempted in this pass per this codebase's "never fake reachability" discipline (see
`docs/KNOWN_ISSUES.md`'s history of catching exactly this anti-pattern elsewhere). Two new
GL accounts (`acc_4300` FX Gain, `acc_5900` FX Loss) exist ready for when that integration
happens; nothing posts to them yet. All rates are manually entered — no live FX feed. 18
new tests.

**Reporting Standards / IFRS-IFRS-for-SMEs versioning (§48/§49) — ✅ complete, 2026-08-22.**
`src/features/compliance/` (a new `ReportingStandardService` alongside the existing Public
Interest Score engine, since both are Company/Compliance-adjacent). Resolves which EDITION
of Full IFRS or IFRS for SMEs applies to a reporting period — the IFRS-for-SMEs 2025 third
edition's effective date (periods beginning on/after 1 January 2027, early adoption
permitted) is quoted directly from the master spec's own §49 text; IFRS 18's replacement of
IAS 1's presentation model (same 1 January 2027 date, early application permitted) was NOT
in the spec text and was independently verified live (WebSearch, cross-checked against
ifrs.org/PwC/ICAEW/KPMG, all agreeing) rather than recalled from training data, per §110.
`supersede()` mirrors `TaxRateService`'s exact versioning discipline — a new edition never
edits a prior one's fields, only marks it superseded, so a past reporting period always
resolves against whichever edition actually applied at the time. Early adoption is an
explicit, recorded toggle, never assumed. **Deliberately does NOT** attempt to encode the
actual clause-level disclosure requirements of any edition (e.g. "IFRS 18 requires a
management-performance-measures note") — fabricating that checklist without a complete
verified source would itself violate §110; what's built is the honest, buildable part §49
explicitly asks for (the versioning/effective-date engine), not invented content. 8 new
tests.

**Consolidation architecture (§87) — audited, no code changes, 2026-08-22.** The master
spec's own wording for this section is "architect for future support... do not design the
database in a way that makes consolidation impossible later" — not a feature to build. A
real audit (not a guess) is recorded as ADR 003 in `docs/DECISIONS.md`: confirms nothing in
the current schema blocks future consolidation (every field a future consolidation build
would need — `Company.parentCompanyId`, a `companyId` on every domain type, an ownership
percentage, a separate elimination-entries structure — is additive and backward-compatible,
the same pattern already used repeatedly in this codebase), but also confirms the real
prerequisite (multi-company tenant scoping, §75, already flagged since Phase 1) does not
exist yet and is a separate, larger, deliberately-deferred migration, not something this
audit schedules or attempts.

**Leases (§32, §47/IFRS 16) — ✅ complete, 2026-08-23.** `src/features/leases/`, lessee
accounting only (this app never plays the role of lessor). A full draft → commence →
amortize → terminate lifecycle mirroring the Fixed Asset Register's shape exactly.
`LeaseContract.initialLeaseLiability`/`initialRightOfUseAsset` are computed at creation
from the present value of a fixed monthly-payment annuity
(`calculateLeaseLiabilityPresentValue()` — ordinary annuity formula, `discountRatePercent`
always a manual input, same "don't guess" principle as Deferred Tax's loss rates, since no
market-rate lookup exists in this codebase); `postCommencement()` posts DR Right-of-Use
Assets (`acc_1700`) / CR Lease Liability (`acc_2450`); `runAmortization(periodEnd)` posts
ONE combined entry per period across every active lease (interest unwind + principal
repayment + straight-line ROU depreciation, aggregated via the SAME debit-vector technique
`journalEntryService.ts`/Deferred Tax already established, proven to sum to exactly zero by
test); `terminateLease()` derecognizes the remaining ROU carrying value and lease liability
with a gain/loss line, reusing the EXISTING Fixed-Asset Gain/Loss-on-Disposal accounts
(`acc_4200`/`acc_5300`) rather than adding new ones — the same P&L concept either way. The
current/non-current classification (§32) is a real simulated computation
(`calculateCurrentPortionOfLiability()`, walking the amortization schedule forward 12
months), shown informationally rather than as a separate GL account — no other liability in
this Chart of Accounts is split into two GL accounts that way either. 32 new tests.

**Deliberately still open, not Leases gaps in the strict sense**: no lease escalation
clauses (a single fixed payment for the whole term); no initial direct costs or lease
incentives (the ROU asset always equals the initial liability exactly); no in-place
modification/remeasurement (a changed lease requires terminate-and-recreate); no sublease
accounting; ROU depreciation always uses the lease term itself, not a separately-modeled
shorter useful life for the underlying asset.

**Every Phase 12 checklist item (§116) now has a real answer** — built where the spec asks
for a feature, audited-and-documented where it explicitly asks only for architecture
(Consolidation), and infrastructure-with-an-honest-boundary where real integration would
require a much larger separate change (Foreign Exchange). 844/844 tests passing (up from
765 at the start of this wave), type-check/lint/build clean throughout.

**Not started**: advanced disclosures generally (beyond what Reporting Standards above
resolves) — no Notes-to-Financial-Statements content-generation engine exists (Phase 10
already flagged Notes/Statement of Changes in Equity as out of scope); Deferred Tax's/
ECL's/Leases' own already-flagged individual gaps above.

Also cross-cutting and still absent regardless of phase: role-based approval workflows
(§38-§39; only a stub `Role`/`User` type exists), a suspense account (§40, now explicitly
surfaced as absent on the Compliance Dashboard rather than only in this document), a
central Reconciliation Centre (§71 — Banking's own reconciliation, the AR/AP subledger
reconciliation, and the Compliance Dashboard are now three separate views touching
reconciliation, not the single tied-together view §71 describes), document/attachment
management (§62), multi-company tenant scoping (§75 — noted in Phase 1 section above).

## What this document is not

This is not a verification that VAT 15%, corporate tax 27%, the R2.3m VAT threshold, or
the SBC brackets quoted in the master spec are currently correct SARS/legislative
figures — those numbers were supplied by the user, not independently verified against
SARS/the Income Tax Act/the VAT Act by this session. Per the spec's own §110 ("no
unsupported claims") and §111 ("professional review"), any tax/VAT configuration seeded
into this system from those figures must be flagged as user-supplied and pending
professional/accounting verification, not presented as confirmed.
