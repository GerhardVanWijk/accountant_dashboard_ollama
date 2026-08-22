# DEVELOPMENT STATUS & DOD TRACKER

## Module Completion Matrix

| Module / Domain | Route | List Page | Create/Edit | Types | Mock Repo | Tests | DoD Status |
|---|---|---|---|---|---|---|---|
| **Customers (Debtors)** | ✅ `/sales/customers` | ✅ | ✅ (4-tab form) | ✅ | ✅ | ✅ 67 tests (shared) | 🟢 Done |
| **Suppliers (Creditors)** | ✅ `/purchases/vendors` | ✅ | ✅ (4-tab form) | ✅ | ✅ | ✅ 67 tests (shared) | 🟢 Done |
| **Inventory** | ✅ `/inventory/products`, `/inventory/warehouses` | ✅ | ✅ | ✅ | ✅ (+ immutable stock ledger) | ✅ 67 tests (shared) | 🟢 Done |
| **Accounting (CoA/GL/Journals/Trial Balance)** | ✅ `/accounting/*` | ✅ | ✅ | ✅ | ✅ | ✅ 281 tests (shared) | 🟢 Done |
| **Sales (AR — Quotes/Orders/Invoices/Credit Notes/Receipts)** | ✅ `/sales/*` | ✅ | ✅ | ✅ | ✅ | ✅ 317 tests (shared) | 🟢 Done |
| **Purchases (AP — PO/Bills/Payments/Vendor Aging)** | ✅ `/purchases/*` | ✅ | ✅ | ✅ | ✅ | ✅ 317 tests (shared) | 🟢 Done |
| **Dashboard** | ✅ `/` | ✅ | n/a (read-only) | ✅ | n/a (aggregates other modules) | ✅ 90 tests (shared) | 🟢 Done |
| **Tax** | ✅ `/tax/rates`, `/tax/vat-return` | ✅ | ✅ | ✅ | ✅ | ✅ 22 tests (shared) | 🟢 Done |
| **Banking** | ✅ `/banking/*` | ✅ | ✅ | ✅ | ✅ | ✅ 281 tests (shared) | 🟢 Done |
| **Fixed Assets** | ✅ `/assets/*` | ✅ | ✅ | ✅ | ✅ | ✅ 31 tests (shared) | 🟢 Done |
| **Reports** | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | 🔴 Incomplete |
| **Admin & Audit** | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | ⏳ Pending | 🔴 Incomplete |

*Status Legend: 🟢 Done (20/20 DoD Points Met) | 🟡 In-Progress | 🔴 Incomplete / Pending*

*"Done" here means `docs/DO_NOT_BREAK.md`'s 20-point feature-completeness checklist
(route, nav, CRUD, states, tests, build) — it is NOT a claim of full compliance with
`docs/SA_ACCOUNTING_MASTER_SPEC.md`. See `docs/SA_SPEC_GAP_ANALYSIS.md` for the deeper
accounting-integrity/SA-compliance gaps still open in Sales/Purchases/Accounting/
Banking/Tax despite all six being 🟢 on this feature-completeness matrix. Inventory
(Phase 6) is now genuinely complete per `docs/SA_SPEC_GAP_ANALYSIS.md`, including
valuation-method choice (WAC/FIFO), per-warehouse attribution, real 3-way PO/GRN/
Invoice matching, and credit notes reversing Cost of Sales/restoring stock for returns
(all fixed 2026-08-21/22, see `docs/KNOWN_ISSUES.md`). Fixed Assets (Phase 7,
2026-08-22) is genuinely complete too: an asset register with a draft-then-capitalize
lifecycle, a real straight-line/reducing-balance depreciation engine posting balanced
combined GL entries, disposals computing real gain/loss, and a Tax Register comparing
accounting vs. SARS wear-and-tear book values — see `docs/SA_SPEC_GAP_ANALYSIS.md`'s
Phase 7 section for the deliberately-still-open boundaries (no Bill-line
capitalization path yet).*

## Checkpoint — 2026-08-20: Phase 1 complete (Wave 1 + Wave 2)

Customers, Suppliers, and Inventory modules built in parallel (3 bees, disjoint feature
folders), independently QA-verified (type-check/lint/build/test all clean, 67 tests,
scope/icon/contrast/repository-discipline all held), 9 missing icon-registry keys added
by UI Bee as a follow-up. Sales(AR)/Purchases(AP) rows above cover only the *transactional*
documents (quotes, invoices, POs, bills) — those are Phase 2, not yet started; the master-
data/ledger side (Customers/Suppliers directories, aging, credit control) is what Wave 1
delivered and is separate from those rows.

Dashboard Bee (Wave 2, sequential — depends on Wave 1) then built the Executive Dashboard
consuming real Customers/Suppliers aging aggregation and Inventory's stock/low-stock
service, with Revenue/Expenses/Cash Flow mocked and clearly flagged pending the Banking/
Accounting modules. Independently QA-verified including a specific check that the AR/AP
aggregation calls the real per-entity functions rather than faking numbers. 90 tests total
across the full Phase 1 surface.

Phase 1 is now fully complete. Next: Phase 2 — Sales, Purchases, Banking, Accounting
(General Ledger/Journals/CoA), likely dispatched as another parallel wave once dependency
ordering between them is worked out (e.g. Accounting's CoA underlies journal posting for
all of Sales/Purchases/Banking).

## Checkpoint — 2026-08-21: Phase 2 Wave 1b complete (Sales + Purchases module UIs, GL wired)

Wave 1 (2026-08-21, earlier) shipped Sales/Purchases' transactional documents and
services but left Quotes/Sales Orders/Credit Notes/Customer Receipts/standalone
Purchase Orders/Payment Register/Vendor Aging as unbuilt UI, and `billService.postBill()`
as a GL-posting TODO. Wave 2 (Banking + Accounting — General Ledger, Journals, Trial
Balance, Chart of Accounts, Bank Accounts/Transactions/Reconciliation) shipped in
parallel with real GL posting from Banking, independent of Wave 1b's remaining gap.

Wave 1b closed that gap: Sales Bee and Purchases Bee dispatched in parallel (disjoint
feature folders, shared config frozen), each building the remaining pages/components/
hooks against an already-built service layer. `InvoiceService`/`BillService` now require
a real `journalEntryService` at construction, and `markInvoiceAsSent()`/`postBill()`/
`issueCreditNote()`/customer-receipt allocation all post genuinely balanced double-entry
journal entries — no module in Sales or Purchases has a fake/mocked GL posting path
anymore. A shared `invoiceService` singleton (`src/services/index.ts`) was added so
every consumer (Invoices page, Credit Notes, Customer Receipts, Sales Order → Invoice
conversion) reads/writes the same in-memory invoice store. 317 tests passing (45 files),
type-check/lint/build clean, independently re-verified by Queen Bee.

**Flagged gap, not blocking:** a Purchase Order can be converted to a Bill more than
once — no `billId`/converted-status field exists yet to guard it (see
`docs/KNOWN_ISSUES.md`).

## Checkpoint — 2026-08-22: Phase 7 (Fixed Assets) complete

New module, `src/features/assets/`: Asset Register (draft-then-capitalize, matching
Bill/Invoice/PurchaseOrder's create-draft-then-explicit-post pattern), a straight-line/
reducing-balance depreciation engine posting one combined balanced journal entry per
run (idempotent per period, auto-flips to `'fully_depreciated'`), disposals computing
real gain/loss (proven for gain/loss/break-even/zero-proceeds cases), and a read-only
Tax Register comparing accounting carrying value against a SARS wear-and-tear tax
written-down value. Five new GL accounts (Fixed Assets, Accumulated Depreciation,
Depreciation Expense, Gain/Loss on Disposal). Seed data deliberately left as `'draft'`
— no fabricated posted history without a real matching `JournalEntry` behind it, per
the lesson from Phase 5's VAT reconciliation gap. 31 new tests (445/445 total),
type-check/lint/build clean. Full detail in `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 7
section and `docs/HIVE_TASKS.md`. Deliberately still open: no Bill-line capitalization
path yet (`FixedAsset.sourceBillId` exists on the type but nothing sets it).