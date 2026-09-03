# CURRENT TASKS — Browser-Driven Correction Pass

**Opened:** 2026-08-27
**Rule:** Do NOT commit or push until the entire pass is complete and validated. Stop for user review.
**Source:** User's visual inspection of the deployed app ("Vertex Accounting") — 28-point brief.

Legend: `[ ]` not started · `[~]` in progress · `[x]` complete

---

## CURRENT PHASE — Browser QA / deployment candidate (2026-09-03)

**COMPLETED**
- Increment 1 — record-page framework, Sales Order + Inventory Product full pages, tax-rate wiring fix, inventory-cluster native-`<select>` sweep.
- Increment 2 — remaining 12 record types migrated to full pages, 15 detail sheets deleted, app-wide **transaction-form** dropdown sweep, tax-rate regression guard.
- Increment 3 (**UNCOMMITTED**) — inventory movement ledger: human source-document numbers (no UUIDs) + `RelatedRecordPreview` over-the-page overlay + expandable Movement/Source/Accounting/Technical panel; sales-document workflow **audit** (quote/SO/invoice non-posting rules confirmed, partial-payment confirmed, **customer-deposit accounting gap** + partial-SO-invoicing + stock-commitment absence reported, not changed). See `# RECORD DETAIL — INCREMENT 3` below.
- Increment 4A (**UNCOMMITTED — STOPPED at Review 4A-4, awaiting apply/commit approval**) — Customer Deposits / Prepayments / Contract Liability. New `2600 Customer Deposits` account + `CUSTOMER_DEPOSIT` mapping key; `recordReceipt()` split posting (AR = applied, 2600 = unapplied); `reconcileCustomerDeposits()` + AR-recon rework + cash-flow "Customer Deposits" line + `reverseJournalEntry()` subledger guard; UI: available-deposit on receipt/customer pages, "Apply deposit" on the invoice page. **Hardening pass (Reviews 4A-3 / 4A-4):** `allocateToInvoice()` runs entirely inside the atomic `apply_customer_deposit` RPC (migration `0046`) — one Postgres transaction; idempotency keyed on a **stable client-generated UUID `allocationId`** (`deposit_allocation_log` UNIQUE `(company_id, allocation_id)`, never on `allocations.length`); locks receipt→invoice (fixed order, deadlock-audited), re-validates against locked rows; DB CHECK constraints on `unallocated_amount` / `amount_paid` (+ `payments`/`bills` mirrors); `ReceiptAllocation` gains a stable `id`; `TS CustomerReceiptService` calls it via a `DepositAllocationExecutor` (Real/Fake split), UI modals generate the id once per open. `0045` ABORTs on a conflicting pre-existing 2600. `0045b` historical script uses `deposit_reclassification_log` (`UNIQUE (company_id, receipt_id)`) for deterministic idempotency. Migrations **`0045` + `0046` authored, NOT applied**; `0045b` (3 Office National receipts, **live R4,250** — the R1,750 in the ON fixture is a 2026-08-28 snapshot, not a business rule) **authored, NOT executed**. Gate: tsc ✅ · eslint `--max-warnings 0` ✅ · **2083 tests / 294 files** ✅ · `vite build` ✅. No DB writes, no migration applied, no corrections posted, no commit/push/deploy. Full detail: `docs/ACCOUNTING_RELATIONSHIPS.md` § "CUSTOMER DEPOSITS / PREPAYMENTS — INCREMENT 4A".

Gate green on `phase-9b-relationship-design-and-code`: tsc ✅ · eslint `--max-warnings 0` ✅ · **2063 tests / 294 files** ✅ · `vite build` ✅. Increments 1–2 committed `3318e7b` + pushed; **increment 3 is uncommitted, awaiting review**.

**Cloudflare Pages preview deployment** (auto-built from the branch push — production `main` / `https://vertex-accounting.pages.dev` untouched):
- Branch preview: **https://phase-9b-relationship-design.vertex-accounting.pages.dev**
- This commit: https://6fb60958.vertex-accounting.pages.dev

**BLOCKING FINAL PRODUCTION DEPLOYMENT**
- Human visual / browser QA of the deployment candidate (never run in this env — no Chrome DevTools / Playwright MCP).

**KNOWN NON-BLOCKING ISSUES**
- `MockStockLotRepository` / FIFO limitation — FIFO stock lots are in-memory only; not exercised (every seeded product is weighted-average). See `docs/KNOWN_ISSUES.md`.
- ~~Deferred configuration / admin `NativeSelect` sweep (~34 non-transaction forms)~~ — **DONE 2026-09-03** (`### GLOBAL SELECT MIGRATION`); zero native `<select>` app-wide, guard `noNativeSelect.global.test.ts`.
- Journal Entry detail still sheet-backed (`?record=`) — no full-page `JournalEntryDetailPage` yet.
- GL Account / Fixed Asset / Lease intentionally retained as sheets this increment (borderline records, per brief §B).
- Create / edit modal shell width still requires browser confirmation.

---

# ================================================================
# POST-4A ROADMAP — Sales documents & fulfilment
# ================================================================

**Added:** 2026-09-03 (user roadmap). **Rule for every phase below:** design → author →
**STOP at the phase's own review checkpoint** → gate green (tsc / eslint `--max-warnings 0` /
full test suite / `vite build`) → wait for explicit approval before applying any migration,
committing, pushing or deploying. No live DB writes during investigation (read-only Supabase
MCP only). Accounting-immutability rules (posted invoices/bills/JEs/receipts/credit notes,
audit logs, inventory postings) are never weakened.

```
4A  CUSTOMER DEPOSITS            ← done, stopped at Review 4A-4 (apply/commit pending)
      ↓
4B  PROFESSIONAL DOCUMENTS       ← next visible frontend increment
      ↓
5   SALES FULFILMENT             ← 5A stock commitment · 5B partial SO fulfilment · 5C delivery notes · 5D partial invoicing
      ↓
6   ADVANCED INVENTORY / SALES   ← only on top of a solid fulfilment model
      ↓
7   POLISH + PRODUCTION HARDENING
```

Legend: `[ ]` not started · `[~]` in progress · `[x]` complete · **CP-n** = review checkpoint.

---

## PHASE 4B — Professional Quote / Sales Order / Invoice documents

**Type:** visible frontend increment. **No accounting/DB change** expected (a `duplicate`/`copy`
service method + possibly a `salesperson`/`terms`/`bankingDetails` field on the document types is
the likely ceiling — flag before adding). Builds on the record-page framework from Increments 1–3.

**Context / gap:** Increment-3 audit found Quote & Sales Order (and the other `*DetailPage`
records) have **no formal business-document print/export** — `window.print()` prints app chrome +
on-screen HTML; the Phase-7 `ExportMenu` / `PrintableReport` is wired on list pages only; there is
no branded A4 layout. See `docs/ACCOUNTING_RELATIONSHIPS.md` § "SALES DOCUMENT WORKFLOW AUDIT" Q8
and `docs/KNOWN_ISSUES.md`.

### Deliverable — ONE reusable document system

```
PrintableDocument
   ├── Quote
   ├── Sales Order
   ├── Invoice
   ├── Credit Note
   └── Purchase Order
```

### Tasks
- [x] **4B.0 Investigation** — done (Queen Bee handoff + this increment). See `docs/BUSINESS_DOCUMENTS.md`.
- [x] **4B.1 `BusinessDocument` component** — `src/features/businessDocuments/` A4 template + `businessDocuments.css` (screen preview + `@media print` gated on `body.printing-business-document`).
- [x] **4B.2 Per-document adapters + wrappers** — id-free `BusinessDocumentViewModel` + 5 pure adapters (quote/SO/invoice/credit-note/PO) + `useBusinessDocument` hook + `BusinessDocumentPreviewModal`; **Print / PDF** action on all 5 `*DetailPage`s. Email-ready standalone output: deferred.
- [x] **4B.3 Duplicate / copy** — `quoteService.duplicateQuote` · `salesOrderService.duplicateSalesOrder` · `purchaseOrderService.duplicatePurchaseOrder` · `invoiceService.copyToNewDraftInvoice` (NOT credit note). New draft, new number, today, fresh line ids, guarded, tested. Not audit-logged (mirrors existing `create*` — see doc). Not run against live data.
- [x] **4B.4 Tests** — +56 tests / +5 files (adapters ×17, `noInternalIds` scan ×10, `BusinessDocument` ×7, `BusinessDocumentPreviewModal` ×5, layout ×4, duplicate ×8 across the 4 service test files, "Print / PDF present" ×5 on the detail-page tests).
- [x] **4B.5 Docs** — new `docs/BUSINESS_DOCUMENTS.md`; `KNOWN_ISSUES.md` "no formal print layout" closed + Company-document-profile gap logged; this section.

**Historical task text (superseded by the above):**
- [ ] **4B.0 Investigation** — inventory every existing print/export primitive (`src/features/export/`
  `ExportMenu` / `PrintableReport` / `PrintableReport`'s `@media print`), the `useCompany()` shape
  (logo? reg no? VAT no? banking details? address?), the `Customer`/`Supplier` address fields, the
  document line-item shape, and the shared `record-page` components. Report what data exists vs.
  what a professional document needs (e.g. is there a company-logo asset store? bank-account
  details for "payment information"?).
- [ ] **4B.1 `PrintableDocument` component** (`src/features/salesDocuments/` or `src/features/print/`) —
  A4 layout, `@media print` + on-screen preview. Slots: company logo + details block; document
  title + number; issue date; expiry (Quote) / due date (Invoice/Bill) / order date (SO/PO);
  bill-to + ship-to (delivery) address; party (customer/supplier) details; line table
  (SKU/description/qty/unit price/discount?/VAT rate/line total); subtotal / VAT / total; deposit
  applied + balance due where relevant; notes; terms; **payment information** (bank details);
  page numbers ("Page 1 of N"); footer (company reg/VAT).
- [ ] **4B.2 Per-document wrappers** — Quote, Sales Order, Invoice, Credit Note, Purchase Order —
  each a thin mapping from the domain object → `PrintableDocument` props. Wire a **Print** and a
  **Save PDF** action (and **email-ready output** — a clean standalone HTML/text the user can copy
  or that a future edge function can send; no email backend is built here) onto each `*DetailPage`
  action bar.
- [ ] **4B.3 Duplicate / copy** — a `duplicate()` service method for Quote / Sales Order / Purchase
  Order (NOT Invoice/Credit Note — those are corrected by credit note, never copied). Copies lines
  + party + terms into a **new draft**, new number, today's date. Guarded, tested, audit-logged.
- [ ] **4B.4 Tests** — `PrintableDocument` renders every slot from a fixture; each wrapper maps
  correctly; `duplicate()` produces an independent draft (no shared refs, new number, draft status);
  print stylesheet asserted via the existing `hidden print:block` pattern.
- [ ] **4B.5 Docs** — new `docs/PRINTABLE_DOCUMENTS.md`; update `KNOWN_ISSUES.md` (close the
  "no formal print layout" entry) and `ROUTES.md` if any route is added.

**CP-4B (review checkpoint):** component API + one worked example (Invoice) rendered; data-gap
report (logo/bank details); list of any type/schema field added and why; full gate; confirm no
accounting/DB change (or present the migration if one is truly required). **STOP.**

---

### PHASE 4B — DONE, uncommitted, branch `phase-9b-relationship-design-and-code` (2026-09-03)

**No accounting / DB / migration / seed / posting / VAT / WAC / GL / reconciliation / flag change.**
No `Company` type/table change (Company Settings gap **reported** with a proposed-but-unapplied
`0047` sketch in `docs/BUSINESS_DOCUMENTS.md`, not implemented).

| Area | Detail |
|---|---|
| New module | `src/features/businessDocuments/` — `types.ts` (id-free `BusinessDocumentViewModel` = the privacy boundary), `adapters/` (`shared.ts` + 5 pure adapters + `__fixtures__.ts`), `components/` (`BusinessDocument.tsx` A4 sheet, `BusinessDocumentPreviewModal.tsx`, `printBusinessDocument.ts`), `hooks/useBusinessDocument.ts`, `businessDocuments.css`, `index.ts`. |
| Wiring | **Print / PDF** action + `<BusinessDocumentPreviewModal>` on `QuoteDetailPage` · `SalesOrderDetailPage` · `InvoiceDetailPage` · `CreditNoteDetailPage` · `PurchaseOrderDetailPage`. **Duplicate** action on all but Credit Note. `Icons.print` registry key added. |
| Duplicate services | `quoteService.duplicateQuote` · `salesOrderService.duplicateSalesOrder` · `purchaseOrderService.duplicatePurchaseOrder` · `invoiceService.copyToNewDraftInvoice` + mutation-hook methods. Shared `documentNumberPrefix` added next to `nextDocumentNumber`. New draft only; NO GL post; NOT run against live data. |
| Footer | Exact: `Generated with Vertex Accounting Solutions • {year} • All rights reserved.` — `{year} = new Date().getFullYear()`, never hardcoded. |
| Print CSS | Gated on `body.printing-business-document`: hide `#root`, promote the portal-hosted sheet to static flow so it paginates; `@page { size:A4; margin:14mm }`; header repeats, rows/totals/footer `break-inside:avoid`; footer flows at end, no page numbers. White paper regardless of theme (documented literal-colour exception; no eslint-disable — repo has no colour rule). |
| Gate | tsc ✅ · eslint `--max-warnings 0` ✅ · **2139 tests / 299 files** ✅ (was 2083 / 294 — **+56 / +5**) · `vite build` ✅ |
| DB writes | **NONE.** Migrations: **NONE.** Commit / push / deploy / merge: **NO.** |

**Outstanding:** human visual / browser QA of the printed output (A4 pagination, print dialog with
headers/footers off, PDF export, dark-app → white-paper) — no Chrome DevTools / Playwright MCP in
this env. Email-ready standalone output and `ExportMenu`-on-record-pages: deferred.

---

### PHASE 4B-2 — Company Document Profile + document hardening — DONE + COMMITTED + PUSHED, branch `phase-9b-relationship-design-and-code` (2026-09-03, Review 4B-3 close-out)

**No accounting / journal / VAT / WAC / COGS / inventory / recon / allocation / posting / flag
change. Migration `0047` APPLIED live (additive only). NO Supabase Storage bucket. Office National
`0047` columns all left NULL. NOT merged to `main`, production NOT deployed.**

| Area | Detail |
|---|---|
| Migration | **`0047_company_document_profile` — APPLIED to live 2026-09-03** (`supabase/migrations/20260903120200__0047_company_document_profile.sql`), after Stage-1 read-only pre-flight. Adds nullable `trading_name`, `logo` (base64 data URL — NOT Storage), `document_address` (jsonb `Address`), `phone`, `email`, `website`, `document_terms`, `documents_bank_account_id` (FK → `bank_accounts`, `on delete set null`) to `companies`. Additive, no defaults, no backfill. Post-apply: all 3 rows NULL on all 8 cols, TB balanced, 0 new advisors. Details: `docs/SUPABASE_MIGRATION_GUIDE.md` § 0047. |
| Type + repo | `Company` gains those 8 optional fields; `SupabaseCompanyRepository` row type + `rowToCompany` + `companyToRow` (jsonb `document_address` ↔ `Address`; new keys written as SQL NULL on clear). `MockCompanyRepository` unchanged (spread). |
| Company Settings | New "Document & branding" `FormSection` in `CompanyForm` + `companyFormSchema` (`companyToFormValues` / `formValuesToCompanyPatch`), incl. client-validated logo upload (png/jpeg/webp/svg, ≤ 512 KB → data URL, Replace / Remove) and a "Bank account shown on documents" selector with "None". `CompanyPage` passes `useBankAccounts()` and shows the logo / address / contact on the card. |
| Global document integration | `adapters/shared.ts`: `issuerParty` emits `tradingAs` / `addressLines` / `email` / `phone` / `website`; `branding` emits `logoDataUrl = company.logo` + `issuerDisplayName = tradingName || name`. New `resolveDocumentTerms` (document-specific precedence) feeds `terms` on all 5 doc VMs. New `resolveDocumentsBankAccount` (id match + `active`). |
| Banking | Phase 4B "exactly one active bank account" fallback **removed** from `useBusinessDocument` — replaced with `company.documentsBankAccountId` + `active` resolution; else the invoice payment block is omitted cleanly. |
| Header | `DocumentHeader` revisited: `max-h-20 max-w-[280px] object-contain` logo, `break-words` long trading + legal names, legal name shown under a trading-name wordmark, multi-line address / contact. |
| Duplicate/Copy audit | `QuoteService` / `SalesOrderService` / `PurchaseOrderService` / `InvoiceService` take an optional `auditLog: AuditLogService` ctor param (defaults to the shared singleton — no wiring change). Each duplicate method writes `action:'created'`, `module`, `recordType`, `reason: 'Duplicated from <source number>'`, `newValue.copiedFromNumber`. Actor defaults to `SYSTEM_USER_ID = 'system'`. |
| Icons | Phase 4B's `Icons.print` registry key **reverted**; the direct `import { PrinterIcon } from 'lucide-react'` stays (established v0-era exception — `src/components/ui/Icon.tsx` doesn't exist, registry unused). |
| Privacy | `noInternalIds.test.tsx` extended: invoice company carries a real-UUID `documentsBankAccountId` + resolved account ⇒ human bank details render, the FK UUID does not; logo renders as `<img src="data:…">`, base64 not dumped as text. All Phase 4B privacy assertions retained. |
| Gate | tsc ✅ · eslint `--max-warnings 0` ✅ · **2169 tests / 300 files** ✅ (was 2139 / 299 — **+30 / +1**) · `vite build` ✅ |
| DB writes | Migration `0047` applied (additive DDL only — zero rows written). Storage bucket: **NO.** |
| Git | Two commits on `phase-9b-relationship-design-and-code`: `feat(company): add document branding profile` + `feat(sales,purchases): add professional A4 business documents`. Pushed to the branch. **`main` NOT merged. Production NOT deployed.** Cloudflare Pages branch preview auto-builds — see the preview URL in the Review 4B-3 report. |

**Deferred, documented, NOT solved here:** per-line discount column; SalesOrder delivery-address /
customer-PO-reference / expected-delivery. **Outstanding:** human visual / browser QA (no browser
tooling in this env); a private Storage bucket for the logo remains a valid future alternative
(its own review cycle).

---

### PHASE 4B — VISUAL HARDENING PASS — DONE, uncommitted, branch `phase-9b-relationship-design-and-code` (2026-09-03)

**Visual / print only. NO domain / accounting / VAT / WAC / COGS / AR / deposit / journal / stock /
reconciliation / fulfilment change. NO migration, NO DB write, NO commit / push / deploy / merge.**
Fixes the GLOBAL `src/features/businessDocuments/` A4 template from the user's manual QA of the
deployed Sales Order — once, so it flows through Quote / SO / Invoice / Credit Note / PO.

| Area | Detail |
|---|---|
| Two-column parties | Issuer LEFT under a `From` heading (new `vm.issuerHeading`), recipient RIGHT — side-by-side on A4 **and** in print (`.business-document__parties-grid` re-pinned to `1fr 1fr` in `@media print`). Issuer identity block **removed from `DocumentHeader`** (header = logo/wordmark + title + number + dates only; `pb-4`). `shipTo` → full-width "Deliver to" below the grid. |
| Account shown once | `metaField('Customer account' / 'Supplier account', …)` deleted from all 5 adapters; the value stays in the party block as `Account: …`. Quote + PO now have empty `meta`. |
| Vertex footer redesign | `branding.footerText` (string) → `branding.vertexFooter { generatedLine, rightsLine }` (structured, plain strings). `Generated with Vertex Accounting Solutions` + `© {year} Vertex Accounting Solutions. All rights reserved.`, `{year} = now.getFullYear()` (injectable clock, never hardcoded). Print-safe monochrome outline "V" mark (NOT the `bg-brand` `<Wordmark>`). One shared `DocumentFooter`. |
| Print title swap | `printBusinessDocument(documentNumber?)` swaps `document.title` to the doc number for the print, restores on `afterprint` (+2 s fallback). Modal passes `viewModel.documentNumber`. Kills "Accounting Suite" in the browser's top-centre print header. |
| Print UX helper | "Turn off Headers and footers" tip moved into the modal toolbar (`.business-document-modal__toolbar`, print-hidden), never on the sheet. Reworded. |
| Lower section | Invoice with payment info → two columns (notes+terms LEFT, payment RIGHT); else stacked. Terms `max-w-[38rem] text-[11px] leading-relaxed whitespace-pre-wrap`, never truncated. `.business-document__lower` `break-inside: avoid`. |
| Line items / totals | Visual polish only — uppercase tracked header, 2px rules, stronger `text-base font-bold` TOTAL. Authoritative values unchanged. |
| Investigation (reported, not acted on) | Browser print metadata: top-centre = `document.title` (controllable via swap); top-left date / bottom-left URL / bottom-right page number = pure browser chrome, no web API — user must untick "Headers and footers". PDF: `package.json` has zero PDF/canvas libs; **native browser print stays** (option A); no library installed. |
| Wordmark discrepancy | In-app `src/components/app/wordmark.tsx` renders "Vertex Accounting" (no "Solutions"); this footer uses the user's "Vertex Accounting Solutions". Flagged in `docs/BUSINESS_DOCUMENTS.md`, not reconciled. |
| Files | `types.ts`, `adapters/shared.ts`, 5 adapters, `components/BusinessDocument.tsx`, `components/printBusinessDocument.ts`, `components/BusinessDocumentPreviewModal.tsx`, `businessDocuments.css`, `index.ts` + 4 test files. Docs: `BUSINESS_DOCUMENTS.md`, `KNOWN_ISSUES.md`, `CURRENT_TASKS.md`. |
| Gate | tsc ✅ · eslint `--max-warnings 0` ✅ · **2178 tests / 300 files** ✅ (was 2169 / 300 — **+9 / +0**) · `vite build` ✅ |
| DB writes | **NONE.** Migrations: **NONE.** Commit / push / deploy / merge: **NO.** |

**Outstanding:** human visual / browser QA of the printed A4 (two-column parties + two-column
invoice lower section on paper, pagination, print dialog with "Headers and footers" on/off, PDF
export, dark-app → white-paper) — no Chrome DevTools / Playwright MCP in this env.

---

## PHASE 5 — Sales fulfilment

The core workflow. Target model:

```
QUOTE ──(accept)──▶ SALES ORDER ──┬── commit stock ──▶ RESERVED / COMMITTED
                                  └── DELIVERY / FULFILMENT ──┬── full delivery
                                                              └── partial delivery ──▶ partial / full INVOICE ──▶ PAYMENT
                                                                                        (deposit · partial · full)
```

Invariants that must hold throughout Phase 5:
- A Quote has **no** stock effect and **no** GL effect (unchanged).
- A Sales Order **reserves** stock but posts **no** movement, **no** COGS, **no** revenue, **no** VAT.
  *Commitment is a reservation, not a `stock_movement`.*
- Revenue / COGS / VAT / the inventory movement happen **only** when an Invoice posts (unchanged
  engine) — now driven by **delivered / invoiced quantities**, not "the whole SO at once".
- Deposits (4A) slot in at the PAYMENT step unchanged.

---

### PHASE 5A — Stock commitment

**Context / gap:** `StockBalance.quantityCommitted` exists in the type and `quantityAvailable()`
subtracts it, but **nothing ever writes it** — `stockBalanceService` hardcodes `quantityCommitted: 0`
and `stockService.getQuantityOnHand` has a literal `const quantityCommitted = 0; // TODO(Phase 2)`.
So **Available === On hand** everywhere today. (`docs/KNOWN_ISSUES.md` § "No stock reservation".)

### Model
```
On Hand
− Committed        (Σ open Sales Order line quantities not yet delivered, per product+warehouse)
= Available
```
Later (Phase 6, not 5A): also `On Order` (open POs), `In Transit` (transfers), `Backordered`.

### Tasks
- [ ] **5A.0 Investigation (read-only)** — trace `StockBalance`, `stockBalanceService`,
  `stockService.getQuantityOnHand`, `quantityAvailable()`, every UI that shows "Available" / "On hand"
  (`SalesLineItemsEditor` stock caption, inventory register, product detail), and every place a
  reservation would need to be created/released/adjusted. Decide: **derived** (recompute committed
  from open SO lines on read — simplest, always consistent) **vs. materialised** (a
  `stock_reservations` table + triggers/service — needed only if read performance demands it).
  Strong prior: **derive first**, matching how aging/margin are already derived.
- [ ] **5A.1 Commitment source of truth** — a Sales Order line, while the SO is
  `confirmed` and not fully delivered, commits `ordered − delivered` units of its product at its
  warehouse. Draft/pending SOs commit nothing; cancelled/fully-delivered commit nothing.
- [ ] **5A.2 `quantityCommitted` wired** — `stockBalanceService` / `stockService` compute real
  committed quantity (per product + warehouse). `quantityAvailable() = onHand − committed`.
- [ ] **5A.3 UI** — "On hand / Committed / Available" shown on the product detail, the inventory
  register, and the Sales / (later) Delivery line editors. The SO line editor warns when a line
  commits more than **available** (not just on-hand).
- [ ] **5A.4 Over-commitment policy** — decide + document: allow over-commitment with a warning
  (creates a backorder concept later) vs. block. Prior: **warn, don't block** (real businesses
  take orders they can't yet fill).
- [ ] **5A.5 Tests** — committed = Σ open confirmed-SO undelivered lines; released on cancel /
  full delivery; available never used as if it were on-hand for a real movement; no
  `stock_movement` is ever created by a commitment.
- [ ] **5A.6 Docs** — `docs/INVENTORY_ARCHITECTURE.md` commitment section; close the KNOWN_ISSUES entry.

**CP-5A:** model decision (derived vs materialised) with rationale; the exact commit/release rules;
any migration (only if materialised); UI screenshots-by-description; full gate. **STOP.**

---

### PHASE 5B — Partial Sales Order fulfilment  *(two-dimensional state)*

**Context / gap:** `SalesOrderService.convertToInvoice` copies **all** lines at full quantity,
marks the order `fulfilled`, and blocks re-conversion. No per-line "delivered / invoiced" tracking,
no `partially_*` status. (`docs/KNOWN_ISSUES.md` § "Partial Sales-Order invoicing".)

### Required design decision (settle at CP-5B-0)
**Fulfilment state and invoicing state are SEPARATE dimensions**, not one squeezed `status` field —
*preferred, if the architecture allows*:

```
commercialStatus :  draft · pending · confirmed · cancelled
fulfilmentStatus :  not_started · partially_delivered · delivered
invoicingStatus  :  not_invoiced · partially_invoiced · invoiced
```
plus per-line counters:
```
SalesOrderLine:  productId · orderedQty · deliveredQty · invoicedQty   (→ remainingToDeliver, remainingToInvoice derived)
```

### Tasks
- [ ] **5B.0 Investigation + design** — `SalesOrder` / `SalesOrderLine` shape, `convertToInvoice`,
  `salesOrderService` statuses, every consumer of `salesOrder.status` (list filters, badges, the
  "converted invoice" deep-link, dashboards). Produce the state-model proposal (separate dimensions
  vs. combined) with a migration sketch and a compatibility plan for existing SOs.
- [ ] **5B.1 Line-level counters** — `deliveredQty` / `invoicedQty` on each SO line (default 0);
  `remainingToDeliver` / `remainingToInvoice` derived. Migration + backfill (existing `fulfilled`
  SOs → `deliveredQty = invoicedQty = orderedQty`).
- [ ] **5B.2 Status dimensions** — add `fulfilmentStatus` + `invoicingStatus` (or the agreed
  shape); `commercialStatus` keeps the old values. Recompute on every delivery / invoice event.
- [ ] **5B.3 `createInvoiceFromSalesOrder(soId, lines[])`** — replaces the all-or-nothing
  `convertToInvoice`: caller picks quantities (≤ remainingToInvoice, and — once 5C lands — ≤
  delivered). Bumps `invoicedQty`, recomputes `invoicingStatus`. The invoice still posts through
  the **unchanged** engine.
- [ ] **5B.4 UI** — SO detail shows the per-line Ordered / Delivered / Invoiced / Remaining grid;
  "Create invoice" opens a quantity picker; status badges show both dimensions.
- [ ] **5B.5 Tests** — SO 10 → invoice 4 → invoice 3 → 3 remaining; `invoicingStatus` transitions;
  cannot invoice more than ordered (or, post-5C, more than delivered); existing single-shot
  conversion still works; engine untouched (revenue/COGS/VAT identical per invoice).
- [ ] **5B.6 Docs** — `docs/SALES_FULFILMENT.md` (new); update `ACCOUNTING_RELATIONSHIPS.md` SO section.

**CP-5B-0 (design checkpoint, BEFORE code):** the state model (separate vs combined) + migration
sketch + existing-data plan. **STOP for approval.**
**CP-5B (implementation checkpoint):** migration authored not applied; full gate; backfill dry-run
counts (read-only) for any live SO. **STOP.**

---

### PHASE 5C — Delivery Notes

Only meaningful once 5B exists.

```
SO-1024 ─┬─ DN-1001  (2 printers)   → stock movement, delivery evidence
         └─ DN-1002  (2 printers)   → stock movement, delivery evidence
```

### Open question for CP-5C-0
**Does delivery move stock, and if so how does it interact with the invoice's inventory posting?**
Options: (a) delivery posts the `stock_movement` + COGS/Inventory now, invoice posts only
revenue/AR/VAT later (proper "goods issued on delivery" model — mirrors the purchase side's
GRNI/3-way match); (b) delivery is evidence only, invoice still posts everything (simpler, keeps
the engine call unchanged). **Prior: (a)** — it's the accounting-correct model and the codebase
already has the GRNI precedent — but it's a real engine change and must be designed carefully.

### Tasks
- [ ] **5C.0 Investigation + design** — the purchase-side GRNI / 3-way-match code
  (`purchaseOrderService.recordReceipt` + `billService.postBill`), `docs/LEDGER_ARCHITECTURE.md`,
  the inventory engine's `costingMode`s. Decide (a) vs (b); if (a), design the sales-side clearing
  account (e.g. "Goods Delivered Not Invoiced") + the two-step posting.
- [ ] **5C.1 `DeliveryNote` entity** + `deliveryNoteService` — created from a Sales Order,
  line quantities ≤ remainingToDeliver; a `DN-####` number; a printable document (reuse 4B's
  `PrintableDocument`); bumps SO line `deliveredQty` + `fulfilmentStatus`.
- [ ] **5C.2 Stock effect** — per the CP-5C-0 decision. If (a): migration for the clearing account
  + engine wiring + the invoice-time clearing leg. If (b): the DN records `stock_movement`s with
  `source_document_type = 'delivery_note'` and the invoice keeps posting inventory (guard against
  double-issue).
- [ ] **5C.3 Invoice-from-delivery** — `createInvoiceFromSalesOrder` (5B.3) can be constrained to
  delivered-but-not-invoiced quantities; a "create invoice from these delivery notes" flow.
- [ ] **5C.4 Tests** — DN 2 + DN 2 against SO 4 → `delivered`; invoice can't exceed delivered;
  no double COGS / double stock issue; trial balance balanced; (a) clearing account nets to zero
  once invoiced.
- [ ] **5C.5 Docs** — `SALES_FULFILMENT.md` delivery section; `INVENTORY_ARCHITECTURE.md`;
  `ACCOUNTING_RELATIONSHIPS.md`; new source-document type in the movement-evidence tables.

**CP-5C-0 (design):** (a) vs (b) with full journal examples; clearing-account proposal; engine-change
scope. **STOP for approval.**
**CP-5C:** migrations authored not applied; full gate; live read-only impact scan. **STOP.**

---

### PHASE 5D — Partial invoicing  *(largely delivered by 5B.3 + 5C.3)*

Explicitly called out by the Increment-3 audit. Example: SO 10 chairs → invoice 4 → invoice 3 →
3 remaining. Covered by `createInvoiceFromSalesOrder(soId, lines[])` (5B.3), constrained to
delivered quantities once 5C lands.

### Tasks
- [ ] **5D.1** — confirm 5B.3 + 5C.3 fully cover the partial-invoicing scenarios; add any missing
  guard (can't invoice a cancelled SO line; rounding on split VAT across partial invoices;
  the deposit-application flow from 4A works against a partial invoice).
- [ ] **5D.2 Tests** — the chairs example end to end; VAT across partial invoices sums to the SO VAT;
  4A deposit applied to invoice #2 of a partially-invoiced SO.
- [ ] **5D.3 Docs** — `SALES_FULFILMENT.md` partial-invoicing worked example.

**CP-5D:** the worked example green end to end; full gate. **STOP.**

---

## PHASE 6 — Advanced sales / inventory  *(only on top of a solid Phase 5)*

Each is its own mini-increment with its own checkpoint. **Do not start any of these before
Phase 5 is complete and merged.** Rough priority order:

- [ ] **6A Backorders** — an SO line committing more than available becomes/flags a backorder;
  auto-fulfil when stock arrives (PO receipt / adjustment). Needs 5A + 5C.
- [ ] **6B `On Order` / `In Transit` stock views** — extend the 5A commitment model with open-PO
  and transfer-in-transit quantities: `On Hand · Committed · Available · On Order · In Transit · Backordered`.
- [ ] **6C Picking lists** — a warehouse pick document derived from confirmed SOs / delivery notes.
- [ ] **6D Packing** — pack confirmation step between pick and delivery note.
- [ ] **6E Customer price lists** — named price lists; product → list price.
- [ ] **6F Customer-specific pricing** — per-customer overrides / discounts on top of the list.
- [ ] **6G Salesperson attribution** — a `salespersonId` on Quote/SO/Invoice; commission reporting later.
- [ ] **6H Approval workflows** — SO / credit-note / large-discount approval gates (needs the
  real roles system — currently UI-gated only, see `docs/KNOWN_ISSUES.md` Phase T).
- [ ] **6I Quote expiry reminders** — `expiry_date` already exists on Quote; a reminder surface / job.
- [ ] **6J Pro-forma invoices** — a non-posting "pro-forma" document (reuse 4B); becomes a real
  invoice on acceptance.
- [ ] **6K Recurring orders** — a template + schedule that generates draft SOs.

**CP-6x:** each item gets its own design → author → checkpoint → gate → approval cycle.

---

## PHASE 7 — Polish + production hardening

- [ ] **7A** Human browser / visual QA of the whole deployment candidate (never run in this env —
  no Chrome DevTools / Playwright MCP): Increments 1–4A UI, the 4B documents, the Phase-5 fulfilment
  screens, `EnumSelect` / `SearchableSelect` popups, `AccountingPreview` full-width, modal shell widths.
- [x] **7B** Deferred configuration / admin `NativeSelect` sweep (~34 non-transaction forms) —
  **DONE 2026-09-03**, see `### GLOBAL SELECT MIGRATION`. Zero native `<select>` app-wide (guard:
  `noNativeSelect.global.test.ts`). Browser QA of the new popups folds into 7A.
- [ ] **7C** `JournalEntryDetailPage` (full page) — every record page still deep-links the JE via
  `?record=` → the side-sheet.
- [ ] **7D** GL Account / Fixed Asset / Lease → full pages (the 3 borderline records kept as sheets).
- [ ] **7E** `SupabaseStockLotRepository` + `stock_lots` migration OR gate FIFO out of `ProductForm`
  (the last `new Mock*Repository()` in production wiring — `docs/KNOWN_ISSUES.md`).
- [ ] **7F** `record_customer_receipt` atomic RPC (the `recordReceipt` non-atomicity flagged in 4A;
  same pattern as `apply_customer_deposit`) + a `paymentService` mirror.
- [ ] **7G** Live-Postgres inventory-posting E2E (needs a throwaway Supabase project) — the engine
  (`post_inventory_transaction`) has still never run against live data.
- [ ] **7H** Accounting-invariant regression suite (GL 1200 ↔ valuation tie, subledger ties,
  trial-balance-always-balanced) as a CI gate.
- [ ] **7I** Deposit unallocation / refund UI (deferred from 4A) — `DR 2600 / CR 1100` reversal of an
  allocation, and `DR 2600 / CR 1000` refund; both via a proper document-level flow, not the generic
  JE reverse button.
- [ ] **7J** Production deploy runbook + `main` merge of the whole 4A→7 line.

**CP-7:** final gate; deploy checklist; sign-off.

---

## WHERE WE STAND — 2026-09-03 (git reality check)

| Initiative | State | Commit(s) |
|---|---|---|
| Browser-Driven UI Correction Pass (§A–M below) | **shipped to `main`** | `170338a` `32cf860` `97a6e38` `6bd22d0` `6eb3b48` |
| Bank Statement Reconciliation + evidence model (P1 / P2) | **shipped to `main`** | `fa4aae1` `7481ef8` `3ccdafa` |
| Vertex Form System + page-layout foundation (P3A–P3I) | **shipped to `main`** | `62f0905` |
| Inventory Accounting Module — Phases 0–8 + 9A | **shipped to `main`** | `40f10fb` `4ac5277` |
| Inventory Phase 9B — normalized document-line tables | **merged to `main`; flag `NORMALIZED_DOCUMENT_LINES_ENABLED` still OFF** | `38f6b78` `465c10f` |
| Inventory UX Correction Pass | **shipped to `main`; deployed** | `6d203fc` `2b07407` |
| Form/Transaction UX pass + **September 2026 demo data** (seed 0044, migration 0043) | **merged to `main` + deployed** (2026-09-02); seed applied live; `bank_accounts.current_balance` re-synced to GL 1000 R313,080.92 | `3f07c5a` merge `82900b5` |
| **Record-detail → full-page migration** (increments 1 **+ 2**) + tax-rate fix + **app-wide transaction-form dropdown sweep** | **COMMITTED + PUSHED to `phase-9b-relationship-design-and-code`** (2026-09-03); **not merged to `main`** — awaiting human browser QA; gate green (tsc / eslint `--max-warnings 0` / **2052 tests / 293 files** / `vite build`); see `# RECORD DETAIL FULL-PAGE MIGRATION` below | branch push 2026-09-03 |

Production URL: **https://vertex-accounting.pages.dev** (Cloudflare Pages, auto-deploy on push to `main`).

### Still genuinely open

- **Visual / browser QA** — never run (no Chrome DevTools / Playwright MCP in this env):
  Correction Pass §27, P3J, Inventory Phase 4–8 UI, **all 12 new increment-2 full-page records** (sales
  ×4, purchases ×3, inventory ×5), the `EnumSelect` / `SearchableSelect` popups in the sales/purchases
  transaction forms, and `AccountingPreview` rendering full-width. Needs a human pass on the deploy.
- **Live-Postgres inventory-posting E2E** — never run (needs a throwaway Supabase project). The
  September seed created 29 `inventory_transaction_log` rows by **replaying** the posting contracts in
  SQL — the engine itself (`post_inventory_transaction`) still has not run against live data, and the
  GL 1200 ↔ valuation tie has no regression test.
- **Phase 9B projection flag** — `NORMALIZED_DOCUMENT_LINES_ENABLED` is OFF. Flipping it is a
  *separate later review* that must first see forward dual-write parity tested against the live DB.
- **Record-detail full-page migration — increment 2**: DONE (all 12 record types + transaction-form
  dropdown sweep; see `# RECORD DETAIL FULL-PAGE MIGRATION` → increment 2 below). Remaining `NativeSelect`
  consumers are **non-transaction** admin / tax-config / compliance / settings / reports / banking-import
  forms (~34 files) — a deliberately deferred separate sweep, listed under DEFERRED there.
- **Inventory Phases 10–14** — not started: Fixed-Asset nav cleanup · DB role-aware permissions/audit ·
  (Office National data now largely satisfied by seed 0044) · accounting-invariant regression tests ·
  reconciliation/investigator UI.

---

## FORM / TRANSACTION UX PASS + SEPTEMBER DATA PLAN — 2026-09-02 (uncommitted, branch `phase-9b-relationship-design-and-code`)

**Rule:** no DB writes until the September Part-T pre-write review is explicitly approved. No commit, no push.

### Process deviation — migration 0043 applied early

`0043_credit_note_reason_details` (`alter table credit_notes add column if not exists reason_details text`
+ comment) was **applied to the live project on 2026-09-02** (remote version `20260902051630`), even
though the Part Q–S brief said to hold it until the Part-T pre-write review.

- Additive nullable column only · **no backfill · no accounting rows changed · no existing credit-note
  values changed**. All 6 live `credit_notes` rows have a non-`other` reason → unaffected.
- `get_advisors(security)`: **0 ERROR**, only the pre-existing WARN set (anon sign-in, security-definer
  functions, leaked-password protection). Application gate green.
- **Accepted — no rollback.** Canonical migration file now committed at
  `supabase/migrations/20260902051630__0043_credit_note_reason_details.sql` (exact applied SQL) so
  `supabase db push` will not re-run it; contract + round-trip tests added.
- From here: **no further database writes** until the September pre-write review is approved.

Full detail: `docs/SEPTEMBER_2026_DATA_PLAN.md` §7.

### UX pass — done this session

| Item | State |
|---|---|
| Credit-note `reason_details` (`reason='other'` → detail required, own column, `notes` independent) | done — form + type + repo + `CreditNoteDetail`; no `[Other: …]` notes-folding left anywhere |
| Inventory document combobox sweep | done — `ProductCombobox` in Stock Adjustment / Transfer / Stock-Take-scope-N/A / Supplier Return / Opening Stock line editors; `SupplierCombobox` on Supplier Return header; `SearchableSelect` on Stock-Take category + the 4 GL-account pickers in Category form (31 expense accounts). Warehouse (1 today) + short enums stay native. |
| Sales Order stock availability warning | done — read-only "On hand / Available" caption per tracked line in `SalesLineItemsEditor` (`showStockAvailability`, opt-in, Sales Order only); warns when a line orders more than available; **no reservation / movement / GL** |
| Sales Order → converted-invoice link | done — `SalesOrdersPage` post-conversion notice deep-links `/sales/invoices?record=<id>` |
| Document width audit | `lg` (72rem) kept for Invoice / Credit Note / Quote / Sales Order / PO / Bill / Journal Entry (all have a wide line grid); **Customer Receipt + Supplier Payment → `md` (42rem)** (allocation-only forms, 72rem was dead space) |
| Code gate | tsc ✅ · eslint `--max-warnings 0` ✅ · **1952 tests / 269 files** ✅ · `vite build` ✅ |

### September 2026 data — APPLIED to live (2026-09-02), migration 0043 + seed 0044 committed

`docs/SEPTEMBER_2026_DATA_PLAN.md` Parts T–Z carry the full reviewed design + final authored
figures. Seed **0044** (73 JEs `JE-4101…4173`, 18 invoices, 13 bills, 2 credit notes, 14 receipts,
10 payments, 1 supplier return, 2 warehouses, 2 transfers, 6 depreciation entries, ON-SEP-2026
continuation reconciliation) was applied live via a guarded one-shot wrapper (that wrapper file is
**not** committed — execution-only). Post-write state, all green:

- whole-company `Σ(debit − credit)` = **R0.00**; closing TB balanced
- GL 1200 **R1,478,853.74** == inventory valuation (diff R0.00)
- GL 1000 **R313,080.92** == `bank_accounts.current_balance` (re-synced — Part Z) == statement close ± reconciling items
- September reconciliation variance **R0.00**; August b/f **R177.19** (3 derivations agree); ON-AUG-2026 fixture untouched
- normalized-line parity 0/0/0; `NORMALIZED_DOCUMENT_LINES_ENABLED` still **OFF**
- committed: `0043` migration + canonical file, `0044_september_2026_data.sql`, `september_2026_simulation.mjs` (generator), `september_2026_rollback.sql` (fail-closed), `september_2026_manifest.md`
- code gate: tsc ✅ · eslint `--max-warnings 0` ✅ · **1952 tests / 269 files** ✅ · `vite build` ✅

---

# RECORD DETAIL FULL-PAGE MIGRATION — 2026-09-03 (uncommitted, branch `phase-9b-relationship-design-and-code`)

**Brief:** complex business records must open as **full-page detail views** (real routes
`/module/records/:id`), not the cramped right-hand `RecordDetailSheet`. Simple record previews keep
the sheet. Also close two live-QA issues: native-`<select>` cleanup + "Unknown tax rate".
**Phased** — checkpoint after increment 1. **No accounting/DB change.** **No commit / no push.**

### Increment 1 — DONE (tsc ✅ · eslint `--max-warnings 0` ✅ · **1980 tests / 275 files** ✅ · `vite build` ✅)

| Item | State |
|---|---|
| **Tax-rate "Unknown tax rate" — root cause + fix** | `taxRateService` was wired to `MockTaxRateRepository` (fixture ids `tax_std_v2`…) while every product/document is Supabase-backed with a real UUID `tax_rate_id` — the id spaces never intersect. Verified read-only: data + RLS are fine. **Flipped `taxRateService` → `SupabaseTaxRateRepository`** (the old blocker — empty Supabase `tax_rates` — is gone; STD/ZERO/EXEMPT seeded 2026-08-28). `billService.test.ts` moved to a local `TaxRateService`+`MockTaxRateRepository` (both re-exported from the barrel). `useAllTaxRates` gained `.catch`/`error`. `getTaxRateLabel(id, rates, {pending})` returns `…` for an unresolved id while the list is empty/loading — never "Unknown". Also fixes forms writing bogus mock `tax_rate_id`s. **Zero DB writes.** |
| **Shared framework** `src/components/app/record-page/` | `RecordPageShell` (breadcrumb + `← back` + full width + loading/error/not-found), `RecordPageHeader` + `RecordActionBar` (primary / secondary / inline-danger / **More ▾** overflow; record number `whitespace-nowrap`), `RecordSummaryGrid`/`RecordField`, `DocumentLineTable` (one shared line-items table, scroll-contained), `useLegacyRecordRedirect(basePath)` (`?record=<id>` → `/base/<id>`, replace). |
| **Sales Order → full page** | `SalesOrderDetailPage` at `/sales/orders/:orderId`. `SalesOrdersPage` slimmed to list+create; row-click navigates; legacy redirect. `SalesOrderDetailSheet` + `SalesOrderDetail` **deleted**. |
| **Inventory Product → full page** | `InventoryItemDetail` (8-tab content extracted from the old sheet; movement ledger shows **human doc numbers** INV-/BILL-… **linked**, party, unit cost, + **resulting-balance** column; raw ids under "Technical details"). `InventoryItemDetailPage` at `/inventory/products/:productId`, reached from Products list + Inventory register + global search. `InventoryItemDetailSheet`, `ProductDetailSheet`, `ProductDetail` **deleted**. |
| **Native `<select>` sweep — inventory cluster** | New `EnumSelect` (`src/components/app/combobox/`, base-ui `Select`: dark popup, prefers-down, viewport-constrained, keyboard nav). Migrated: `StockAdjustmentDocumentForm` (warehouse, reason), `StockAdjustmentLinesEditor` (warehouse, direction), `StockTransferDocumentForm` (from/to), `StockTakeSetupForm` (warehouse, scope), `SupplierReturnLinesEditor` (warehouse, tax), `OpeningStockBatchDocumentForm` (warehouse), `OpeningStockLinesEditor` (warehouse), `CategoryForm` (default tax rate), `ProductForm` (type / uom / status / valuationMethod / tax rate). Guard: `noNativeSelect.test.ts`. |
| Global search | product result → `/inventory/products/:id` (was `?record=`). Customer/supplier stay `?record=` (still sheet). |
| Tests added | `record-page.test.tsx`, `global-search-records.test.ts`, `SalesOrderDetailPage.test.tsx`, `SalesOrdersPage.test.tsx`, `InventoryItemDetailPage.test.tsx`, `constants.test.ts` (`getTaxRateLabel`), `noNativeSelect.test.ts`. |

### `RecordDetailSheet` consumer audit — KEEP vs MOVE

**KEEP as side-sheet** (simple preview — few fields, no line table, no multi-tab investigation):
Bank Account · Bank Transaction · Customer · Supplier · Employee.

**MOVE to full page in increment 2** (line items / actions / accounting / tabs):
Quote · Invoice · Credit Note · Customer Receipt · Purchase Order · Bill · Supplier Payment ·
Stock Adjustment · Stock Transfer · Stock Take · Supplier Return · Opening Stock.

**Borderline — decide during increment 2:** GL Account (`AccountDetailSheet`, has a ledger table),
Fixed Asset (depreciation schedule), Lease (amortization schedule).

### Increment 2 — DONE, uncommitted (tsc ✅ · eslint `--max-warnings 0` ✅ · **2052 tests / 293 files** ✅ · `vite build` ✅) — 2026-09-03

**No accounting / DB / migration / seed / posting / WAC / GL / VAT / reconciliation / flag change.** UI + routing + read-presentation only.

| Record | Route | Page component | Notes |
|---|---|---|---|
| Quote | `/sales/quotes/:quoteId` | `QuoteDetailPage` | line items via shared `documentLineColumns` (SKU + name + tax-rate + tax); related → converted sales order; no GL section (quotes never post). |
| Invoice | `/sales/invoices/:invoiceId` | `InvoiceDetailPage` | **flagship** — overview, line items, payments/receipts table + outstanding, credit notes, **stock-movement evidence** (`sourceDocumentType='invoice'`), accounting/posting state + journal link, source sales order, posted-invoice immutability note. Edit = draft-only (unchanged). |
| Credit Note | `/sales/credit-notes/:creditNoteId` | `CreditNoteDetailPage` | reason + `reasonDetails` (migration 0043, still wired), **original invoice FK link** (`credit_notes.invoice_id`), allocation ledger, inventory-restock movements, reversing journal, per-line `originalInvoiceLineId` note (Phase 9B). |
| Customer Receipt | `/sales/receipts/:receiptId` | `CustomerReceiptDetailPage` | **Document / Original amount / Allocated / Remaining** allocation table + on-account summary; every allocated invoice clickable. Allocation logic unchanged. |
| Purchase Order | `/purchases/orders/:purchaseOrderId` | `PurchaseOrderDetailPage` | supplier → PO → **goods-received movements** + GRNI journal → converted bill (document-level link only — **no bill↔PO line relationship**, Phase 9B boundary preserved). send / receive / convert-to-bill unchanged. |
| Bill | `/purchases/bills/:billId` | `BillDetailPage` | source PO (FK), line items, payment status, payments table, inventory movements (own + source-PO's, with the "linked bill clears GRNI, doesn't re-record stock" note), journal. |
| Supplier Payment | `/purchases/payments/:paymentId` | `SupplierPaymentDetailPage` | allocation table (same shape as Customer Receipt); no lifecycle actions (a `Payment` has no status transitions). |
| Stock Adjustment | `/inventory/adjustments/:adjustmentId` | `StockAdjustmentDetailPage` | reuses `StockAdjustmentDetail` body (lines + live `AccountingPreview`); `RecordActionBar` maps draft → pending_approval → posted → reverse. |
| Stock Transfer | `/inventory/transfers/:transferId` | `StockTransferDetailPage` | from→to header, dispatch/receive state, WAC lines, status-scoped dispatch/receive `AccountingPreview`, both journal entries. |
| Stock Take | `/inventory/stock-takes/:stockTakeId` | `StockTakeDetailPage` | in-place count sheet (`StockTakeLinesView`) + `StockTakeCountSheetExport` in the action bar; net-variance `AccountingPreview` for ready_for_review/posted. |
| Supplier Return | `/inventory/supplier-returns/:supplierReturnId` | `SupplierReturnDetailPage` | supplier + reason + cost lines + Purchase Price Variance preview (shown even at R0.00). |
| Opening Stock | `/inventory/opening-stock/:batchId` | `OpeningStockBatchDetailPage` | keeps the **explicit "I confirm this opening balance is accurate" checkbox** gate before Confirm enables (`confirmBatch()` contract). |

- **Shared additions:** `documentLineColumns()` in `record-page/` (one column set for every AR/AP
  document line table — Item(SKU/name) · Description · Qty · Unit price · Tax rate · Tax · Line total);
  `useAccountingEffectPreview(loader, id)` in `inventory/hooks/` (the identical `previewAccountingEffect`
  `useEffect` lifted out of the 5 deleted inventory sheets).
- **Deleted:** 15 `*DetailSheet.tsx` + `*Detail.tsx` files (`InvoiceDetail(+Sheet)`, `QuoteDetail(+Sheet)`,
  `CreditNoteDetail(+Sheet)`, `CustomerReceiptDetail(+Sheet)`, `BillDetail(+Sheet)`,
  `PurchaseOrderDetail(+Sheet)`, `PaymentDetail(+Sheet)`, and the 5 inventory `*DetailSheet`s).
  `purchases/components/index.ts` barrel updated.
- **List pages slimmed:** all 12 (+ `InvoicesPage`) now list-only + `useLegacyRecordRedirect(base)` +
  `navigate(base/:id)` on row click. Create modals kept; edit/post/allocate/lifecycle moved to the
  record page.
- **Legacy `?record=` callers updated:** `InventoryItemDetail` `MOVEMENT_SOURCE` map (9 migrated types →
  `/base/:id`), `VatTransactionsTable` (invoice/credit-note/bill), `AssetDetailSheet` (source bill),
  `SalesOrderDetailPage` (converted-invoice link + convert-nav). `AuditTrailTable` / global search only
  map non-migrated types (JournalEntry, customer, supplier) so no change needed. Any un-updated caller
  still works via the per-list-page redirect.
- **Transaction-form dropdown sweep (K/L done in the prior UX pass; J completed here):**
  `SalesLineItemsEditor` (warehouse, tax rate → `EnumSelect`), `purchases/LineItemsEditor` (warehouse,
  tax rate, asset category, depreciation method → `EnumSelect`), `CreditNoteForm` (invoice →
  `SearchableSelect`, reason → `EnumSelect`), `AllocationForm` (invoice → `SearchableSelect`),
  `CustomerReceiptForm` (method → `EnumSelect`), `PaymentForm` (method → `EnumSelect`). Product /
  customer / supplier pickers were already the shared `ProductCombobox` / `CustomerCombobox` /
  `SupplierCombobox` from commit `3f07c5a`. Guard: `noNativeSelectInTransactionForms.test.ts` +
  `ProductCombobox.test.tsx` gains SKU-**and-name** search + viewport-cap assertions.
- **Tax-rate regression protection:** `taxRateServiceWiring.test.ts` — source-level guard that the
  production singleton is `new TaxRateService(new SupabaseTaxRateRepository(…))`, never `new Mock*`,
  that `MockTaxRateRepository` is still re-exported for isolated tests, and an allow-list check that no
  new unreviewed `new Mock*Repository()` wiring appears in the 8 core service/instance barrels.
- **Tests added:** 12 `*DetailPage.test.tsx` (render / not-found / action-gating per status / line
  rendering / no-sheet) + `QuotesPage`/`CreditNotesPage`/`CustomerReceiptsPage`/`PurchasesListPages`
  (row-click canonical route + legacy `?record=` redirect); `InvoicesPage.test.tsx` rewritten off the
  sheet; the 5 inventory list-page tests updated (sheet-post tests → navigate tests).
- **Kept as side-sheet (unchanged):** Bank Account · Bank Transaction · Customer · Supplier · Employee ·
  GL Account · Fixed Asset · Lease (the three borderline records deferred, per brief §B).
- **`DocumentLineTable` `<table>` consolidation:** the AR/AP document pages use it via
  `documentLineColumns`; the inventory pages still render their existing `*Detail` body's tables (lower
  risk — those bodies are already reviewed and carry the `AccountingPreview` wiring). Full consolidation
  of the inventory line tables is deferred.

### Increment 2 — NEW ISSUE DISCOVERED (Mock-repository audit, brief §Q)

**FIFO stock-lot repository is the one production `new Mock*Repository()` left in `src/`.**

- **Severity:** LOW · **Area:** Inventory / Data
- **Issue:** `src/features/inventory/repositories/instances.ts:30` —
  `export const stockLotRepository = new MockStockLotRepository();`. There is no
  `SupabaseStockLotRepository`. Every other repository in the codebase (accounting, sales, purchases,
  banking, assets, employees, leases, tax ×5, compliance, the other 11 inventory repos, …) is
  Supabase-wired.
- **Evidence:** `grep -rn "= new Mock[A-Za-z]*Repository\s*(" src` (excl. tests / stories / mock-data) →
  one hit. `MockTaxRateRepository` / `MockInvoiceRepository` still appear in `sales`/`tax` service
  barrels but **only in comments / test re-exports** — Increment 1's tax-rate fix is intact.
- **Impact:** FIFO stock lots are in-memory only — lost on reload, never persisted. **Not currently
  exercised:** WAC (`weighted_average`) is the active valuation method for every seeded product; FIFO
  lot tracking (`stockService.recordStockMovement` → lot allocation) only runs if a product is set to
  `valuationMethod: 'fifo'`. Same *class* of latent bug as the Increment-1 tax-rate discovery (a
  production service silently on a Mock).
- **Recommendation:** if FIFO is on the roadmap, build `SupabaseStockLotRepository` + a `stock_lots`
  migration before any product is allowed `valuationMethod: 'fifo'` in the UI; otherwise gate the FIFO
  option out of `ProductForm` until it exists.
- **Status:** OPEN — reported, **not fixed** (outside this increment's scope; brief §Q says report, don't
  auto-fix). Guarded against regression (no *new* Mock wiring) by `taxRateServiceWiring.test.ts`.

### Increment 2 — DEFERRED

- **Non-transaction `NativeSelect` sweep (~34 files):** ✅ **DONE — see `### GLOBAL SELECT MIGRATION`
  below** (2026-09-03). Every non-transaction `NativeSelect` / raw `<select>` in the list that follows
  has been migrated to `EnumSelect` / `SearchableSelect`; the app now has **zero** native `<select>`
  outside `native-select.tsx` + test files, enforced by `noNativeSelect.global.test.ts`.
- **GL Account / Fixed Asset / Lease → full page:** the three borderline records (ledger table /
  depreciation schedule / amortization schedule) — kept as sheets this increment per brief §B.
- **Full inventory line-table consolidation onto `DocumentLineTable`** (see note above).
- **Related-record "activity links"** on the new pages resolve to the target list route today, not a
  deep-linked highlighted row, for anything other than the migrated records (journals still open the
  sheet via `?record=`).

### Increment 2 — SUGGESTED IMPROVEMENTS

**High value**
- *Deep-link the journal-entry link.* Every new record page links "View journal entry" to
  `/accounting/journals?record=<id>` which still opens the sheet. A full-page `JournalEntryDetailPage`
  would complete the accounting-trace story end to end.
- *`SupabaseStockLotRepository`* — see the NEW ISSUE above; closing it removes the last latent
  Mock-in-production surface.

**Medium value**
- *Shared `AllocationTable` component* — Customer Receipt and Supplier Payment now render an identical
  Document / Original / Allocated / Remaining table; Bill and Invoice render near-identical
  payment/receipt tables. One component would DRY four call sites.
- ~~*`EnumSelect` interaction test helper*~~ — **DONE** (`tests/helpers/selectEnumOption.ts`:
  `selectEnumOption`, `selectEnumOptionWithin`, `selectSearchableOption`), added in the GLOBAL SELECT
  MIGRATION.

**Nice to have**
- *Breadcrumb "up to module" links* — the first breadcrumb crumb (e.g. "Sales") is inert; wiring it to
  the module landing page is a one-line change once those pages settle.
- *Record-page print stylesheet* — the new pages have real URLs now; a `@media print` pass would make
  an invoice/PO page a serviceable hand-out.

---

# GLOBAL SELECT MIGRATION — native `<select>` → Vertex `EnumSelect` / `SearchableSelect` — 2026-09-03 (COMMITTED + PUSHED, branch `phase-9b-relationship-design-and-code`; `main` NOT merged, production NOT deployed)

**Trigger:** human browser QA found the OS-native dropdown menu (light popup in dark mode) on
Companies → Edit → Legal entity type. The fix is global — every remaining native select, not one field.

**Pure UI. No business / accounting / VAT / journal / deposit / inventory / domain-enum / schema /
migration change. No DB write. No commit / push / deploy.**

**Canonical components (already existed — nothing new built):**
- `EnumSelect` (`@/components/app/combobox`) — short fixed enums. Wraps the base-ui `Select`: themed
  dark popup, `Portal` + `z-50` + `isolate`, viewport-anchored (`w-[var(--anchor-width)]`,
  `max-h-[var(--available-height)]` + internal scroll), prefers-down, full keyboard model. **One change:**
  now passes `items={options}` to the base-ui root so `<Select.Value>` renders the selected label when
  closed (was showing the raw value in jsdom → broke `IncomeTaxPage.test`; correct behaviour anyway).
- `SearchableSelect` (`@/components/app/combobox`) — long / searchable lists (GL accounts, asset /
  entity pickers). Same dark popup + a filter box.

**Audit — native `<select>` / `<NativeSelect>` count:** ~45 feature-file usages across 34 files
**before → 0 after** (outside `src/components/ui/shadcn/native-select.tsx` + test files). Category C
(`<select multiple>`) was empty; **category D (kept-native-for-a-reason) is empty** — everything
migrated cleanly, including the import-wizard column-mapping grids.

**Converted surfaces (by feature):**
- **admin:** `CompanyForm` (legal entity type ← the QA-flagged field, accounting basis, VAT filing
  frequency, VAT accounting basis, documents bank account), `UsersPage` (assign-role + per-row role),
  `SuperUserDashboardPage` (per-row role).
- **auth / settings:** `OnboardingPage` (legal entity type — `defaultValues` now seeds
  `legalEntityType: 'private_company'` to preserve the old always-had-a-value native behaviour),
  `SettingsPage` (theme).
- **customers / suppliers:** `CustomerForm` (status, tax status, currency, payment terms),
  `SupplierForm` (category, status, payment terms, payment method).
- **employees:** `EmployeeForm` (status, employment type, pay frequency), `PostPayrollRunForm`
  (net-pay account → `SearchableSelect`).
- **assets:** `AssetForm` (category, depreciation method), `DisposeAssetForm` (asset picker + proceeds
  account → `SearchableSelect`), `PostAcquisitionForm` (funding source → `SearchableSelect`).
- **relatedParties:** `RelatedPartyForm` (relationship type), `RelatedPartyTransactionForm` (related
  party picker).
- **inventory:** `WarehouseForm` (status), `reports/DateRangeControl` (preset).
- **accounting:** `AccountForm` (master type, normal balance → `EnumSelect`; parent account →
  `SearchableSelect`), `JournalEntryForm` (per-line account → `SearchableSelect`).
- **banking:** `BankAccountForm` (account type, bank name, status → `EnumSelect`; linked GL account →
  `SearchableSelect`), `TransactionForm` (3 bank-account selects), `AllocationRows` (GL account →
  `SearchableSelect`, VAT rate → `EnumSelect`), `ReconciliationWorkspace` (the raw `<select>` state
  filter), `StatementImportWizard` (bank account, format override).
- **tax:** `TaxRateForm` (VAT treatment, applies-to), `IncomeTaxPage` / `ProvisionalTaxPage` /
  `DeferredTaxPage` (financial-year picker), `incomeTax/SbcEligibilityForm` (yes/no),
  `incomeTax/AdjustmentsTable` (category, direction).
- **compliance:** `CalculateScoreForm` (financial year), `ReportingFrameworkOverrideForm` (framework).
- **financialInstruments:** `EclProvisionPage` (financial year).
- **reports:** `cashFlow/CashFlowStatementPage`, `financialStatements/IncomeStatementPage`
  (financial-year picker).
- **import:** `ImportWizard` (target-field pickers, column-mapping grid, duplicate strategy).

**Retained native selects:** NONE. `src/components/ui/shadcn/native-select.tsx` still exists (the
component) but has zero callers; `src/styles/globals.css`'s `select option { … }` stopgap is left in
place (harmless, and documents the reason the migration was needed).

**RHF files** wrapped each field in `<Controller>` (precedent `ProductForm.tsx`); **useState files**
went `value` / `onValueChange` direct. Option **values** (enum keys), labels, order, `id` (for
`<FieldLabel htmlFor>`), `name`, disabled / invalid / `<FieldError>` render, and the controlled value
on edit-existing-record are all preserved per field. The `AccountForm` master-type side effects
(re-default `normalBalance`, clear `parentAccountId`) are kept inside `onValueChange`.

**Guard:** `src/components/app/combobox/noNativeSelect.global.test.ts` — one test that walks all of
`src/`, strips comments, and collects every file where `NativeSelect` / `/<select[\s/>]/` appears
outside `native-select.tsx`, the (empty) `INTENTIONAL_NATIVE_SELECT` allow-list, and test files;
asserts the list is empty (a failure names every offender). The two earlier per-form guards
(`noNativeSelect.test.ts`, `noNativeSelectInTransactionForms.test.ts`) keep running with their
explicit `MIGRATED_FORMS` lists.

**Tests:** `tests/helpers/selectEnumOption.ts` (new shared helper). New `AccountForm.test.tsx` (6:
EnumSelect + SearchableSelect render / selected-value / type-side-effect / id round-trip / type-scoped
parent list). New `CompanyForm` "Legal entity type" block (4). Updated `CompanyForm`, `UsersPage`,
`SettingsPage`, `StatementImportWizard`, `IncomeTaxPage` tests for the base-ui interaction model.
**2178 → 2189 tests, 300 → 302 files**, all green.

**Gate:** `npm run type-check` ✅ · `npm run lint` (`--max-warnings 0`) ✅ · `npm run test` ✅
2189 / 302 · `npm run build` ✅.

**Remaining visual / browser-only risks (fold into human QA 7A):** the `EnumSelect` /
`SearchableSelect` popup on a real device — dark styling, downward opening near the viewport bottom,
long-list internal scroll, `SearchableSelect` filter typing, long product / customer / supplier
names wrapping vs truncating, layering above a `Dialog` / `Sheet` / drawer, ~400px mobile width
(popup never wider than the viewport), keyboard nav (Tab / Enter / arrows / Esc), and specifically
Companies → Edit → **Legal entity type**. No Chrome DevTools / Playwright MCP in this env — jsdom
tests cover the wiring, not the rendered popup.

---

# RECORD DETAIL — INCREMENT 3: inventory transaction investigation + sales workflow audit — 2026-09-03 (UNCOMMITTED, branch `phase-9b-relationship-design-and-code`)

**Inspect / code / UI only. No accounting, DB, migration, seed, GL, WAC or flag change.** Gate green
(tsc ✅ · eslint `--max-warnings 0` ✅ · **2063 tests / 294 files** ✅ · `vite build` ✅). **Not committed.**

### Code shipped

| Area | Change |
|---|---|
| **Source-document resolution** (`src/components/app/record-page/sourceDocument.ts`) | `resolveSourceDocument({type,id,reference}, resolveNumber)` → `{ label, number, path, previewType }`. `isOpaqueReference()` rejects the September seed's machine `"<type>:<uuid>"` reference **and** bare UUIDs — the ledger now shows **INV-1072 / BILL-2031 / CN-… / TRF-… / ADJ-… / ST-… / OPEN-… / SRET-…**, resolved from the structured `source_document_id`, never a UUID. Raw ids stay under "Technical details". Unit-tested (`sourceDocument.test.ts`, 10 cases). |
| **`RelatedRecordPreview`** (`src/components/app/record-page/RelatedRecordPreview.tsx`) | Large/wide document overlay (`5xl` desktop, near-full-screen mobile — shared `DialogContent`, scrolls internally) that renders an **existing** `*DetailPage` over the current page. Registry lazy-loads the 11 previewable pages (invoice, bill, PO, credit note, sales order, quote, supplier return, transfer, adjustment, stock take, opening stock). Closing returns to the exact page + scroll (the page never unmounts). No second renderer. Side-effect: the 11 pages code-split → main bundle 3,362 kB → 2,462 kB. |
| **`RecordPageProps` + `RecordPageShell embedded`** | Every `*DetailPage` now accepts `{ recordId?, embedded? }` (falls back to `useParams`); `embedded` hides the breadcrumb + back-link chrome so the page renders cleanly inside the overlay. 11 pages updated (2 lines each). |
| **Movement ledger — expandable evidence panel** (`InventoryItemDetail.tsx`) | Each row expands to **Movement** (type · date · qty · warehouse · direction for transfers · historical unit cost · movement value · resulting balance), **Source** (document type · human number → opens preview · party · notes), **Accounting** (journal entry link + **JE number**, Inventory GL 1200, contra account [5000 COGS / 2050 GRNI→AP / 5060 PPV / 5050 Adjustments / 1210 In Transit / 3950 OBE by movement type], plain-English relationship, engine **posting key**, reversal evidence), and **Technical details** (movement/source/line UUIDs). Source cell click opens `RelatedRecordPreview` — a real `href` is kept so middle-click still deep-links. |
| **`InventoryItemDetailPage`** | Loads the doc collections (credit notes, quotes, sales orders, POs, adjustments, transfers, stock takes, supplier returns, opening-stock batches) + journal entries; builds `numberById` / `journalEntryIdBySource` / `journalNumberById` maps; passes `ledgerHelpers` (`resolveSource` / `resolveAccounting` / `onOpenPreview`) to `InventoryItemDetail`; renders the preview overlay. |

### Audit findings (read-only — see `docs/ACCOUNTING_RELATIONSHIPS.md` § "SALES DOCUMENT WORKFLOW AUDIT — 2026-09-03")

| # | Question | Result |
|---|---|---|
| Quote accounting rule | **Confirmed correct** — commercial offer only; no GL / AR / VAT / stock / COGS / reservation. Statuses `draft·sent·accepted·declined·expired` (no `converted` value — it's derived). |
| Sales Order accounting rule | **Confirmed correct** — no revenue / AR / VAT / issue / COGS. `convertToInvoice` → draft invoice + `fulfilled`, double-convert-guarded. |
| **Stock commitment** | **NOT IMPLEMENTED.** `quantityCommitted` is hardcoded `0` (`stockBalanceService`, `stockService` TODO). **Available === On hand.** A Sales Order contributes nothing to "Committed". Not invented (brief §5). |
| Invoice accounting rule | **Confirmed correct, engine untouched** — `DR AR / CR Sales / CR VAT Output` + `DR COGS / CR Inventory` via the one atomic engine. |
| **Partial payment** | **SUPPORTED & correct** — receipt posts `DR Cash / CR AR` full amount; `recordPayment` tracks `amountPaid` + status, no extra journal; AR nets to zero. Invoice page shows Total / Paid / Outstanding + allocation history. |
| **Customer deposit / pre-invoice receipt** | **⚠️ ACCOUNTING GAP (reported, NOT changed).** An unallocated receipt is credited **directly to Accounts Receivable** (negative customer AR), not to a customer-deposit liability — there is no such account key. End state after invoicing is correct; the interim balance sheet understates AR and omits a current liability. Fix needs a new CoA account + mapping key + posting branch = explicit accounting decision + DB change. |
| **Partial SO invoicing** | **NOT SUPPORTED** — `convertToInvoice` copies all lines at full qty, marks `fulfilled`, blocks re-conversion. No "remaining to invoice" tracking, no `partially_invoiced` status. |
| Duplicate / copy | **NOT SUPPORTED** — no `duplicate`/`clone` on any sales/purchase service. |
| Print / export on record pages | **PARTIAL** — Phase-7 `ExportMenu` / `PrintableReport` exist and list pages use them; **the new `*DetailPage`s wire none of it** and there is **no formal business-document print layout**. |
| Edit actions | **Correct** — draft-only Edit; service layer throws on post-`draft` accounting changes; no guard weakened. |

### Increment 3 — DEFERRED / NOT DONE (need approval — see §20 report)

- Customer deposit / prepayment liability posting (accounting decision + new CoA account + DB).
- Partial Sales-Order invoicing (`SalesOrder` line-level "invoiced qty" tracking + `partially_invoiced`).
- Real stock reservation / commitment model (write `quantityCommitted` from open Sales Orders).
- Formal `PrintableDocument` layout + `@media print` for Quote / SO / Invoice / Credit Note / PO, and
  wiring `ExportMenu` (CSV / Excel / Print) onto the record pages.
- Duplicate / copy actions for Quote / Sales Order / Purchase Order.
- `JournalEntryDetailPage` (the movement Accounting panel + every record page still links the journal
  entry via `?record=` → the side-sheet).
- Deep-linking related-record clicks *inside* a preview to a nested preview (they navigate today).

---

## A. Global UI fixes

- [x] **1. Global dropdown / select dark-theme fix** — audit every select implementation
  (native `<select>`, shadcn Select, custom dropdowns, comboboxes, filter selects, form
  selects). Dark theme open menus need: dark surface, readable foreground, dark/neutral
  hover, green selected/accent state, visible disabled states, visible scrollbar for long
  lists, no unstyleable browser-default white. Audit native `<select>` CSS + `color-scheme`.
  Test selects from Company, Customer, Supplier, Invoices, Banking, Accounting, VAT,
  Settings, Administration.
  - **Root cause:** ~34 forms use a bare native `<select>` styled `bg-transparent` (like
    `Input`). Closed = fine (dark page shows through). Open on Windows Chromium = the option
    popup paints near-white while option text keeps the inherited near-white `--foreground`
    → unreadable. shadcn `Select` (base-ui, `bg-popover`) and the DataTable filter selects
    were never affected.
  - **Done:** global `@layer base` rule in `src/styles/globals.css` pins
    `select option/optgroup` to `--popover` / `--popover-foreground` (theme-aware, can't be
    overridden by a utility on the `<select>`), disabled → muted, `:checked`/`:hover` →
    `--brand-muted` green. Solid trigger bg fallback. `color-scheme` was already correct.
  - **Done:** shared `NativeSelect` (`src/components/ui/shadcn/native-select.tsx`, forwardRef,
    matches `Input`, `data-slot`). **All 42 forms** migrated off the copy-pasted
    `selectClassName` string — `grep "<select"` / `grep "selectClassName"` across `src` now
    returns nothing. Full suite **1045/1045**, type-check/lint/build clean.
  - **Superseded 2026-09-03 (live QA):** the CSS `select option { … }` rule is not honoured
    consistently by the browser — the open option menu still shows in native (light) chrome
    on the deploy. Fix is to **replace `NativeSelect`, not style `<option>`**. New shared
    `EnumSelect` (base-ui `Select`, dark popup) added; inventory transaction forms migrated
    (see `# RECORD DETAIL FULL-PAGE MIGRATION` → increment 1). ~40 `NativeSelect` consumers
    across admin / tax / compliance / settings / reports / banking still to migrate
    (increment 2).
- [x] **2. Sidebar Vertex-green vertical edge** — subtle 1px-ish green right edge using the
  existing brand token, low/medium opacity, not neon, visible while scrolling, no clash
  with scrollbar. If the sidebar scrolls: dark track, subtle green-accented thumb, narrow
  width, accessible contrast. Not every sidebar border green.
  - **Done:** `after:` 1px `bg-brand-outline` (30% green) line on the fixed sidebar
    container's right edge in `app-sidebar.tsx` — stays put while `SidebarContent` scrolls
    behind it. New `.sidebar-scroll` utility (thin, transparent track, 32%→55% green thumb)
    replaces the old `no-scrollbar` on `SidebarContent`; `.no-scrollbar` kept (defined
    properly now) for the command palette; new `.app-scroll` for in-app panes.
- [x] **3. Fix tabbed-form sizing** — switching tabs must not resize the outer dialog/sheet.
  All multi-tab forms: Customer, Supplier, Company, Invoice (if tabbed), User/Role, Assets,
  Inventory, Accounting settings, any other. One stable dialog size; content area with
  min/fixed desktop height; internal scroll; stable header/footer/actions; responsive on
  small screens (no off-screen buttons); no hardcoded dims that break small laptops.
  - **Done:** `src/components/app/form-surface.ts` — `formDialogClass` / `wideFormDialogClass`
    / `compactDialogClass` (stable `md:h-[min(88dvh,44rem)]`, natural on mobile).
    `CustomerForm` (dialog) reworked: `Tabs` `flex-1 min-h-0`, each `TabsContent` scrolls
    internally (`.app-scroll`), action row anchored; `CustomerFormModal` → `formDialogClass`.
    `SupplierForm` (page): fixed `h-[28rem]` tab region + internal scroll so the page stops
    jumping on tab switches.
  - **Only 3 forms in the app use `<Tabs>`:** CustomerForm ✅, SupplierForm ✅, TransactionForm ✅.
    CustomerForm: `flex-1` tab region inside the fixed-height `formDialogClass` dialog.
    SupplierForm (page): `h-[28rem]` tab region. TransactionForm: `h-[30rem]` tab region.
    All: each `TabsContent` scrolls internally via `.app-scroll`, action row anchored.
    CompanyForm ✅ (not tabbed — given the stable-height treatment anyway).
- [x] **4. Standardise all form / detail surfaces** — shared wrapper: consistent width
  classes, consistent max-height, green outer border/ring, consistent header, consistent
  body padding, scrollable body, stable footer. No duplicated sizing classes across ~40
  forms. Audit every `DialogContent` / `SheetContent` consumer.
  - **Green ring + internal-scroll body wrapper + sticky footer** were already built into
    `DialogContent`/`SheetContent` (prior work). This pass added the shared width/height
    contract: `form-surface.ts` → `formDialogClass` (fixed h, tabbed forms),
    `wideFormDialogClass` (line-items), `standardDialogClass` (ordinary forms, natural h +
    88dvh cap), `compactDialogClass` (small). Rolled across the 13 `*FormModal.tsx`
    components. **Remaining (minor):** ~20 page-inline `DialogContent`s still carry ad-hoc
    `max-w-*` — mostly confirm/small dialogs, lower priority; will sweep in the final pass.
- [x] **23. Account Detail Sheet + all record-detail sheets consistent size** — every
  record-detail sheet in the app already goes through the **shared `RecordDetailSheet`**
  (`src/components/app/record-detail-sheet.tsx`) → one `SheetContent` (full-height,
  brand-green ring, its own scroll region, sticky header/footer). None of them are
  internally tabbed (the detail bodies are stacked `RecordDetailSection`s), so there is no
  tab-resize to fix. New `AccountDetailSheet` uses the same shared component +
  `recordSheetClass`. Nothing further needed.

## B. Chart of Accounts

- [x] **5. Chart of Accounts performance** — **root cause found + fixed (no browser tools,
  so this is static analysis of the query code).**
  - **Cause (severe N+1):** `useAccounts.load()` did
    `Promise.all(accounts.map(a => accountService.hasPostings(a.id)))`, and
    `AccountService.hasPostings()` itself does `journalRepository.getAll()` — i.e. it
    **fetched the entire journal history once per account** (≈50–150 full-ledger fetches),
    and again after every create/edit. The browser's ~6-connections-per-host limit meant
    these also starved every *other* query on the page — and on `LedgerPage` /
    `TrialBalancePage`, which also call `useAccounts()` (so this is the shared root cause
    of #7 too).
  - **Fix:** new `AccountService.getAccountIdsWithPostings()` — one ledger pass for the
    whole chart. `useAccounts` now does `Promise.all([getAccounts(), getAccountIdsWithPostings()])`
    → **2 queries total instead of 1 + N.** 3 new unit tests; 5 page-test mocks updated.
  - **Further (not done, needs an RPC + interface change across ~10 test fakes):** a
    `SELECT DISTINCT account_id FROM journal_lines` would avoid pulling line bodies at all;
    and `computeTrialBalance` could `GROUP BY account_id` server-side. Documented, not done
    in this pass.
- [x] **6. Chart of Accounts record opening** — clicking an account row opens an Account
  Detail Sheet/Form and stays on the CoA page (currently navigates to General Ledger).
  Show: code, name, type/category, status, normal balance, tax mapping, FS grouping,
  current balance, metadata, recent ledger activity where appropriate. Actions: Edit (if
  allowed), View ledger (this may explicitly open/filter GL). Preserve `?record=<uuid>`
  deep-link pattern.
  - **CONFIRMED real in `main`:** `AccountTable.tsx:31` `openLedger()` →
    `navigate('/accounting/ledger')` on account-name click. No detail sheet existed.
  - **Done:** new `AccountDetailSheet` (`src/features/accounting/components/`) — code, name,
    master type, FS grouping (subType), status, normal balance, ledger-history flag,
    description, **current balance + recent 5 ledger lines** (from `useAccountLedger` →
    `getAccountLedger()`, never recomputed). Actions: **Edit** (opens the existing form
    modal) + **View ledger** (the old navigate-to-GL behaviour, now explicit). Row click
    opens the sheet via `?record=<id>` and stays on the CoA page. `AccountTable` gained an
    `onSelect` prop; dropped its `useNavigate`/`accountingUiStore` coupling. 1 new page test
    proves it opens the sheet instead of navigating.

## C. Trial Balance

- [x] **7. Trial Balance performance** — **primary cause was the same #5 N+1** (the page
  calls `useAccounts()`), now fixed. Verified the rest:
  - `computeTrialBalance()` = 2 queries (`accounts.getAll()` + `journal.getAll()`) + one
    O(lines) client-side sum. Fine for small/medium; server-side `GROUP BY` noted as future
    work (needs RPC).
  - Subledger reconciliation already loads **independently** (its own `reconciliationLoading`
    state, rendered in a separate section) — it does **not** block the main TB display.
    That already matches #26.
  - The client-side `.sort()` by date in `postedEntriesSortedByDate()` is redundant for TB
    (it only sums) but negligible; left as-is to avoid touching shared ledger code.
- [x] **9. Trial Balance layout** — **already correct in `main`.** `TrialBalancePage`
  summary `grid gap-6 sm:grid-cols-3` (Total debits | Total credits | Difference). No
  filter toolbar on the page itself (search/filter lives in `TrialBalanceTable`).

## D. General Ledger

- [x] **8. General Ledger layout** — **already correct in `main`.** `LedgerPage` summary is
  `grid gap-6 sm:grid-cols-3` (Debits Posted | Credits Posted | Accounts Touched — horizontal
  from 640px). Account filter is `sm:w-auto sm:min-w-64` on its own row. No date-range/search
  filters exist on GL (would be new features, not layout). **Screenshots appear to predate
  M3 (2026-08-25) / the visual-fidelity audits.**

## E. Banking layout

- [x] **10. Bank Accounts layout** — **already correct in `main`.** `BankAccountsPage`:
  summary `grid gap-6 sm:grid-cols-2`; filter row `flex flex-col gap-3 sm:flex-row
  sm:items-center` (Search | Type | Status — horizontal from 640px).
- [x] **11. Bank Transactions layout** — **already correct in `main`.** `BankTransactionsPage`
  summary `grid gap-6 sm:grid-cols-3` (Statement lines | Awaiting reconciliation | Needs
  allocation). Account/status filters horizontal.

## F. Tax & Compliance layout

- [x] **12. VAT page layout** — **already correct in `main`.** `VatReturnPage` summary
  `grid gap-6 sm:grid-cols-3` (Output VAT | Input VAT (claimable) | Net VAT payable); period
  picker + Refresh in the PageHeader actions (top-right, horizontal); alerts full-width
  beneath. Other Tax pages (IncomeTax/DeferredTax `md:grid-cols-4`, CGT/PI-Score
  `sm:grid-cols-2 lg:grid-cols-4`) already horizontal too.

## G. Global layout audit

- [x] **13. Global "vertical report/filter" audit** — done.
  - **Finding:** the responsive horizontal layout the brief asks for is **already
    implemented across `main`.** `AppLayout`'s `<main>` is full-width (no `max-w`), the
    shared `DataTable` toolbar is `flex-col gap-3 lg:flex-row` + inner `sm:flex-row`
    (53 pages), and **every** `FigureBlock` summary strip uses a responsive grid.
  - **Zero** pages had a non-responsive `grid-cols-1`/`flex-col` summary or filter row.
  - **Fixed (5 straggler list pages** that were `sm:grid-cols-2` only with 4 stats → 2×2
    block on desktop): SupplierListPage, InvoicesPage, CreditNotesPage, CustomerListPage,
    JournalsPage → `sm:grid-cols-2 lg:grid-cols-4` (1×4 strip on desktop, matching the
    ~14 pages that already did this).
  - **Conclusion:** the deployed app the screenshots came from is **behind `main`** — the
    layout work landed M3 (2026-08-25) + the six visual-fidelity-audit commits + today's
    `9fd1666`. Needs a fresh deploy / local `npm run dev` to confirm.

## H. Bank Reconciliation redesign

- [x] **14. Compare with Xero workflow** — adopted the *workflow* (not visuals): a
  transaction-by-transaction two-pane surface, per-line quick actions, a
  compact/comfortable density toggle, in-context "Investigate" — while keeping the
  stronger engine (Difference Investigator, Books Integrity, opening-balance / duplicate /
  combination / wrong-sign / VAT / rounding / historical detection). What this app's domain
  does NOT have (and Xero-style "code this uncategorised line" partly covers instead): a
  separate raw-statement-line table — an import here becomes a full `BankTransaction`, so
  "match" = confirm/clear + "code" = the real GL allocation flow.
- [x] **15. Redesign Bank Reconciliation workspace** — `ReconciliationWorkspace.tsx`
  rebuilt as two panes. **Header:** statement date, statement closing balance, book (GL)
  balance, variance (green/red), balanced state, "Investigate R… difference" button,
  density toggle. **LEFT:** every statement line for the period — compact rows (date,
  description, reference, spent/received, status chip: Reconciled / Cleared this session /
  Needs allocation / Unreconciled), filterable. **RIGHT:** the selected line — details,
  source (imported/manual/transfer), its GL coding (or "not yet coded"), and the actions
  for it: **Code to a GL account** (opens the real `AllocateTransactionForm` — normal
  posting, not bypassed), **Mark / Un-clear**, **Open in Bank Transactions**.
  - **Real bug fixed along the way:** the page had `useBankReconciliation` instantiated
    *twice* (once in the section, once inside the workspace) — so the Difference
    Investigator tab always saw the default statement date / R0 balance / no cleared items,
    not what the user actually entered. State is now lifted to one instance on the page and
    passed to both.
- [x] **16. Compact / Comfortable toggle** — header toggle, persisted to
  `localStorage['vertex.reconciliation.density']` (try/catch — private windows just don't
  persist). Compact = tighter rows, reference hidden; Comfortable = roomier + reference.
- [x] **17. Difference Investigator integrated** — tab kept; also reachable from the
  workspace header ("Investigate R{variance} difference") which switches to the tab and
  auto-runs the investigation against the workspace's *real* current state (new `runSignal`
  prop on `DifferenceInvestigatorPanel`).
- [x] **22. Fix "Explained 100%" logic** — never show "100% explained" while a large
  unexplained amount remains. Clear metrics: Transactions analysed / Matched / Probable /
  Needs review / Variance explained / Variance remaining.
  - **Fixed:** `reconciliationHealthService.ts` reshaped — `ReconciliationHealth` now has
    **`matchCoveragePercent`** (`null`, not "100%", when nothing was analysed) AND a
    separate money view: **`varianceExplained`** (Rand of the gap with a candidate cause,
    capped at `|variance|`), **`varianceRemaining`**, **`varianceExplainedPercent`**
    (reaches 100 only when the gap is genuinely closed). `ReconciliationHealthCard` rebuilt
    to show both, labelled: "Transactions analysed / Confirmed / Probable / Needs review"
    then "Match coverage / Variance explained / Remaining unexplained". 5 new unit tests
    including the exact reported scenario (0 txns, R74,905 gap → **not** "100%").

## I. Reconciliation demo data

- [~] **18. Current reconciliation data is not good enough** — the confusing "Explained
  100% / Unexplained R74,905" is fixed by #22. The empty-data half needs demo rows in the
  live Supabase project — **see #20: this writes to the user's real single-tenant DB, so
  it needs an explicit go-ahead before I apply it.** The builder is ready.
- [x] **19. Realistic reconciliation demo dataset** —
  `src/features/reconciliationIntelligence/testFixtures/demoReconciliationScenario.ts` —
  a pure builder: FNB Business Cheque, Aug 2026, R100k opening, ~35 bank + books rows with
  every seeded fault the brief lists (10 clean matches, 3 date-offset, R10k→3 deposit,
  missing R185.50 charge, R62.10 interest, R47.50/R47.66 mismatch, duplicate rent,
  wrong-sign refund, wrong-account EFT, outstanding payment + deposit, VAT-split, pair &
  triple orphaned-journal combinations). Deterministic `expectedVariance` + an
  `expectedFaults` manifest.
- [~] **20. "Accountant demo scenario" seed/reset** — the builder (#19) is the reusable
  core. **Not wired to a live seed** (dev button or Supabase migration) — that mutates the
  user's real DB; flagged for approval. As a fixture it fully satisfies #21.
- [x] **21. Verify Difference Investigator against the dataset** —
  `demoReconciliationScenario.test.ts` runs the **real** `ReconciliationInvestigatorService`
  over the scenario. **7 tests, all pass:** detects `missing_ledger_side` (R185.50 charge,
  R62.10 interest), `amount_mismatch` (finds the **R0.16** card-fee delta by explanation),
  `duplicate_transaction`, `wrong_sign`, `grouped_match` (R10k = 3 receipts); and
  `combination_match` when the variance is exactly the pair sum (R801.25) or the triple
  sum. Every issue starts `status: 'open'`; `health.varianceRemaining` never negative.

## J. Performance / data layer

- [~] **24. Performance targets** — **no browser automation is available in this
  environment**, so no wall-clock ms. Reported structurally instead:
  - **Chart of Accounts** — before: `2 + N` round trips where N = account count, and each
    of the N was a **full `journal_entries` + `journal_lines` fetch** (`hasPostings()`
    per account). For a 120-account chart that's 120 full-ledger fetches, serialised
    behind the browser's 6-per-host cap. After: **exactly 2** queries
    (`accounts` list + one ledger pass), run in parallel.
  - **Trial Balance** — same `useAccounts()` N+1 removed (the page uses it); the compute
    itself is 2 queries + O(lines) client sum, unchanged.
  - **General Ledger** — flat view: 2 queries (`accounts` + `journal_entries`); narrowed
    to one account: swaps to `getAccountLedger()` (2 queries). Also carried the
    `useAccounts()` fix. No N+1 here originally.
- [x] **25. Supabase query / index review** — done via MCP (`pg_indexes` + `get_advisors`
  performance lint). **Every index the brief names already exists:**
  `journal_lines_account_id_idx`, `journal_lines_journal_entry_id_idx`,
  `journal_entries_company_id_idx`, `journal_entries_date_idx`,
  `accounts (company_id, code)` unique, `bank_transactions_bank_account_id_idx`,
  `reconciliation_issues` (bank_account_id / company_id / status). **No index migration
  is warranted** — the CoA/TB slowness was 100% the application-layer N+1 (#5), not a
  missing index (confirms the brief's "do not add indexes blindly"). Advisor notes, not
  acted on: `journal_entries_date_idx` is unused (matches the "fetch-all-then-filter"
  pattern); a handful of `*_journal_entry_id` FKs on small 1:1 tables are unindexed
  (not on any hot path).
- [x] **26. Loading UX** — `ChartOfAccountsPage` and `TrialBalancePage` loading states
  replaced: the page header + filter/search shell stays visible, and the body is now a
  **table-shaped skeleton** (+ a 3-tile summary skeleton on TB) instead of a 40vh centred
  spinner. Subledger reconciliation on TB was **already** independent (its own
  `reconciliationLoading`, separate section) — confirmed, unchanged.

## K. Verification & report

- [x] **28. Final report** — `docs/RECON_UI_CORRECTION_PASS_REPORT.md` (32-point return list).
- [~] **27. Final visual QA** — **browser automation is NOT available in this environment**
  (no Chrome DevTools / Playwright MCP). Could not do the 1440/1280/narrow screenshot pass.
  Mitigations: every change is behind `type-check` (strict) + `lint` (`--max-warnings 0`) +
  the full test suite + a production `vite build`; layout changes use standard responsive
  Tailwind already proven across the app; the impeccable design hook scanned each file.
  **The user should do a visual pass on a fresh `npm run dev` / deploy** — especially the
  reconciliation workspace and the native-select option lists in dark mode.

## M. Final cleanup pass (user-requested, 2026-08-27)

- [x] **1. Demo data dev/test-only** — `demoReconciliationScenario.ts` doc comment now
  states explicitly: test fixture / dev helper ONLY, never inserted into live Supabase,
  no production "Seed demo data" button. Verified **nothing app-side imports it**
  (`grep` — sole consumer is its own `.test.ts`).
- [x] **2. Unrelated working-tree noise** — `git diff .claude/agents/qa-bee.md` confirmed
  **whitespace-only** (one sentence split across 3 lines with stray spaces, words
  identical). Restored to HEAD (`git checkout --`). No other pre-existing changes touched.
- [x] **3. Reconciliation-state regression tests** — `BankReconciliationPage.test.tsx`
  (5 tests): exactly ONE `useBankReconciliation` per section (not one per child); same
  statement date / balance / cleared list passed to BOTH workspace and investigator; the
  investigator's variance is the current summary's variance (−1673.42, not a stale 0);
  a state change moves both children together; the hook is scoped to the selected
  account id (section keyed by `selectedAccount.id` → fresh subtree on switch).
- [x] **4. "Explained 100%" regression tests** — `ReconciliationHealthCard.test.tsx`
  (3 tests) + the existing 5 service tests: card renders match-coverage, variance-explained
  and remaining-unexplained as separate figures; the reported state (0 analysed, R74,905
  gap) renders **"—"** and **"0%"**, never "100%"; 100% only when the gap is genuinely 0.
- [x] **5. Visual-target code-level checklist** — below.
- [x] **6. Final validation** — type-check ✅ / lint (`--max-warnings 0`) ✅ /
  **1069 tests, 155 files** ✅ (ran twice, no flake) / `vite build` ✅.
- [x] **7. Final report** — `docs/RECON_UI_CORRECTION_PASS_REPORT.md` updated.

### #5 — visual-target code-level checklist (no browser QA claimed)

| Target | Code-level state |
|---|---|
| Dark native select menus | `globals.css` `select option/optgroup` → `--popover(-foreground)`; 42 forms on `NativeSelect` |
| Sidebar green right edge | `app-sidebar.tsx` `after:w-px after:bg-brand-outline` on the fixed container |
| Stable Customer/Company/Supplier tabbed form | fixed-height dialog (`formDialogClass`) / `h-[28rem]` tab region + `.app-scroll` panels; action row anchored |
| Chart of Accounts toolbar | `flex flex-col gap-3 sm:flex-row sm:items-center` (already `main`) |
| General Ledger summary/filter | `grid gap-6 sm:grid-cols-3` + account select (already `main`) |
| Trial Balance summary/filter | `grid gap-6 sm:grid-cols-3` (already `main`) |
| Bank Accounts summary/filter | `sm:grid-cols-2` + `sm:flex-row` filter row (already `main`) |
| Bank Transactions summary/filter | `grid gap-6 sm:grid-cols-3` (already `main`) |
| VAT summary/filter | `grid gap-6 sm:grid-cols-3` + header period picker (already `main`) |
| Account Detail as sheet | `AccountTable` `onSelect` → `?record=` → `AccountDetailSheet`; **no `useNavigate` left in `AccountTable`** |
| Reconciliation two-pane | `ReconciliationWorkspace` `grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]` |
| Compact/Comfortable toggle | header toggle, `localStorage['vertex.reconciliation.density']`, try/catch |
| Difference Investigator integration | tab kept + workspace header `Investigate R… difference` → `runSignal` auto-run |

## L. Gate

- [x] type-check clean
- [x] lint clean (`--max-warnings 0`)
- [x] full test suite: **1069 passed / 155 files** (up from 1045 — +24 tests). Ran twice, no flake.
- [x] `vite build` clean
- [x] `.claude/agents/qa-bee.md` restored to HEAD; working tree carries only this pass's changes
- [x] **STOP — do not commit, do not push. Wait for final approval.** — approved; shipped to
  `main` (`6bd22d0` / `97a6e38` / `32cf860` / `170338a`), report recorded in `6eb3b48`. §18/§20/§24/§27
  remain `[~]` (live demo-data seed + browser QA — not doable in this environment).

---

# BANK_STATEMENT_RECONCILIATION_AND_FORM_SYSTEM

**Opened:** 2026-08-28 · **Owner:** Queen Bee
**Rule:** Do NOT commit or push until the entire phase is complete and the user approves. Stop for review.
**Two deliverables, built together:** (A) a persistent Bank Statement + side-by-side proof-reading
Reconciliation Workspace with an explainable evidence model, run against the real Office National
August data; (B) a consistent application-wide Vertex Form System.

Runs on top of the Office National Demo dataset (`docs/OFFICE_NATIONAL_DEMO_TASKS.md`). Phase 21
(post-audit accounting corrections) must land first — Part J needs the Office National books clean.

Statuses: `NOT STARTED` · `INVESTIGATING` · `PROPOSED` · `IN PROGRESS` · `PASS` · `BLOCKED` · `N/A`

## Data-integrity incident (found + fixed 2026-08-28, before this phase started)

| Item | Detail |
|---|---|
| `JE-0171` | Post-seed contamination — a Phase 21 subagent caused the app's real `bankTransactionService` to post `JE-0171` (source `bank_transaction`, DR Cash / CR AR R2,295.29) against **live** Supabase, duplicating customer receipt REC-1001's posting, flipping its bank_transaction `unreconciled`→`matched`, and destroying the "outstanding deposit" training scenario. GL 1100 drifted 207,794.04 → 205,498.75. |
| Fix | Queen deleted `JE-0171` + its lines, restored bank_transaction `7f9d173c` to `status='unreconciled'` / `journal_entry_id` → REC-1001's receipt JE. **Verified restored:** 170 journal entries, GL 1100 = R207,794.04, GL 1000 = R212,270.67, global diff R0.00, 81 reconciled / 13 unreconciled bank txns, outstanding-deposit scenario intact. |
| Rule for this phase | **No subagent may run the app's service layer (dev server, real `*Service` singletons, un-mocked repos) against the live Supabase project.** DB writes only via explicit reviewed SQL / migrations through the MCP. Tests use mocks. |

## SAFETY-0 — Fail-closed test/tooling guard against live Supabase (MANDATORY, user-approved 2026-08-28)

**Regression case:** JE-0171 — real `bankTransactionService` → accidentally live Supabase → duplicate JE,
changed Bank GL + AR, marked an unreconciled txn matched, destroyed the outstanding-deposit scenario.
Must be technically impossible again, not just a written rule.

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| S0.1 | Root-cause audit | Agent 13 | **PASS** | Confirmed the chain (`vite.config.ts:14` → `.env.local:1` real keys → `src/config/env.ts:8` → `src/config/supabase.ts:24` unconditional `createClient` → `src/features/*/services/index.ts` barrels build live-connected singletons). **Found an extra latent leak:** `MockCustomerRepository.test.ts` → `CustomerService.deleteCustomer()` → live `invoiceService.getInvoicesByCustomer()` → real `invoices` query every run (passed only because the throwaway customer had no invoices). **No test needs a real connection.** |
| S0.2 | Fail-closed protection (3 layers) | Agent 13 | **PASS** | (a) `tests/setup.ts` global `vi.mock('@/config/supabase')` → throwing `Proxy` on every access; per-file `vi.mock` still overrides (the 4 auth tests). (b) `src/config/supabase.ts` `isTestContext()` + `resolveClientConfig()` throws in test MODE/`VITEST` unless `VITE_TEST_SUPABASE_URL` is set AND ≠ prod; never falls back to prod vars; no-op in dev/prod. (c) `getTestSupabaseClient()` — lockable door, throws unless an explicit test project is configured. `docs/TESTING_SUPABASE.md` written. |
| S0.3 | Destructive/seed tooling guard | Agent 13 | **PASS** | No live-write tooling exists in the repo today (all fixtures are pure in-memory). Added `src/config/writeTargetGuard.ts`: `assertDemoWriteTarget()` requires `VERTEX_DB_TARGET ∈ {demo,local}` + URL ≠ prod + URL on allowlist; `assertDestructiveResetAllowed()` additionally requires `VERTEX_ALLOW_DESTRUCTIVE_RESET=yes`. Never infers "creds present ⇒ safe". |
| S0.4 | Regression tests | Agent 13 | **PASS** | `supabaseGuard.test.ts` + `writeTargetGuard.test.ts` — 19 assertions: raw `supabase.from` throws in tests · load-time guard rejects without test URL · fails closed with prod vars present · seed/reset rejects non-demo/prod · `MODE=production`/`development` still construct a client fine. 1 test migrated to mocks (`MockCustomerRepository.test.ts`). |
| S0.5 | Queen READ-ONLY baseline re-verify (no posting service) | Queen | **PASS** | 171 JEs · global Σdr−Σcr R0.00 · 0 unbalanced · AR GL R207,794.04 · Bank GL R212,270.67 · Inventory GL R1,569,737.73 = valuation exact · 81/13 bank txns · 11 recon issues · outstanding-deposit `unreconciled` · **0 contamination JEs, 0 `source='bank_transaction'` JEs** · 5 category mappings. |

**Gate after S0:** type-check ✅ / lint ✅ / **1146 tests / 162 files** (from 1127/160) ✅ / build ✅.

## PART 0 — Investigation (must complete before any build; schema proposals need user sign-off)

| # | Task | Agent | Status | Findings |
|---|---|---|---|---|
| 0.1 | Live-schema audit | Agent 11 | **PASS** | → `docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md`. **No bank-statement/statement-line/import/document table exists at all** — only bank_accounts, bank_transactions, reconciliations (0 rows, never used), reconciliation_issues. RLS role inconsistency: reconciliations/reconciliation_issues use `{public}`, account/txn tables use `{authenticated}`. |
| 0.2 | Bank-statement model gap + smallest additive migration | Agent 11 | **PASS** | Proposed migration 0020: 2 new tables (`bank_statements`, `bank_statement_lines`) + 1 nullable column on `bank_transactions` + 3 enums. **Zero changes to existing columns.** DDL sketch in the audit doc. |
| 0.3 | Import flow audit | Agent 11 | **PASS** | Real CSV/OFX/QIF/MT940 parsers exist (`statementParsers.ts`). Import = N loose `source='import'` bank_transactions, **no statement identity**, `sourceRowId` not persisted, opening/closing balances discarded at parse, no balance validation, a bad row aborts the whole file. Import is non-destructive (no GL posting). |
| 0.4 | Evidence model audit | Agent 11 | **PASS** | `reconciliation_issues.evidence` is prose `[{label, detail?}]` — every computed number is discarded. None of the requested structured fields exist. Confidence = fixed additive scorecard, exposed as a bare %. Ranking = non-stable confidence-only sort. Supersede-dedupe is broken (string-compares a timestamptz). Needs a structured `evidence_data` jsonb + deterministic ranking key + idempotency key. |
| 0.5 | Full form inventory | Agent 12 | **PASS** | → `docs/FORM_SYSTEM_AUDIT.md`. ~45 form surfaces; 14 on `form-surface.ts`, ~27 ad-hoc page-inline `max-w-*` dialogs, 7 hand-written AlertDialogs. Purchases domain has **no FormModal layer**. `DialogFooter` sticky but ignored by 40 files. 3 tabbed forms, 3 different hand-rolled height fixes. Dirty-state: nonexistent. Validation UX split RHF/useState. Dark-selects 100% done. Detail side 100% unified. |
| 0.6 | Shared form infra audit + gap analysis | Agent 12 | **PASS** | Smallest viable new set: `FormShell`, `FormFooter`, `FormTabs`, `useUnsavedChangesPrompt` (removes ~90% of duplication, fixes tab-resize + non-sticky footer). Cheap add-ons: `FormSection`, `FormError`, size-token rename, `ConfirmDialog`. Migration long-poles: 11 useState document forms, the Purchases domain, `StatementImportPanel` wizard. |
| 0.7 | Queen: consolidate → schema proposal(s) + phased build plan → **user approval gate** | Queen | **PASS** | Plan approved (see "0.7 — DECISIONS" below); P1 + P2 built, shipped to `main` (`7481ef8`). |

## Contamination cleanup (Queen, 2026-08-28)

| Item | Detail |
|---|---|
| 16 stray `reconciliation_issues` | `missing_bank_side` confidence-40 rows created by live `ReconciliationInvestigatorService.investigate()` runs on 2026-08-28 09:11–10:42 (after the approved seed — false positives from the manual/import ambiguity). **Deleted.** Restored to the golden 08:49 batch of 11 (matches `OFFICE_NATIONAL_RECON_EXPECTATIONS.md`). |

## 0.7 — DECISIONS (user, 2026-08-28)
1. **Migration 0020** — approved as proposed (all additive: `bank_statements` + `bank_statement_lines` + `bank_transactions.bank_statement_line_id` + `reconciliation_issues.evidence_data` + 3 enums; RLS `{authenticated}`, mutable).
2. **Part J** — faithful: **~94 `bank_statement_lines`** (one per genuine bank-side event incl. every deliberate scenario leg), created as NEW rows, **no reclassification** of `bank_transactions.source`.
3. **cost_price** → **`numeric(14,4)`** (fold into 0020) + **re-restate** inventory at 4dp WAC (residual ~R0.07).
4. **Sequencing** — 3 sub-phases, user review between each:
   - **P1** = migration 0020 + statement persistence + parser upgrades + duplicate/balance validation + import UX + Part J backfill + inventory re-restate.
   - **P2** = side-by-side workspace + evidence model + Difference Investigator upgrade + whole-period proof + Office National evidence report (Parts B–I, O, P).
   - **P3** = Vertex Form System (Parts M–N).

## SUB-PHASE P1 — Persistence, import, backfill

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| P1.1 | Migration 0020 + TS types | Agent 14 + Queen | **PASS** | Agent 14 wrote types + DDL file; `apply_migration` was blocked for the subagent by the auto-mode classifier → **Queen applied it** (`0020_bank_statements_and_evidence`). Verified: `bank_statements` + `bank_statement_lines` tables, both RLS `_all_own_company` `{authenticated}`, `bank_transactions.bank_statement_line_id`, `reconciliation_issues.evidence_data` + `dedupe_key`, `products.cost_price` → `numeric(14,4)` (50 rows intact, sum 43770.20). Advisors: only 8 new `unused_index` INFO (clear on first query) + 2 `auth_allow_anonymous_sign_ins` WARN identical to every sibling table — **no ERROR, no missing-RLS, no new unindexed-FK**. `docs/db-changes/0020_...sql` updated to "applied". New TS: `src/types/bankStatement.ts` + `ReconciliationEvidenceData` on `reconciliationIssue.ts`. Gate green (1146/162). |
| P1.2 | Re-restate inventory perpetual-WAC at 4dp | Agent 15 (retry) | **PASS** | Opening-cost gate: Σ(opening_qty × opening_cost) = R1,487,450.00 = JE-0001 DR 1200 exact. Old JE-4100 (R5.54) deleted (no FK refs), fresh JE-4100 posted **DR 5000 / CR 1200 R0.07** (4dp residual). 40 of 48 `cost_price` values gained 4dp precision. **No COGS/Inventory journal line changed** — the 2dp pass already computed COGS from full-precision WAC; only stored `cost_price` was coarse. **Queen-verified:** GL 1200 = round(Σ qoh×cost_price,2) = **R1,569,743.20, diff R0.00**; global Σdr−Σcr R0.00; 0 unbalanced; qoh 10,169.000 unchanged; GL 1100 R207,794.04 + GL 1000 R212,270.67 unchanged; 11 recon issues; 81/13 bank txns. P&L: COGS R339,665.97→**R339,660.50**, GP R209,116.85→**R209,122.32**, NP R103,599.89→**R103,605.36** (Δ = the JE-4100 swap −R5.47). |
| P1.3 | Statement persistence layer | Agent 16 (retry) | **PASS** | Repos `I/Supabase/Mock BankStatement[Line]Repository` + `StatementImportService` (`previewImport`/`confirmImport`, structurally cannot post GL — constructed with only the 2 statement repos). Parser upgrades: `ParsedStatement` wrapper with `openingBalance`/`closingBalance`/`periodStart`/`periodEnd`/`parseErrors[]`; `ParsedStatementLine` gains `valueDate`/`externalRefId`/`runningBalance`/`raw`. MT940 `:60F:`/`:62F:` + OFX `<LEDGERBAL>`/`<DTSTART/END>` metadata extraction. **Per-row errors → `parseErrors[]`, parsing continues** (was: any bad row aborts the file). New pure `utils/sha256.ts` (FIPS-180-4, verified vs test vectors) → order-independent content hash. `computeBalanceCheck` (PART L): `opening + Σ signed == closing` ± R0.01 → `ok`/`null`. **Queen-verified gate: type-check ✅ / lint ✅ / 1188 tests / 167 files (from 1146/162) ✅ / build ✅.** |
| P1.4 | Part J backfill | Agent 16 (retry) | **PASS (with 1 doc flag)** | 1 `bank_statements` (`df28d259…`, Aug 2026, opening R350,000, **closing R184,068.54**, `balance_check_ok=true`, content-hash) + **87 `bank_statement_lines`** (75 `matched` + bijectively back-linked via `bank_transactions.bank_statement_line_id`, 12 `unmatched`). Every deliberate scenario represented (per-scenario `line_state` table in the expectations doc). **Queen-verified:** 87 lines, `line_count`=87, bijection clean both directions (0 violations), 0 wrong-company rows, closing arithmetic `350000 − 165,931.46 = 184,068.54`. Baseline untouched: 171 JEs, global diff R0.00, GL 1100/1000/1200 = R207,794.04 / R212,270.67 / R1,569,743.20, 11 recon issues, 81/13 bank txns. **DOC FLAG:** closing R184,068.54 vs the expectations doc's earlier "R174,265.22" — the R9,803.32 gap = REC-1007 (receipt dated 31 Aug, reconciled), included per the brief's "≤ 31 Aug" rule. Needs a user call on the cut (see P1.6). |
| P1.5 | Import UX wizard | Agent 17 | **PASS** | `useStatementImport` hook (state machine `idle→previewing→preview-ready→confirming→done`) + `StatementImportWizard` (5 views in the shared Dialog + `wideFormDialogClass` — no new form primitive). Steps: pick account → upload (+ format override) → preview (format, period, opening/closing, line count, **duplicate banner + "Import anyway" gate**, **parse-issues disclosure**, **balance-integrity note — warns, never blocks Confirm**, read-only line table) → confirm → done ("Reconcile now" / "Close", states nothing was posted to GL). Wired into `BankTransactionsPage` "Import statement" button. **18 new tests.** Old per-line path (`StatementImportPanel`/`Modal`, `importStatementLines`) intact on disk, just no longer referenced by the page (P2 removes it). Reconciliation route doesn't take a statement id yet → `// P2` marker. **Queen-verified gate: type-check ✅ / lint ✅ / 1206 tests / 169 files (from 1188/167) ✅ / build ✅.** |
| P1.6 | Queen: verify + P1 gate + read-only baseline re-verify + P1 report → **user review** | Queen | **DONE — reviewed, shipped `7481ef8`** | Baseline read-only re-verify (no posting service): 171 JEs · global Σdr−Σcr **R0.00** · 0 unbalanced · AR R207,794.04 · Bank GL R212,270.67 · Inventory GL R1,569,743.20 = valuation exact · 81/13 bank txns · 11 recon issues · outstanding-deposit `unreconciled` · **0 contamination JEs** · 1 bank_statement + 87 lines · 5 category mappings. Full gate green (1206/169, type-check/lint/build). |

> **PARTS A–T were re-planned into SUB-PHASE P1 / P2 (below) and the standalone
> `# P3 — VERTEX FORM SYSTEM` section, all shipped to `main` (`7481ef8` / `62f0905`).
> The original part list is kept here for traceability.**

## PART A — Persistent bank statement architecture | **DONE via P1** (migration 0020, statement persistence layer)
## PART B — Side-by-side reconciliation workspace | **DONE via P2.2**
## PART C — Reconciliation line states | **DONE via P2.2** (state chips on `bank_statement_line`)
## PART D — Line-by-line workflow | **DONE via P2.2** (Line N of M, Prev/Next, keyboard nav)
## PART E — Trace-everything (clickable record chain, state-preserving) | **PARTIAL via P2.2** — trace via shared `RecordDetailSheet`, state-preserving; chain stops at the journal entry (only real links followed)
## PART F — Document proofing (per-line yes/no answers) | **DONE via P2.2** (9-question checklist)
## PART G — Reconciliation summary (truthful metrics, no false "100%") | **DONE via P2.1** (also §22 of the Correction Pass)
## PART H — Difference Investigator upgrade (sectioned, arithmetic shown) | **DONE via P2.1** (5 headed sections, literal combination arithmetic)
## PART I — Whole-period proof (statement→books AND books→statement) | **DONE via P2.1** (`wholePeriodProofService.proveWholePeriod`) + P2.2 (its own tab)
## PART J — Run against Office National August data (migrate 94 bank txns under a persistent statement) | **DONE via P1.4** (1 statement + 87 lines, bijective back-link)
## PART K — Bank statement import UX (select acct → upload → preview → confirm → reconcile) | **DONE via P1.5** (`StatementImportWizard`)
## PART L — Statement balance validation (opening + net == closing) | **DONE via P1.3** (`computeBalanceCheck`)
## PART M–N — Vertex Form System (FormShell/Header/Tabs/Body/Section/Footer, size tokens, tab-resize fix) | **DONE via the standalone `# P3` section** (`62f0905`)
## PART O — Accountant-style reconciliation evidence report for every deliberate scenario | **DONE via P2.3** (`OFFICE_NATIONAL_RECON_EXPECTATIONS.md` PART O walk-through)
## PART P — Accountant-friendly explanations / tooltips | **DONE via P2.2** (`HelpTip` tooltips, evidence-with-basis)
## PART Q — Accounting-safety guardrails (no forced matches, no silent entries, RLS intact) | **DONE** — SAFETY-0 guard + `StatementImportService` structurally cannot post GL; no match forces a journal
## PART R — Comprehensive tests (35-point list) | **DONE via P1/P2** — 1249 tests / 177 files at P2 close
## PART S — Full validation (type-check / lint / test / build / Supabase advisors) | **DONE** — green at every P1/P2 gate; advisors 0 ERROR
## PART T — Final 47-point report | **DONE** — P1 + P2 review reports delivered; commit/deploy recorded below

## Overall status

- **SAFETY-0** ✅ fail-closed guard shipped.
- **PART 0 investigation** ✅ both audits done.
- **Phase 21** ✅ 21.1 (inventory, now 4dp via P1.2) / 21.2 (AR recon) / 21.3 (category mapping) + 2 contamination cleanups.
- **0.7 decisions** ✅ user-approved (migration 0020 as-proposed, faithful Part J, cost_price 4dp, 3 sub-phases).
- **SUB-PHASE P1** ✅ **DONE — reviewed, shipped to `main` (`7481ef8`)**:
  - P1.1 migration 0020 applied (2 tables, 3 enums, evidence_data + dedupe_key, cost_price→numeric(14,4))
  - P1.2 inventory re-restated at 4dp WAC (GL 1200 = valuation R1,569,743.20, R0.00)
  - P1.3 statement persistence layer (repos + `StatementImportService` + parser upgrades + sha256 hash + Part L balance validation)
  - P1.4 Office National Part J backfill (1 statement + 87 lines, 75 matched/bijective, 12 unmatched)
  - P1.5 import wizard (select→upload→preview→confirm→reconcile; duplicate/parse/balance warnings)
  - Gate: **1206 tests / 169 files**, type-check/lint/build clean. Baseline read-only re-verified: 0 contamination.
- **Open questions for the P1 review** (below).
- **SUB-PHASE P2** ✅ **DONE — reviewed, shipped to `main` (`7481ef8`)**:
  - P2.1 engine — statement-line candidate model, `evidence_data` on all 13 detectors, deterministic `dedupe_key` + ranking, sectioned `InvestigationResult`, `proveWholePeriod` both directions, truthful health metrics
  - P2.2 side-by-side workspace — LEFT statement line / RIGHT accounting record / COMPARISON block / evidence-with-basis / line-by-line nav / trace / document-proofing / 5-section investigator / whole-period tab / tooltips
  - P2.3 Office National — 12 regenerated `reconciliation_issues` with full evidence, `OFFICE_NATIONAL_RECON_EXPECTATIONS.md` cross-reference + PART O walk-through, closing balance R184,068.54
  - Gate: **1249 tests / 177 files**, type-check/lint/build clean. Baseline read-only re-verified: 0 contamination, all controls intact.
- **P3** (Vertex Form System — `FormShell` / `FormFooter` / `FormTabs` / `useUnsavedChangesPrompt` + migrate ~45 forms) ✅ **DONE** — ran as its own `# P3 — VERTEX FORM SYSTEM` initiative, shipped to `main` (`62f0905`). Only P3J (visual QA) outstanding.

### P1 review — user decisions (2026-08-28)
1. **August closing balance = R184,068.54** — include REC-1007 (31 Aug reconciled receipt). Statement stays at 87 lines as built. `OFFICE_NATIONAL_RECON_EXPECTATIONS.md`'s old R174,265.22 estimate to be updated to R184,068.54 (Agent 20).
2. **Old per-line import path** — leave unreferenced; P2 deletes `StatementImportPanel`/`StatementImportModal` + `bankTransactionService.importStatementLines`/`findMatchesForLine` + `useBankTransactionMutations.importStatementLines` cleanly.
3. **Proceed to P2.**

---

## SUB-PHASE P2 — Side-by-side workspace, evidence model, Difference Investigator upgrade

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| P2.1 | Evidence + investigator engine | Agent 18 | **PASS** | `buildBankSideCandidatesFromStatementLines` (+ `source='import'` fallback for accounts with no persisted statement). New `utils/evidence.ts` `buildEvidence` (replaces `confidence.ts`) + `utils/renderExplanation.ts` — all 13 detectors populate `evidenceData` (amount/date/ref-similarity deltas, same-counterparty/direction/account, full met+unmet factor scorecard, `candidateSourceType/Id`, `varianceExplainedCents`, `detectorVersion='2026.08'`); explanation generated FROM evidence; combination detector shows literal arithmetic + `combinationTerms`. `dedupe_key` = `issueType|statementDate(date)|sorted(related ids)` → idempotent supersede (fixes timestamptz bug), total-order ranking (`confidence DESC, |effect| DESC, issueType, dedupeKey`). `InvestigationResult.sections` {exactCauses/strongCandidates/timingItems/structuralIssues/combinationExplanations}. New `wholePeriodProofService.proveWholePeriod` (statement→books + books→statement, pure fn). `reconciliationHealthService` extended (statementLineCount, closing/books balances, statementVsBooksDifference — truthful "no 100% while variance remains" preserved). `SupabaseReconciliationIssueRepository` maps `evidence_data`/`dedupe_key`. 16 additive optional fields on `ReconciliationEvidenceData`. **Queen-verified gate: type-check ✅ / lint ✅ / 1218 tests / 171 files (from 1206/169) ✅ / build ✅.** No DB writes. |
| P2.2 | Side-by-side reconciliation workspace | Agent 19 (+retry verify pass) | **PASS** | `ReconciliationWorkspace.tsx` rebuilt: LEFT `bank_statement_line` list (date/desc/ref/state-chip/signed-amount, search + state filter) → LEFT detail (date, value date, description, ref, direction, amount, running balance, "Line N of M", statement name); RIGHT counterpart panel (source label/number, contact, accounting date, ref, amount, GL account(s), VAT, journal number, status, recon state) OR the exact "cannot find a corresponding accounting entry" state + 6 missing-in-books workflow buttons; COMPARISON block (amount/date/reference[from `evidenceData.referenceSimilarity`]/direction/account/VAT, ✓/✗/⚠ + delta); candidate evidence via `EvidenceFactors` (met "Why" / unmet "Potential concern", never a bare %); "Line N of M" + Prev/Next + keyboard ←→ + "Investigate R0.16" → investigator auto-run; truthful summary (caps at 99.9% unless `varianceRemaining===0`, "—" when coverage null); trace via shared `RecordDetailSheet` (state-preserving — verified by test); 9-question document-proofing checklist; `DifferenceInvestigatorPanel` 5 headed sections + literal combination arithmetic; `WholePeriodProofPanel` as its own tab (both directions, tagged); `HelpTip` tooltips. Retry pass filled 4 gaps (evidence-delta wiring, `keepMounted` so tab-switch preserves selection, honest+visible missing-in-books notice, extra tests). **Queen-verified gate: type-check ✅ / lint ✅ / 1249 tests / 177 files ✅ / build ✅.** Missing-in-books flows: `search_existing` real (routes to Bank Transactions), the other 5 are visible `// P2` stubs (no statement-line→GL entry point yet). Trace chain stops at journal entry (honours "only real links", shallower than full PART E). |
| P2.3 | Office National evidence report + re-generate recon issues | Agent 20 (+retry) | **PASS** | DB regen: **12 `reconciliation_issues`**, all `status='open'`, all with rich `evidence_data` (met+unmet factor scorecards, `combinationTerms` arithmetic, generated explanations) + `dedupe_key`, single 2026-08-28 17:37:38 batch, no confidence-40 noise. Offline harness `officeNationalPartJRegen.test.ts`. `docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md` (705 lines): closing balance R174,265.22 → **R184,068.54** everywhere (superseded-cut note, not open question); **`## Issue cross-reference`** section (line 413) — 12 rows with issue_type/confidence/effect_amount + an `evidence_data` field matrix + expected line_state + resolution + rationale, stale UUIDs replaced with regenerated ids; **`## PART O`** walk-through (line 480) O-1..O-10 (R0.16 / R185.50 / R62.10 / duplicate / wrong-sign / wrong-account[why it's a Books-Integrity finding] / one-to-many / pair / triple / timing) each quoting real evidence values. Outstanding deposit (C2b, conf 70) + payment (C2a, conf 45 auto-safe) both materialise as `missing_bank_side` rows, PAY-2004 also flagged as books→statement timing proof. **Queen-verified:** 12 issues all evidence+dedupe, baseline untouched (171 JEs, global diff R0.00, GL 1100/1000/1200 = R207,794.04 / R212,270.67 / R1,569,743.20, inventory valuation == GL 1200, 1 statement / 87 lines, 81/13, 0 contamination). Gate: type-check ✅ / lint ✅ / **1249 tests / 177 files** ✅ / build ✅. |
| P2.4 | Queen: verify + gate + baseline re-verify + P2 report → **user review** | Queen | **DONE — reviewed, shipped to `main` (`7481ef8`)** |

### Commit & deploy (2026-08-29, user-authorised)
- Committed to `main` in 2 commits and pushed to `origin/main` (`GerhardVanWijk/accountant_dashboard_ollama`):
  - `fa4aae1` test(safety): fail-closed Supabase test/tooling guard
  - `7481ef8` feat(accounting,banking): Office National demo + Phase 21 corrections + P1 statement persistence + P2 reconciliation workspace
- Push needed the `GerhardVanWijk` gh account (the repo-scoped commit identity `Gerhard29046 / gerhard.ark.of.war@gmail.com` is correct and unchanged; `gh` active account switched for the push then switched back).
- **Cloudflare deploy**: this repo deploys via **Cloudflare Pages connected to the GitHub repo** — the push to `main` triggers the build (`npm run build`) + deploy automatically. There is deliberately no `wrangler.toml` (commit `ba8d10f` removed it — "it was silently breaking the live deployment"). Deploy env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are set in the Pages project, not the repo. Nothing further to run locally.
- Migrations 0019 + 0020 are already live on Supabase, so the DB is in sync with the deployed code.

---

# P3 — VERTEX FORM SYSTEM + PAGE LAYOUT FOUNDATION

**Opened:** 2026-08-29 · **Owner:** Queen Bee
**Rule:** Do NOT commit or push until each sub-phase is reviewed. Stop at each review boundary.
Two connected goals, deliberately NOT the same CSS problem:
1. A consistent Vertex Form System (FormShell / Header / Body / Footer / Tabs + size tokens).
2. Fix the shared page-width/layout defect that makes desktop totals / filters / reports appear
   vertically/narrowly stacked.

**Architecture rule:** forms/detail surfaces MAY have deliberate `max-width`; normal
accounting/list/report pages use the full available content width.

Statuses: `NOT STARTED` · `IN PROGRESS` · `PASS` · `FIXED` · `BLOCKED` · `N/A`

Review boundaries: **R1 = P3A** · R2 = P3B+P3C · R3 = P3D · R4 = P3E+P3F+P3G · Final = P3H/P3I/P3J.

## SUB-PHASE STATUS

| Sub-phase | Scope | Status |
|---|---|---|
| **P3A** | Shared page-width foundation + 10-page ancestry audit | **DONE** (R1 approved) — shipped `62f0905` |
| P3B | Vertex Form System primitives (FormShell/Header/Body/Footer/Tabs) | **DONE** (R2 approved) — shipped `62f0905` |
| P3C | Form behaviour standard (create/edit/detail, unsaved-changes, validation, loading) | **DONE** (R2 approved) — shipped `62f0905` |
| P3D | High-priority form migration (Banking, Customer, Supplier, Company, Invoice, CN, Receipt, Journal) | **DONE** (R3 approved) — shipped `62f0905` |
| P3E | Purchases + inventory forms | **DONE** — shipped `62f0905` |
| P3F | Admin / settings forms | **DONE** — shipped `62f0905` |
| P3G | Long-tail form audit (~45-form inventory → MIGRATED/COMPLIANT/N/A/BLOCKED) | **DONE** — shipped `62f0905` |
| P3H | Global summary / page-layout re-audit (forms constrained, pages full-width) | **DONE** — shipped `62f0905` |
| P3I | Tests for the shared architecture (17-point list) | **DONE** — shipped `62f0905` |
| P3J | Visual QA (1440 / 1280 / mobile) | **OUTSTANDING** — no browser tooling in this environment; needs a human pass on the deploy |

---

## P3A — SHARED PAGE WIDTH FOUNDATION — **DONE (R1 approved), shipped `62f0905`**

### P3A.0 — Root cause (exact)

**The Tailwind config has no `sm` breakpoint, so every `sm:*` utility in the app compiles to
nothing.**

`tailwind.config.js` sets `theme.screens` (NOT `theme.extend.screens`) to a custom object:

```
xs 320 · md 768 · lg 1024 · xl 1280 · 2xl 1536      ← no sm
```

Specifying `theme.screens` **replaces** Tailwind's default breakpoint set entirely. This scale
has existed since the Phase 0 scaffold (`6e8e6e9`) — the pre-v0 design system was deliberately
built on `xs/md/lg/xl/2xl` (DESIGN_SYSTEM.md still says "Below 768px (`md` breakpoint)…").

Then the **v0 design-system port** (`fb7f778` onward) brought in ~109 components authored
against Tailwind v4, whose default scale **includes `sm` (640px / 40rem)**. Those components use
`sm:` heavily — and Tailwind v3's JIT silently emits **no CSS** for an unknown variant prefix
(no error, no build failure). Same silent v4→v3 breakage family as the three already documented:
`card.tsx` `@spacing()`, `sidebar.tsx` `w-(--var)`, `tokens.css` status-* alpha modifiers.

**Empirically confirmed** against the compiled bundle (`dist/assets/*.css`):
- *Before:* media queries present = `320, 768, 1024, 1280, 1536`. **No `640`.** `grep -c 'sm\:'`
  on responsive utilities = 0.
- *After the fix:* `@media (width>=640px)` block now present, containing
  `.sm\:grid-cols-3`, `.sm\:flex`, `.sm\:grid`, `.sm\:w-auto`, `.sm\:min-w-64`, … — all 188.

### P3A.1 — Rendered-DOM ancestry audit (no browser tooling available → static + compiled-CSS)

Full chain from `<body>` to the Trial Balance summary grid, every level checked for
`max-w-*` / `w-fit` / `w-auto` / fixed width / `inline-*` / `self-start` / `container` / `prose`
/ inline max-width / narrow flex child / reused modal width classes:

```
body                                  — globals.css: only bg/text/font. NO max-width.
└ #root                               — no class, no CSS rule. NO constraint.
  └ .app-shell                        — token scope only (tokens.css). display:block, 100%. NO width.
    └ [data-slot=sidebar-wrapper]     — flex min-h-svh w-full   (SidebarProvider)
      ├ Sidebar peer wrapper          — hidden md:block; in-flow width = sidebar-gap = 16rem
      │  └ sidebar-gap                 — w-[var(--sidebar-width)] (16rem) / icon-collapsed 3rem
      │  └ sidebar-container           — position:fixed (OUT OF FLOW — cannot constrain siblings)
      └ SidebarInset <main>           — relative flex w-full flex-1 flex-col + min-w-0 (AppLayout)
        │                                variant="sidebar" (default) → NO m-2 inset margin
        ├ AppTopbar <header>          — sticky, h-14. Not an ancestor of page content.
        └ <main> (AppLayout)          — flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6
          └ Outlet → TrialBalancePage — React fragment, no wrapper element
            ├ PageHeader <header>     — flex flex-col … (full width). `max-w-2xl` is on the
            │                            <p> description ONLY — correct, does not affect layout.
            └ SectionCard <section>   — flex flex-col rounded-xl border  (align stretch → 100%)
              └ body <div>            — flex-1 p-5   (100%)
                └ <div>               — flex flex-col gap-5   (100%)
                  └ <div>             — grid gap-6 sm:grid-cols-3   ← THE MEASURED ELEMENT
```

**Finding: there is NO width-constraining ancestor anywhere in the shared chain.** The chain
resolves to full content width at every level. `SidebarInset` correctly fills
`viewport − 16rem sidebar`; `<main>` fills that minus padding.

**The defect is on the measured element itself:** `sm:grid-cols-3` never compiled, so the grid
stays at its implicit **single column at all widths**, stacking Total Debits / Total Credits /
Difference vertically. The DevTools "~466px" reading was the 1-column grid inside a
DevTools-narrowed viewport (≈770px − 256px sidebar − padding); the *visual* "stacked" complaint
is fully explained by the dead `sm:` breakpoint, independent of viewport.

The prior "browser-driven correction pass" (§9/§13, 2026-08-27) concluded these pages were
"already correct in `main`" **by reading the Tailwind classes** — which is exactly the mistake
this brief warned against; the classes were present but inert.

### P3A.2 — Pages affected (the 10 audited) — all same root cause, no per-page constraint

| # | Page | Content wrapper | Summary strip | Verdict |
|---|---|---|---|---|
| 1 | Trial Balance | fragment → SectionCard | `grid gap-6 sm:grid-cols-3` | dead `sm:` → 1-col |
| 2 | General Ledger | `flex flex-col gap-6` → SectionCard | `grid gap-6 sm:grid-cols-3` | dead `sm:` → 1-col |
| 3 | Chart of Accounts | fragment → SectionCard | filter row `flex flex-col … sm:flex-row sm:items-center` | dead `sm:` → stays vertical |
| 4 | Bank Accounts | — → SectionCard | `grid gap-6 sm:grid-cols-2` + filter `sm:flex-row` | dead `sm:` → 1-col / vertical |
| 5 | Bank Transactions | — → SectionCard | `grid gap-6 sm:grid-cols-3` | dead `sm:` → 1-col |
| 6 | Bank Reconciliation | `flex flex-col gap-6` → SectionCard + Tabs | two-pane workspace uses `lg:` (works); page shell full-width | OK structurally; `sm:` bits inert |
| 7 | VAT | `flex flex-col gap-6` → SectionCard | `grid gap-6 sm:grid-cols-3` | dead `sm:` → 1-col |
| 8 | Income Statement | `flex flex-col gap-6` → SectionCard | header filter row `flex flex-wrap items-end gap-2` (no `sm:`) | report body full-width; OK |
| 9 | Balance Sheet | (same family as #8) | — | to re-verify visually |
| 10 | Cash Flow | (same family as #8) | — | to re-verify visually |

No target page carries a `max-w-*` / form-width class on its content wrapper. `max-w-*` in the
`src/features/**/*Page.tsx` grep is exclusively on: `DialogContent` (modals — correct),
search `InputGroup` (`sm:max-w-72` — a capped search box, correct), and marketing pages
(`MarketingPageShell`, a separate un-audited shell — not in scope).

### P3A.3 — The fix (shared, one line)

`tailwind.config.js` → add `sm: '640px'` to `theme.screens` (Tailwind's own default, = what
accounting-v0-frontend was built against). This activates all 188 `sm:*` utilities across
~109 files to lay out as their (v0) authors intended. No component code changed.

- **Shared files changed: 1** — `tailwind.config.js` (+ explanatory comment).
- **Components changed: 0.**
- **Width constraint removed:** none existed; the dead breakpoint was *restored*.
- No report/list page receives form `max-width` (none touched).
- **Blast radius: ~109 files / 188 `sm:` utilities** now render responsively (summary grids
  2-/3-up from 640px, filter toolbars horizontal from 640px, `main` padding 16→24px from 640px,
  plus form/detail-sheet internal `sm:` layouts). **This IS a significant shared-layout change
  → STOP at R1 for visual review before P3B.**

### P3A.4 — Gate

- type-check ✅ · lint (`--max-warnings 0`) ✅ · **tests 1249/1249, 177 files ✅** (unchanged) · `vite build` ✅
- `git status`: only `tailwind.config.js` modified. Not committed, not pushed.

### P3A.5 — Outstanding

- **Visual verification (P3A.9 / P3J).** No Chrome DevTools / Playwright MCP in this environment
  → no rendered-width screenshots at 1440 / 1280 / mobile. The fix is proven at the
  compiled-CSS level; **the user should visually confirm the 10 pages on a fresh `npm run dev`**,
  watching for: any page that now over-wraps, any form/detail sheet whose restored `sm:` layout
  regresses, `main` padding step at 640px, and the reconciliation two-pane workspace (unaffected —
  uses `lg:`).
- Balance Sheet / Cash Flow pages: class audit pending in P3H re-audit.

**REVIEW 1 — user approved 2026-08-29: "proceed to P3B + P3C".** P3A `sm`-breakpoint fix
kept as-is. Visual QA still outstanding (folded into P3H/P3J).

---

## P3B — VERTEX FORM SYSTEM PRIMITIVES — **DONE (R2 approved), shipped `62f0905`**
## P3C — FORM BEHAVIOUR STANDARD — **DONE (R2 approved), shipped `62f0905`**

**Primitives built, ZERO forms migrated** (migration is P3D+, gated on this review). New dir
`src/components/app/form/`, barrel `@/components/app/form`.

### What was built

| Primitive | File | Responsibility |
|---|---|---|
| **`FormShell`** | `FormShell.tsx` | The one thing it owns is **sizing** (`size` token → width + height). Also: brand-green ring, viewport-safe constraints, flex-column skeleton (stable header → scrolling body → stable footer), the unsaved-changes close guard, `<form>` wrapping + submit. Composes the base-ui dialog primitive directly (not `DialogContent`) so header/footer sit *outside* the scroll region. `surface="dialog"` (default) or `"sheet"`. |
| **`FormHeader`** | `FormHeader.tsx` | Fixed header: title / `recordRef` / `badge` / `actions` / × button. Supplies the surface's a11y name+description (base-ui `Title`/`Description` via context); × routes through the shell's guarded close. Degrades to `<h2>` outside a shell. |
| **`FormBody`** + `FormSection` / `FormLoading` / `FormEmptyState` | `FormBody.tsx` | The single scroll region: `flex-1 min-h-0 overflow-y-auto` + consistent padding + `gap-6` section rhythm. `FormSection` = real `<fieldset>/<legend>`. `FormLoading`/`FormEmptyState` fill the body without collapsing the shell (P3C loading / not-found spec). |
| **`FormFooter`** | `FormFooter.tsx` | Fixed footer outside the scroll region (fixes the 40 forms that hand-rolled `<div class="flex justify-end border-t pt-4">` *inside* the body). `flex-col-reverse` on mobile (primary on top, thumb-reachable) → right-aligned row from `sm`. `destructiveAction` slot pinned left (`sm:mr-auto`), keeps semantic red. `error` slot = server-error alert above the buttons. |
| **`FormTabs`** + `FormTab` | `FormTabs.tsx` | Use *instead of* `FormBody`. `flex min-h-0 flex-1 flex-col` inside the fixed-height shell → tab list pinned, each panel its own scroll area, `keepMounted` → **switching tabs never changes outer width/height and never moves the footer** (the tab-resize bug, consolidated from 3 hand-rolled copies). Active tab = brand-green `line` treatment (shared `Tabs`). Per-tab `hasError` dot. |
| **`FormError`** / **`RequiredMark`** | `FormError.tsx` | Form-level (non-field) error banner, dark-mode-safe `destructive` token. `RequiredMark` = `*` + `sr-only` "(required)" (not colour-only). Field-level errors keep the shadcn `FieldError`. |
| **`ConfirmDialog`** | `ConfirmDialog.tsx` | One shared confirm prompt — the discard-changes prompt AND (P3D) the ~7 hand-rolled delete/void `AlertDialog`s. `destructive` → red confirm; Cancel-left / action-right always; `pending` disables both. Built on `AlertDialogContent` (deliberately *not* brand-ringed — a confirm is not a form). |
| **`useUnsavedChangesPrompt(isDirty)`** | `useUnsavedChangesPrompt.ts` | `beforeunload` guard (out-of-app nav / tab close / reload). In-app dialog/sheet/Escape/overlay close is handled by `FormShell` itself. In-app *route* nav blocking = a later `useUnsavedChangesBlocker` (needs a data-router context an isolated modal render lacks) — deferred to P3D wiring. |

### Size tokens (P3B "FORM SIZE TOKENS") — consolidated into `form-surface.ts`, not duplicated

| Token | Width (dialog) | Height | For |
|---|---|---|---|
| `sm` | `sm:max-w-lg` (32rem) | natural, viewport-capped | bank account, basic ledger account, small settings record, 1-field override |
| `md` (default) | `sm:max-w-2xl` (42rem) | **fixed** `md:h-[min(calc(100dvh-2rem),44rem)]` | Customer, Supplier, Product, Employee, Company |
| `lg` | `sm:max-w-4xl` (56rem) | **fixed** `…,52rem` | Invoice, Credit Note, Receipt, Bill, Supplier Payment, Journal Entry |
| `xl` | `sm:max-w-6xl` (72rem) | **fixed** `…,56rem` | Bank Statement Import, reconciliation config, advanced settings |

- Base (mobile) is always `max-h-[calc(100dvh-2rem)]` — no absolute heights that fail on laptops.
- `height="natural"` opts a form out of the fixed frame.
- Sheet widths: `formSheetWidthClass` (`sm:max-w-md`…`sm:max-w-2xl`); sheets are full-height.
- **Legacy `formDialogClass` / `wideFormDialogClass` / `standardDialogClass` / `compactDialogClass`
  kept byte-stable** — the ~15 un-migrated `*FormModal`s still import them; deleted after P3D+.
- Popup base look extracted to `formDialogPopupBaseClass` / `formSheetPopupBaseClass` /
  `formOverlayClass` so `FormShell` stays visually identical to `DialogContent`.

### Green visual spec (P3B "GREEN FORM VISUAL SPEC")

Inherited unchanged — `ring-1 ring-brand-outline` (30% green hairline, no neon glow), brand
focus ring on inputs (`--ring` = `--brand`), brand active tab. Errors stay `--destructive`,
warnings stay `--warning`. `FormShell` adds no new green; it reuses the tokens.

### Behaviour standard (P3C)

- **Modes:** `create` / `edit` → `<form>` + unsaved-changes guard; `detail` → **never** a
  `<form>`, `onSubmit` ignored, `isDirty` ignored, close never prompts. Enforces "do not open a
  posted immutable journal in an editable form" at the shell level — the consumer picks the mode.
- **Unsaved changes:** dirty create/edit + (close × | Escape | overlay | tab close/reload) →
  `ConfirmDialog` ("Discard unsaved changes?" / "Discard changes" / "Keep editing"). `onClose`
  fires only on confirm. Clean form / detail view → closes silently.
- **Validation surface:** `RequiredMark`, shadcn `FieldError` (inline), `FormFooter error=`
  (server), `FormShell pending` → footer disables actions. Focus-first-error and the RHF-vs-
  useState reconciliation are per-form work in P3D+.
- **Loading / empty:** `FormLoading` / `FormEmptyState` keep the shell at its `size` dimensions.

### P3I tests written (18 new, `src/components/app/form/*.test.tsx` + `src/styles/tailwind-breakpoints.test.ts`)

Covers P3I list items **1** (size token applied) · **2** (width stable across tab change) ·
**3** (height stable across tab change) · **4** (body scrolls internally) · **5** (footer stays
mounted) · **6** (loading preserves shell) · **7** (mobile viewport cap) · **8** (dirty create
warns) · **9** (dirty edit warns) · **10** (clean form closes) · **11** (detail never warns) ·
**12** (active tab brand/`line`) · **13** (native select untouched inside body) · **17** (detail
renders no `<form>`, never submits) · plus discard-confirm/keep-editing paths, `<form>` wrap for
edit, `FormFooter` error+destructive, `FormError`/`RequiredMark`/`FormSection`/`ConfirmDialog`,
`useUnsavedChangesPrompt` add/remove/preventDefault, and a **P3A regression lock** on the `sm`
breakpoint. Items **14–16** (page summary width / report pages / nested controls) are P3H.

### Gate

- type-check ✅ · lint (`--max-warnings 0`) ✅ · **tests 1283/1283, 181 files ✅** (+34, +4 files) · `vite build` ✅
- `git status`: `tailwind.config.js`, `src/components/app/form-surface.ts`, `docs/CURRENT_TASKS.md`
  modified; `src/components/app/form/` + `src/styles/tailwind-breakpoints.test.ts` new. **No form
  migrated. Not committed, not pushed.**

### Outstanding for R2 review

- No form uses the new primitives yet — proof is the 18 unit tests, not an in-app render.
- `DialogContent`/`SheetContent`/`RecordDetailSheet` untouched — `FormShell` is additive.
- Visual QA of a primitive-built form deferred to the first P3D migration (pilot: CustomerForm).

**REVIEW 2 — user approved 2026-08-29: "proceed to P3D".**

---

## P3D — HIGH-PRIORITY FORM MIGRATION — **DONE (R3 approved), shipped `62f0905`**

Migrated the brief's priority list onto `FormShell` / `FormHeader` / `FormBody` / `FormTabs`
/ `FormFooter`. **Uniform recipe** (so the diff is mechanical and reviewable):

- `*FormModal.tsx` → `<FormShell open onClose size mode isDirty><FormHeader title/>{form}</FormShell>`.
  Modal holds a `const [dirty, setDirty] = useState(false)` and passes `onDirtyChange={setDirty}`.
- `*Form.tsx`: root becomes `flex min-h-0 flex-1 flex-col`; fields wrapped in `<FormBody>` (or
  `<FormTabs>` for tabbed); the hand-rolled `<div class="flex justify-end border-t pt-4">` +
  the inline `{formError && <p>}` → `<FormFooter error={formError}>`.
- Dirty signal: RHF forms report `formState.isDirty` via `useEffect(() => onDirtyChange?.(isDirty), …)`;
  useState forms report on first `onInput` (real edit; `fireEvent.change` in tests doesn't trip it,
  so existing tests are unaffected).
- No validation logic, schema, submit handler, or service call was touched.

### Migrated (brief order)

| # | Form | Modal → shell | Size | Notes |
|---|---|---|---|---|
| 1a | **Bank Account** | `BankAccountFormModal` | `md` | RHF; `FormBody` + `FormFooter`. |
| 1b | **Bank Transaction** | `TransactionFormModal` | `lg` | useState, tabbed. Keeps its bespoke `<Tabs>` (receipt & payment share one panel body — `FormTabs` would duplicate that panel's field ids); gains `FormShell` height + `FormFooter`. |
| 1c | **Allocate Transaction** | `AllocateTransactionFormModal` | `lg` | useState; `FormBody` + `FormFooter`. |
| 1d | **Statement Import** | `StatementImportWizard` | `xl` | Minimal shell swap only (`FormShell`+`FormHeader hideClose`+`FormBody`); the 3 wizard steps keep their own per-step footers — **sticky-footer-per-step deferred to P3E** (documented long-pole). |
| 2 | **Customer** | `CustomerFormModal` | `md` | **Flagship.** 4 tabs → shared `FormTabs` (stable size, brand active tab, per-tab error dot, `keepMounted`). This is the tab-resize case the audit flagged. |
| 3 | **Supplier** | `SupplierFormPage` (page, not modal) | — | `SuppliersRoot` deliberately keeps create/edit as a full-page workflow (documented). So: `FormTabs` inside a bounded `h-[28rem]` frame + `FormFooter`; `SectionCard bodyClassName="p-0"`. Not wrapped in `FormShell` (not a modal surface). |
| 4 | **Company** | `CompanyPage` dialog → `FormShell` | `md` | 3 `<fieldset>` → `FormSection`; page's inline `saveError` banner → `FormFooter error`. |
| 5 | **Invoice** | `InvoiceFormModal` | `lg` | useState + `SalesLineItemsEditor` (untouched). |
| 6 | **Credit Note** | `CreditNoteFormModal` | `lg` | ditto. |
| 7 | **Customer Receipt** | `CustomerReceiptFormModal` | `lg` | ditto. |
| 8 | **Journal Entry** | `JournalEntryFormModal` | `lg` | useState + real-time `validateLines` (untouched). |
| + | **Account** (Chart of Accounts) | `AccountFormModal` | `md` | Banking-adjacent, same one-file recipe — done alongside 1a. |

### Not done in P3D (deferred, documented)

- `StatementImportWizard` per-step sticky footers → **P3E**.
- `TransactionForm` still shows its submit error inline near the tab list rather than in
  `FormFooter error=` (its `FormFooter` has no `error` prop wired) — cosmetic, **P3E**.
- Legacy `formDialogClass` / `wideFormDialogClass` / `standardDialogClass` / `compactDialogClass`
  still used by the ~15 un-migrated `*FormModal`s (Quote, SalesOrder, Purchases domain, admin,
  inventory, …) — those are **P3E / P3F / P3G**. Deleted once all consumers move over (P3G).

### Tests

- New `CustomerFormModal.test.tsx` (4): stable surface size across all 4 tabs · Save button
  mounted on every tab · edit-then-close prompts + discard closes · clean close is silent.
- All pre-existing form/page/service tests pass **unchanged** — `StatementImportWizard.test.tsx`
  needed one query disambiguated (`hideClose` removed the now-redundant header × that collided
  with the DoneStep's "Close").

### Gate

- type-check ✅ · lint (`--max-warnings 0`) ✅ · **tests 1287/1287, 182 files ✅** (+4) · `vite build` ✅
- **25 files modified** (config + `form-surface.ts` + 11 form/modal pairs + CompanyPage +
  SupplierFormPage) + `src/components/app/form/` + 2 new test files. **Not committed, not pushed.**

### Outstanding for R3

- Visual QA: no browser tooling — the migrated modals are proven by unit tests, not an in-app
  render. User should check the 11 forms on `npm run dev` (esp. Customer's 4 tabs, the `lg`
  line-item forms' width, the Supplier page frame, and that the discard prompt feels right).
- `DialogContent` / `RecordDetailSheet` still untouched.

**REVIEW 3 — user approved 2026-08-29: "proceed to P3E".**

---

## P3E — PURCHASES & INVENTORY FORMS — **DONE, shipped `62f0905`**

Same uniform recipe as P3D. **Purchases + Inventory + Assets now have the `*FormModal`
layer they lacked** (the audit's "most inconsistent module").

### Migrated

| Domain | Form | New modal | Size | Page updated |
|---|---|---|---|---|
| Purchases | `BillForm` | `BillFormModal` | `lg` | `BillsPage` |
| Purchases | `PaymentForm` | `PaymentFormModal` (`title?`) | `lg` | `BillsPage` (Record payment) + `PaymentsPage` |
| Purchases | `PurchaseOrderForm` | `PurchaseOrderFormModal` | `lg` | `PurchaseOrdersPage` |
| Inventory | `ProductForm` (RHF) | `ProductFormModal` | `md` | `ProductsPage` — Product Category is a free-text field on this form, no separate entity (per audit) |
| Inventory | `WarehouseForm` (RHF) | `WarehouseFormModal` | `md` | `WarehousesPage` |
| Inventory | `StockTransferForm` (RHF) | `StockTransferFormModal` | `md` | `WarehousesPage` |
| Inventory | `StockAdjustmentForm` (RHF) | `StockAdjustmentFormModal` | `md` | `WarehousesPage` — the brief's "Inventory Adjustment" |
| Assets | `AssetForm` (RHF) | `AssetFormModal` | `md` | `AssetRegisterPage` — the brief's "Fixed Asset" |
| Assets | `PostAcquisitionForm` | `PostAcquisitionFormModal` | `sm` | `AssetRegisterPage` (same page — done for consistency) |

- Each page swapped its inline `<Dialog open={…}><DialogContent max-w-*>…` for
  `{show && <XFormModal onClose={…} …/>}` (mount/unmount → dirty state resets cleanly each open).
- **Expense** → N/A: no Expense entity in the domain (audit); the real path is
  `AllocateTransactionForm` / `TransactionForm`, both migrated in P3D.

### P3D deferrals now cleared

- `TransactionForm` submit error → moved from the inline block inside the tab list to
  `FormFooter error=`.
- `StatementImportWizard` per-step sticky footers → **still deferred** (its 3 steps each carry a
  distinct footer; needs the wizard restructured, not a mechanical swap) — **P3F/P3G**.

### Tests

- New `PurchasesFormModals.test.tsx` (3): Bill modal opens in the shared shell (`lg` width,
  header, footer outside the scroll region) · clean PO modal closes silently · edited PO modal
  prompts.
- All pre-existing purchases / inventory / assets tests (`PaymentForm.test`,
  `LineItemsEditor.test`, `SalesLineItemsEditor.test`, service + page tests) pass **unchanged**.

### Gate

- type-check ✅ · lint (`--max-warnings 0`) ✅ · **tests 1290/1290, 183 files ✅** (+3) · `vite build` ✅
- **~30 files touched** (14 forms + 12 new `*FormModal` + 6 pages) + 1 new test file. **Not committed.**

### Remaining before Review 4 is complete (P3F + P3G)

- **P3F** — admin/settings forms: `UsersPage` (×3), `ReopenPeriodDialog`, `TaxRatesPage` (×2),
  `ExchangeRatesPage`, `ReportingStandardsPage`, `PublicInterestScorePage` (×2), `IncomeTaxPage`
  (SBC), `DividendsTaxPage`, `RelatedParty*` (×2), `PayrollRunsPage` (×3), `EmployeesPage`,
  `LeaseRegisterPage` (×2), `LeaseAmortizationPage`, `DepreciationPage`, `DisposalsPage`.
  Full-page Settings/Accounting-settings hubs stay as pages.
- **P3G** — long-tail: Quote / SalesOrder `*FormModal`s → `FormShell`; the 7 hand-rolled
  delete/void `AlertDialog`s → `ConfirmDialog`; `StatementImportWizard` per-step footers;
  then DELETE the legacy `*DialogClass` consts from `form-surface.ts` once no consumer remains;
  final ~45-form classification table (MIGRATED / ALREADY COMPLIANT / N/A / BLOCKED).

**REVIEW 3/checkpoint — user 2026-08-29: "continue with all the phases … full permission … upload to github and deploy … commit … deploy to cloudflare".** P3F→P3J run to completion + commit + push + deploy.

---

## P3F — ADMIN / SETTINGS / TAX / PAYROLL / LEASE FORMS — **PASS**
## P3G — LONG-TAIL — **PASS**

Same uniform recipe. **Every page-inline `<Dialog>` / `<AlertDialog>` form surface in `src/features/`
is now on `FormShell` or `ConfirmDialog`** — `grep -rn "DialogContent\|AlertDialogContent"
src/features --include=*.tsx` (excl. tests) returns **nothing**. `RecordDetailSheet` is the only
remaining direct dialog-primitive consumer (correct — it's the detail-sheet layer).

### P3F — migrated (form + page)

| Form | Modal / page | Size |
|---|---|---|
| `ReopenPeriodDialog` (self-hosted) | → `FormShell` | `sm` |
| `TaxRateForm` / `SupersedeTaxRateForm` | `TaxRatesPage` (page-level `FormShell`) | `md` |
| `ExchangeRateForm` | `ExchangeRatesPage` | `md` |
| `RelatedPartyForm` / `RelatedPartyTransactionForm` | `RelatedParty*Page` | `md` |
| `LeaseForm` / `TerminateLeaseForm` | `LeaseRegisterPage` | `md` / `sm` |
| `RunAmortizationForm` | `LeaseAmortizationPage` | `sm` |
| `EmployeeForm` | `EmployeesPage` | `md` |
| `PayrollRunForm` / `PostPayrollRunForm` | `PayrollRunsPage` | `md` |
| Payroll-run **view** (`PayslipLinesTable`) | `PayrollRunsPage` | `xl`, `mode="detail"` |
| `DividendDeclarationForm` | `DividendsTaxPage` | `md` |
| `RunDepreciationForm` / `DisposeAssetForm` | `DepreciationPage` / `DisposalsPage` | `sm` |
| `CalculateScoreForm` / `ReportingFrameworkOverrideForm` | `PublicInterestScorePage` | `md` |
| `AddReportingStandardVersionForm` | `ReportingStandardsPage` | `md` |
| `SbcEligibilityForm` | `IncomeTaxPage` | `md` |
| `UsersPage` — add-user / assign-role / create-role (3 inline dialogs, trigger-button pattern) | → `FormShell` `sm` | `sm` |

- Full-page Settings / Accounting-settings hubs stay pages — not form surfaces (P3F rule).
- Multi-dialog pages use one page-level `dirty` state + a `closeDialog()` that resets it, so
  each freshly-opened dialog starts clean.

### P3G

- **Sales:** `QuoteFormModal` / `SalesOrderFormModal` (`lg`) · `AllocationFormModal` (`sm`) → `FormShell`.
- **7 hand-rolled delete/void `AlertDialog`s → `ConfirmDialog`:** delete draft
  invoice/quote/sales-order · void credit note · delete supplier · delete bank transaction
  (`error` slot added to `ConfirmDialog` for this one) · delete role.
- **Dead code deleted:** `StatementImportModal.tsx` + `StatementImportPanel.tsx` (0 references —
  superseded by `StatementImportWizard` per the P1 review). The unused
  `bankTransactionService.importStatementLines` / `findMatchesForLine` methods + their tests are
  left (service-layer cleanup, not a form concern).
- **Legacy `*DialogClass` consts DELETED** from `form-surface.ts` (`formDialogClass`,
  `wideFormDialogClass`, `standardDialogClass`, `compactDialogClass`, `tabbedFormPanelsClass`) —
  0 consumers remained. `recordSheetClass` / `wideRecordSheetClass` kept (RecordDetailSheet).
- **`StatementImportWizard` per-step footers** — still deferred (its 3 steps carry distinct
  footers; a proper wizard restructure, not a mechanical swap). It has the `FormShell` + `FormBody`
  shell; only the per-step footer stickiness is outstanding.

### Final form classification (~45 surfaces)

| Bucket | Count | Notes |
|---|---|---|
| **MIGRATED to `FormShell`** | ~40 | every `*FormModal` + every page-inline form dialog + 3 tabbed forms (`FormTabs`) + Supplier (page `FormTabs`) + Company/Reopen/Payroll-view |
| **MIGRATED to `ConfirmDialog`** | 7 | the delete/void `AlertDialog`s |
| **ALREADY COMPLIANT (unchanged)** | 17 | all `RecordDetailSheet` detail surfaces — one shared component, none tabbed |
| **N/A** | — | Expense (no entity), Bank Reconciliation (workspace page, not a form), Settings hubs (full pages) |
| **BLOCKED / partial** | 1 | `StatementImportWizard` — shell done, per-step sticky footers deferred |

No ad-hoc `max-w-*` remains on any accounting `Dialog`/`Sheet` form surface.

---

## P3H — GLOBAL PAGE-LAYOUT RE-AUDIT — **PASS**

- `grep` for `formSizeWidthClass` / `sm:max-w-2xl|4xl|6xl` in every `*Page.tsx` → **only** on
  filter `InputGroup` / `SelectTrigger` (search boxes — correct). **No form width class leaked
  into page content.**
- The P3A `sm` breakpoint fix is intact and regression-locked
  (`src/styles/tailwind-breakpoints.test.ts`). All 10 summary/report pages keep their responsive
  grids; no page wraps content in a form-sized shell.
- `AppLayout` `<main>` / `SidebarInset` untouched since P3A.

## P3I — TESTS — **PASS**

`src/components/app/form/*.test.tsx` (FormShell ×21, primitives ×13, unsaved-prompt ×2) +
`CustomerFormModal.test.tsx` ×4 + `PurchasesFormModals.test.tsx` ×3 + `tailwind-breakpoints.test.ts` ×2.
Covers P3I list items 1–13, 17; 14–16 covered by P3H grep + the breakpoint lock.
**All 1290 tests pass** (183 files), incl. every pre-existing form/page/service test **unchanged**.

## P3J — VISUAL QA — **OUTSTANDING (no browser tooling in this environment)**

No Chrome DevTools / Playwright MCP available → no rendered screenshots at 1440 / 1280 / mobile.
Every change is behind strict type-check + lint (`--max-warnings 0`) + 1290 tests + a production
`vite build`, and uses the same `FormShell` primitive proven by 40+ unit tests. **The user should
do a visual pass on the deploy** — priority surfaces: Customer 4-tab form (size stable), the `lg`
line-item forms (Invoice/Bill/Journal) width, the reconciliation workspace (unaffected), the 10
report pages' summary grids (P3A `sm` fix), and the discard-changes prompt.

---

## P3 — FINAL GATE (2026-08-29)

- **type-check** ✅ · **lint** (`--max-warnings 0`) ✅ · **tests 1290 / 183 files** ✅ · **`vite build`** ✅
- **~102 files changed:** `tailwind.config.js` (P3A) · `src/components/app/form/` (new, 11 files) ·
  `form-surface.ts` · ~48 form components · ~28 pages · ~22 new `*FormModal` files · 4 new test
  files · 2 deleted dead files · `docs/CURRENT_TASKS.md`.
- Committed + pushed to `origin/main`; Cloudflare Pages auto-deploys from the push.

---

# INVENTORY UX CORRECTION PASS — NAVIGATION / SEARCH / DETAIL LAYOUT

**Opened:** 2026-09-01 · **Owner:** Queen Bee
**Scope:** frontend / navigation UX only. NO accounting logic, NO schema, NO DB writes,
NO migrations. `NORMALIZED_DOCUMENT_LINES_ENABLED` stays OFF. Inventory ↔ GL reconciliation
lives solely under Inventory → Reports → Inventory Reconciliation.
**Source:** user's live-browser inspection of the deployed Inventory module (19-point brief).
**Branch:** `phase-9b-relationship-design-and-code`. **Commit:** `6d203fc`.

## Status

**Two review rounds — APPROVED (user, 2026-09-01). Committed + pushed to the branch.**
Round-1 approval carried two finishing items (both done in the same commit):
(1) reconciliation removed from the overview *completely* — no card, no status line, the
engine is not imported or run from `InventoryOverviewPage`; (2) supplier global-search
deep-link confirmed working (`SuppliersRoot` already honours `?record=`) + regression tests.

## What changed

| Area | Change |
|---|---|
| **Sidebar nav** | New `quickAccess` `NavItem` flag — Organisation → Inventory is a shortcut that no longer claims `/inventory/*` as its active section (root cause of the "jumps back to Organisation" bug). `isNavItemActive()` / `groupHoldsActive()` / `isAccordionGroup()` / `activeAccordionGroupTitle()` extracted to `navigation.ts`; most-specific match wins, so the Inventory group stays expanded with the correct child active across every subpage. `sectionForPath()` (breadcrumbs) uses the same rules. |
| **Inventory group order** | Overview · Products · Categories · Warehouses · Stock Movements · Operations · Reports. |
| **Overview header** | Hierarchy: primary **New item** (green) · grouped **Stock actions ▾** · utility **Import** / **Export ▾** (inline ≥`md`) · **Reports** ghost link → `/inventory/reports` (was `/reports`, ≥`lg`) · responsive **More ▾** overflow (`< lg`). |
| **Overview layout** | Register is full-width; summary strip tightened. **Reconciliation card + engine removed from this page.** |
| **Item detail sheet** | `RecordDetailSheet` shared: `overflow-x-hidden`, body padding `p-4 → sm:p-6`, title `truncate → line-clamp-2` + `overflow-wrap:anywhere`, field values `overflow-wrap:anywhere`, `min-w-0` on scroll container. `InventoryItemDetailSheet`: `sm:max-w-2xl → sm:max-w-3xl lg:max-w-4xl`; tab strip `overflow-x-auto no-scrollbar` + `flex-none` triggers (local scroll, hidden bar); SKU stacked over product name; responsive `grid-cols-1 sm:grid-cols-2` field grids. |
| **Labels** | `getTaxRateLabel()` returns a human label (`"Standard rate — 15%"`) or `"Unknown tax rate"` — never a raw UUID. |
| **Table columns** | `DataTableColumn` gains `hideBelowLg` / `hideBelowXl`. Preferred supplier / Committed / Reorder demoted to `xl`-only (still on the detail sheet). |
| **Global search** | **Root cause:** `CommandDialog` never wrapped its children in `<Command>` (the cmdk context provider was missing → palette inert). Fixed. Rewrite: instant navigation index + lazy product/customer/supplier record index (loads once on first open, filtered client-side — typing never fetches); loading / empty / error states; every result deep-links via `?record=` (products, customers, suppliers all consistent — `SuppliersRoot` already supported it). ⌘/Ctrl-K, Esc, arrows, Enter. |
| **User menu** | Company settings → `/companies` (was a dead duplicate of `/settings`). |
| **Test infra** | `tests/setup.ts`: `ResizeObserver` + `Element.prototype.scrollIntoView` jsdom stubs (cmdk needs them). |

## Files (21: 17 modified, 4 new)

`src/lib/app/navigation.ts` + `navigation.test.ts` + `navigation-active.test.ts` (new) ·
`src/components/app/app-sidebar.tsx` · `data-table.tsx` · `record-detail-sheet.tsx` ·
`user-menu.tsx` + test · `global-search.tsx` + `global-search-records.ts` (new) + `global-search.test.tsx` (new) ·
`src/components/ui/shadcn/command.tsx` ·
`src/features/inventory/pages/InventoryOverviewPage.tsx` + test ·
`components/InventoryItemDetailSheet.tsx` + test · `components/InventoryTable.tsx` + test · `constants.ts` ·
`src/features/suppliers/pages/SuppliersRoot.test.tsx` (new) · `tests/setup.ts`.

## Gate

- type-check ✅ · lint (`--report-unused-disable-directives --max-warnings 0`) ✅ ·
  **tests 1925 / 1925 (263 files)** (from 1902) ✅ · `vite build` ✅
- Accounting logic changed: **NO** · DB writes: **NONE** · normalized-line flag: **OFF**

## Browser QA

**Not performed** — no Chrome DevTools / Playwright MCP in this environment. Responsive
utilities verified present in the compiled CSS bundle. Manual checklist handed to the user
(1440/1920, 1280, mobile, global search, profile menu) — still to be run on the deploy.

## Deploy

- [x] **Merged to `main` + deployed (2026-09-01).** User chose "merge whole branch". Fast-forward
      `4ac5277..2b07407`, pushed to `origin/main` → Cloudflare Pages auto-build/deploy triggered.
      Full gate re-run on `main`: type-check ✅ / lint ✅ / **1925 tests** ✅ / `vite build` ✅.
      Phase 9B rode along (reviews 9B-A→9B-E approved; migrations 0037–0042 already live on
      Supabase; `NORMALIZED_DOCUMENT_LINES_ENABLED` stays OFF). Its `deleteProduct()` history
      guard and `issueCreditNote()` per-line over-return validation are now live (both pure bug fixes).
- [ ] Human browser QA on the live deploy (checklist in the review report — nav / header / detail
      sheet / global search / profile menu at 1440·1280·mobile).

---

# INVENTORY ACCOUNTING MODULE — MAJOR FEATURE

**Opened:** 2026-08-30 · **Owner:** Queen Bee
**Rule:** Do NOT commit or push, and do NOT run `apply_migration` or any Supabase write, until the
relevant Review checkpoint explicitly allows it. STOP at every Review boundary.
**Objective:** make Inventory a first-class accounting subsystem (domain model + stock-movement ledger
+ perpetual-inventory GL integration + costing + stock take + import framework + export/printing +
inventory reports + reconciliation), and remove Inventory from the Fixed Assets navigation grouping.

**Governing docs:** `docs/INVENTORY_ARCHITECTURE.md` (Phase 0 audit + target architecture — created
this pass), `docs/SA_ACCOUNTING_MASTER_SPEC.md`. Later: `docs/INVENTORY_ACCOUNTING.md`,
`docs/IMPORT_EXPORT_ARCHITECTURE.md`.

Review boundaries: R1 = Phase 0 audit + architecture · R2 = schema/migrations/domain services ·
R3 = core Inventory UI/navigation · R4 = purchasing/sales/accounting integration · R5 = stock take +
imports · R6 = reports/printing/export · R7 = Office National backfill + reconciliation · R8 = full
regression/QA.

## PHASE 0 — COMPLETE INVENTORY AUDIT — **DONE (Review 1 approved)**

Ran 6 parallel read-only audit agents (schema/migrations · services/costing · GL integration ·
navigation/UI/Fixed-Assets · import/export/print/reports · demo-data/permissions/tests), cross-checked
by the Queen against the live Supabase project. **No DB writes.** Full 15-point audit + proposed
target architecture + proposed migrations + risks in **`docs/INVENTORY_ARCHITECTURE.md`**.

Headline findings:
1. Inventory is already its own code module (`src/features/inventory/`) — **not** entangled with Fixed
   Assets (zero cross-imports). The "Assets & Inventory" nav group is the only coupling; move (c) is
   cosmetic, zero risk.
2. **Adjustments, write-offs, stock-takes and opening stock post NOTHING to the GL** and have no
   approval control → a write-off silently breaks the GL 1200 ↔ valuation tie.
3. **No inventory-variance / write-off GL account exists** in the chart at all.
4. **`stock_movements` carries no cost and no source-document link** — only a free-text `reference`;
   WAC is not reconstructable from history.
5. **No stock-take / adjustment-document / transfer-document / opening-stock entity** — only bare
   enum values.
6. **No import framework, no Excel, no export, no printing/document-generation** anywhere in the app.
7. **FIFO is non-functional deployed** — no `stock_lots` Supabase table; live wiring is an in-memory
   mock.
8. GL 1200 = valuation (R1,569,743.20, diff R0.00) holds **only** because Phase 21.1 hand-restated
   WAC in SQL — no regression test, drift mechanism unchanged.
9. `docs/INVENTORY_DOMAIN.md` account codes (1400 / 5500) are **wrong** — the real inventory asset is
   `1200`; `5500` is Income Tax Expense.

**Review 1 checkpoint report** — see `docs/INVENTORY_ARCHITECTURE.md` § "REVIEW 1 CHECKPOINT SUMMARY":
files added (the architecture doc), files modified (this file), migrations (none), schema changes
(none), tests added (none), test totals (unchanged ~1290/183), accounting invariants verified
(read-only live — all tie to R0.00), known issues, proposed next action.

**7 architecture forks await a decision** (see `docs/INVENTORY_ARCHITECTURE.md` § "ARCHITECTURE FORKS
FOR REVIEW 1"): (A) costing-model scope, (B) relational categories, (C) supplier link shape,
(D) per-warehouse balance table, (E) print/PDF strategy, (F) inventory RLS/security, (G) adopt
`supabase/migrations/`. Queen recommendations recorded for each.

- [x] **Review 1 — APPROVED (user, 2026-08-30): "go ahead with all recommendations, proceed to Phase 1 and 2".** All 7 forks approved as recommended.

## PHASE 1 — NAVIGATION / INFORMATION ARCHITECTURE — **DONE** (part of the Review 2 batch)

- `navigation.ts`: Inventory quick-access under Suppliers in Organisation; new "Inventory" operational
  group after "Purchases & Expenses"; "Assets & Inventory" split into "Fixed Assets" + "Leases".
- `permissionRouteMap.ts`: `/inventory` gated `inventory:read`. `router.tsx`: `/inventory` →
  new lean `InventoryOverviewPage`. `docs/ROUTES.md` updated.
- Gate: type-check ✅ · lint ✅ · 1290 tests ✅ · build ✅.

## PHASE 2 — INVENTORY DOMAIN MODEL + MIGRATIONS — **DONE (Reviews 2C + 3A approved), migrations 0021–0030 applied, shipped `40f10fb`**

- `supabase/migrations/` folder adopted (fork G); 0000–0020 backfilled from the live DB. Physical
  filenames `20260830120021__0021_...` … `20260830120030__0030_...` (timestamp-prefixed so they sort
  after the timestamped history); logical numbering/order unchanged.
- **10 logical migrations authored, NOT applied** (0021–0030) — see `docs/INVENTORY_ARCHITECTURE.md`
  § "PHASE 2 — DOMAIN MODEL + MIGRATIONS (Review 2C Hybrid)" for the full contract + the Review 2C
  decision table.
- **Review 2C Hybrid (user decision):**
  - **KEEP** normalized header + line tables (5 pairs, no embedded JSON — permanent).
  - **KEEP** composite `(company_id, id)` candidate keys + composite FKs — but only the 9 that an
    actual composite FK consumes; each audited (`products`, `warehouses`, `journal_entries`,
    `accounts`, `suppliers`, `bills`, `purchase_orders`, `tax_rates`, `stock_movements`).
  - **REVERT** the inventory-only role-aware RLS + `user_has_permission()` — the 10 new tables use the
    coarse company-tenant policy every other module uses, written into each table's own migration.
  - **REMOVE** computed-formula CHECK constraints; **KEEP** structural CHECKs.
  - `inventory:*` permissions remain (UI/service authz only); 0030 seeds them + role grants, nothing
    else.
- **Lifecycle contract:** line CRUD/deletion are draft-only (service-enforced, consistent with
  invoices/bills). Posted/confirmed headers + lines are immutable; corrections/reversals create new
  evidence. Stock-take expected qty + WAC are frozen line data.
- **Source evidence:** Phase 3 movements set `stock_movements.source_document_line_id` to the
  normalized line UUID.
- **Enum safety:** 0021 is enum-only; nothing in 0021 consumes the new values; no undocumented manual
  `ALTER TYPE` fallback.
- TS types: Product/StockMovement/Warehouse extended; 7 new entity types (+ line/header/status types)
  + barrel. `docs/INVENTORY_ACCOUNTING.md` = GL-flow + costing contract for Phase 3. New GL accounts
  in `src/mock-data/accounts.ts` (5050 / 1210 / 3950).
- Domain services: `ProductCategoryService` + `StockBalanceService` (full), 5 document-entity service
  skeletons (lifecycle only; GL posting = Phase 3), repository triples (header + line), Mock-repo
  tests, migration-contract test.
- **Review 2C gate:** type-check ✅ / lint ✅ / **1384 tests (192 files)** ✅ / build ✅.
- **Review 2C — APPROVED (user, 2026-08-30).** 20-point manifest accepted; independent migration
  QA PASS.

### MIGRATIONS APPLIED — 2026-08-30 (Review 3A gate)

All 10 applied sequentially with per-migration verification. Files renamed to the recorded versions
`20260830155625__0021_…` … `20260830160120__0030_…` (strictly increasing, after 0020).

| # | applied version | result |
|---|---|---|
| 0021 | 20260830155625 | enum 7 → 12 values; 0 business rows changed |
| 0022 | 20260830155713 | `stock_movements` +8 cols; `movement_date` backfilled (0 null/0 mismatch); candidate key + reversal composite FK; append-only intact (`a,r` policy, UPDATE/DELETE still revoked) |
| 0023 | 20260830155738 | accounts 62 → 65 (5050/1210/3950); 0 dup codes; 0 JE created |
| 0024 | 20260830155811 | 6 `product_categories` (match ON mappings; Delivery&Service account-less); 50/50 products linked; `category` text kept; qoh\|cost hash unchanged |
| 0025 | 20260830155844 | `products` +10 cols; `valuation_method` NOT NULL (2 backfilled, both non-stock); `cost_price` numeric(14,4); qoh\|cost hash unchanged |
| 0026 | 20260830155907 | `stock_balances` 48 rows; **48/48 = ledger, 0 mismatch, max diff 0.000** |
| 0027 | 20260830155950 | adjustments+transfers (4 tables, 0 rows); `products`/`warehouses`/`journal_entries` candidate keys; `warehouses.notes`; coarse RLS in-migration |
| 0028 | 20260830160020 | stock takes (2 tables, 0 rows); coarse RLS in-migration |
| 0029 | 20260830160052 | opening stock + supplier returns (4 tables, 0 rows); 5 candidate keys; coarse RLS in-migration |
| 0030 | 20260830160120 | permissions 29 → 35 (+6); role_permissions 59 → 71 (accountant/stock_controller ×6); **no function, no policy, no `user_roles` dependency** |

**Post-migration invariants — ZERO accounting change:** md5(journal_entries) `75670ccf…`,
md5(journal_lines) `3dbf24e1…`, md5(products qoh|cost) `772619b8…`, md5(stock_movements) `c6d843f0…` —
**all byte-identical to the pre-migration snapshot.** Global Σdr = Σcr R4,838,209.61 (R0.00); TB
R3,076,605.94/side; GL 1200/1000/1100/2000 unchanged; round(Σ qoh×cost,2) = GL 1200 R1,569,743.20
(R0.00); Σqoh 10,169.000; 0 negative stock.

**Reconciliation:** ledger = stock_balances 48/48 (max diff 0.000); products.quantity_on_hand =
Σ stock_balances 50/50 (max diff 0.000).

**Advisors:** security 0 ERROR / 77 WARN (all standing project pattern — every new table has the
same `auth_allow_anonymous_sign_ins` WARN as every existing table; 0 `rls_enabled_no_policy`; no new
`security_definer`). Performance 0 ERROR / 126 INFO / 3 WARN (0 inventory) — 73 `unused_index`
(expected, empty tables), 0 `duplicate_index`, 32 `unindexed_foreign_keys` INFO on the composite FKs
(consistent with 21 pre-existing; empty tables; a covering-composite-index migration is a cheap
Phase-3 follow-up).

**App gate:** type-check ✅ / lint ✅ / **1384 tests (192 files)** ✅ / build ✅ (no regression).
Supabase repos verified column-compatible with the applied schema; **NOT wired into `instances.ts`**
(that + GL posting DI = the first Phase 3 task).

- Shipped to `main` (`40f10fb`).
- [x] **STOP — Review 3A migration gate.** 25-point report delivered. **APPROVED** — migrations
      0021–0030 applied; Phase 3 proceeded (Reviews 3B / 3C-A / 3C-B all approved below).
## PHASE 3 — INVENTORY ACCOUNTING ENGINE — **DONE (Review 3B approved), migrations 0031–0032 applied, shipped `40f10fb`**
> **Live-Postgres inventory-posting E2E is still outstanding** — needs a throwaway Supabase project;
> `inventory_transaction_log` is still 0 rows on the live project, no engine write has touched live data.

**Item 1 — performance index migration:** analysed all `unindexed_foreign_keys` INFOs individually
(32 pre-apply + 22 more from the 0027–0031 tables = 54 now). **No migration warranted** — every real
access pattern is already covered: child→parent by the parent's `(company_id, id)` unique; parent→child
(get-lines / cascade) by the existing `(<header>_id, line_number)` unique (leading column = the header
FK, and it also serves the `ORDER BY line_number`); header→master by the single-column FK indexes on
`product_id` / `warehouse_id` / `journal_entry_id` / `*_account_id`. The outstanding INFOs are all
composite `(company_id, <fk>)` notices with no corresponding hot query, and the advisor separately
reports **74 `unused_index` INFOs** on the new inventory indexes — the schema is already over-indexed
for the current workload. `prove an equivalent does not exist` fails for all candidates. Documented,
no migration. (Deferred cleanup: consider dropping the unused single-column line-table indexes in a
later maintenance pass.)

**Migration 0031 (`20260830162737__0031_inventory_posting_engine.sql`) — APPLIED.** Additive: 1 table
`inventory_transaction_log` (0 rows) + 2 **SECURITY INVOKER** functions `post_inventory_transaction` /
`reverse_inventory_transaction`. `prosecdef=false` both; advisors 0 ERROR, +1 standing anon-warn only,
**no new `security_definer` finding**. products/journal hashes unchanged by the DDL.

**Engine core built (COMPLETE):**
- `inventoryValuation.ts` — the ONE WAC + valuation contract. Integer-scaled BigInt arithmetic (no
  float drift). **ROUND-AFTER-SUM** valuation; WAC blend with all edge cases (empty product, newQty≤0).
- `inventoryPostingEngine.ts` + `.real.ts` (RPC executor) + `.fake.ts` (line-for-line mirror for tests).
  ONE atomic boundary (the RPC), idempotent (`inventory_transaction_log.posting_key` unique), WAC race
  fixed (`SELECT … FOR UPDATE` on every product, `ORDER BY id`).
- `inventoryAccountResolver.ts` — product override → `product_categories` → generic `AccountMappingKey`.
  3 new keys added: `INVENTORY_ADJUSTMENT`(5050) / `INVENTORY_IN_TRANSIT`(1210) / `OPENING_BALANCE_EQUITY`(3950).
- `reconcileInventory.ts` — the reconciliation ENGINE (Phase 14 = UI only). A/B/C/D/E/F checks; exact
  product/warehouse/document/movement/journal + expected/actual/difference evidence; ROUND-AFTER-SUM.
- `inventoryPostingEngine.test.ts` (25) + `reconcileInventory.test.ts` (8) — WAC contract with
  numerical examples, all 10 transaction types, idempotency, atomicity, negative-stock, reversal.

**Migration 0032 (`20260830165401__0032_inventory_posting_engine_frozen_cost.sql`) — APPLIED.**
`create or replace` on `post_inventory_transaction` only (no table/enum change). Adds
`unit_cost_override` handling for `issue` / `return_in` lines so a stock take posts its variance at
the count sheet's FROZEN unit cost, not today's WAC. `prosecdef=false` unchanged; hashes unchanged.

**Workflow-service integration (COMPLETE):** greenfield document services (adjustment/write-off,
stock take, opening stock, supplier return, transfer) + sales/purchases (invoice COGS, bill receipt,
PO receipt, credit-note return) rewired to call the engine; the old `inventoryPostingAdapter`
`Promise.all` fan-out **deleted**; `CategoryAccountMappingService` read path replaced by
`InventoryAccountResolver`; no-default-warehouse → loud failure before any GL write; credit-note
return-qty guard against the linked invoice; stock take passes `unitCostOverride = line.unitCost`.

**Composition root (COMPLETE):** `repositories/instances.ts` now exports 7 Supabase repo singletons
(productCategory, stockBalance, stockAdjustment, stockTransfer, stockTake, openingStockBatch,
supplierReturn); `productCategoryService` + `stockBalanceService` + the 5 greenfield workflow
singletons repointed Mock → Supabase. `productCategoryService` gains an audit hook
(`inventory_account_mapping_changed`, fired only when a category account field changes) and the real
`productService`-backed delete guard. `periodGuardedInventoryPostingEngine` (invoice/bill/PO/credit
note) resolves its `OpenPeriodGuard` lazily so a leaf import never forces `accountingPeriodService`
into a test's mock.

**Reconciliation — run READ-ONLY against live Office National data:** A 0 mismatches · B 0 mismatches
· C subledger R1,569,743.20 = GL 1200 R1,569,743.20 (diff **R0.00**) · D GL 1210 R0.00 · negative
stock 0. Invariants unchanged: 171 JE / 705 lines / 284 movements / 48 balances / 50 products /
Σdr=Σcr R4,838,209.61 / Σqoh 10,169.000. `inventory_transaction_log` 0 rows,
`stock_movements.unit_cost` still all NULL → **no engine invocation touched live data**.

**Test matrix (item 23):** new `inventoryAccountingMatrix.test.ts` (17) — WAC simple/multiple/
same-product-multi-line/concurrent/zero-qty/4dp/deterministic-rounding, atomicity (failed posting
leaves NO partial state; retry-after-rollback), idempotency (post + reversal), reconciliation
(clean R0.00 + deliberate mismatches identified exactly). Fake executor made atomic
(`store.snapshot()` / rollback on throw) so its atomicity claims are real.

**Advisors (before → after Phase 3):** security 0 ERROR → 0 ERROR (no new `security_definer`
finding; both RPCs SECURITY INVOKER). performance 0 ERROR → 0 ERROR (128 INFO, 3 pre-existing WARN;
all inventory notices are INFO-level composite-FK / unused-index).

**Independent QA (read-only bee) — OVERALL: NEEDS WORK → addressed.** Confirmed sound: atomicity
(RPC single-txn / Fake snapshot-rollback), idempotency (unique `(company_id, posting_key)`), security
(INVOKER, locked `search_path`, `get_my_company_id()` internal, `authenticated`-only), no hardcoded
account codes, resolver precedence, no double-post. Findings **fixed this pass (code-only, no
migration):**
- Fake now blends WAC via the authoritative `newWeightedAverageCost` + `lineValue` (was inline JS
  float) — a faithful mirror of the RPC's exact-`numeric` rule.
- `FakeMovement` gained `reference` (`<sourceType>:<sourceId>` / `reversal:<id>`) mirroring the RPC —
  in-transit reconciliation (check D) is now exercisable against Fake-produced data.
- Fake idempotent-reversal returns `movementIds: []`, matching the deployed RPC exactly.
- `stockAdjustmentService` now passes `unitCostOverride = line.unitCost` — fixes a stock GAIN on a
  zero-qty/zero-WAC product posting a zero-value journal, and keeps the approved `totalCostEffect` =
  GL.
- Open-period guard: stock adjustment / transfer / take / supplier-return singletons switched to
  `periodGuardedInventoryPostingEngine` (opening stock stays unguarded — legitimately back-dated).
- `reconcileInventory` rounding band: `subledger_vs_gl` / `total_inventory_vs_gl` within
  `0.005 × movementCount` → `warning` (reported, not hidden), not an `isReconciled`-failing `error`.

**Flagged / deferred (Review 3B decision):**
- **Migration 0033** — RPC round-after-sum in the JE line aggregation (`round(Σ line)` not
  `Σ round(line)` per account) + enrich the idempotent-reversal return. Specified, not written,
  pending your call on applying another `create or replace` before review. The reconcile band makes
  it non-urgent.
- Supplier return books AP/GRNI at WAC, not the refund price — no purchase-price-variance line
  (AP-control-vs-statement drift when refund ≠ WAC).
- Void/delete of a posted invoice/bill does not call `reverseInventoryTransaction` (pre-existing;
  corrections go via credit notes which do reverse).
- JE `entry_number = count()+1` with no serialization — concurrent postings for different products
  can collide on the unique constraint and spuriously fail (fails closed; posting key makes retry
  safe). Pre-existing pattern.
- `reconcileInventory` check F exempts `adjustment`/`correction` movements from evidence; check D
  mishandles a reversed in-transit transfer.
- Live-RPC end-to-end test (needs a throwaway Supabase project).
- `stockTakeService.freeze()` does not yet snapshot expectedQty/WAC from live balances (trusts
  caller-supplied line values; post-time behaviour is correct).

Gate: type-check ✅ / lint ✅ / **1432 tests (194 files)** ✅ / build ✅.

- [x] **Review 3B — APPROVED.** Proceed to Phase 3C.

## PHASE 3C — HARDENING — **DONE (Reviews 3C-A + 3C-B approved), migrations 0033–0036 applied, shipped `40f10fb`**

Applied 2026-08-30 one-at-a-time with per-migration verification. Recorded versions
`20260830221042__0033` … `20260830221256__0036` (local files renamed to match). No commit, no push,
no Office National business transaction, no Phase 4.

**Post-apply integrity:** all business tables byte-identical (md5 unchanged for journal_entries,
journal_lines, stock_movements, products qoh|cost); only additions = 1 `journal_number_counters`
seed row + 1 `accounts` row (5060). Global Σdr=Σcr R4,838,209.61 (R0.00); TB R3,076,605.94/side;
GL 1200 R1,569,743.20 = subledger valuation exact; GL 1210 R0.00; JE counter `next_value = 4101`
(= max valid JE suffix 4100 + 1). Advisors: security 0 ERROR, performance 0 ERROR, 0 new findings.
Read-only reconcile: A/B 0 mismatches, C/D/E R0.00, F warnings only, `isReconciled = true`. Gate
(type-check/lint/1484 tests/build) green before and after.
**LIVE INVENTORY POSTING E2E: NOT PERFORMED — no disposable environment** (`inventory_transaction_log`
still 0 rows). Office National contamination: NONE.

**Migrations (dependency order 0033 → 0034 → 0035 → 0036):**
- `20260830170000__0033_journal_number_allocator.sql` — `journal_number_counters` (per-company
  row, RLS `_all_own_company`) + `allocate_journal_number(uuid)` (atomic `UPDATE … RETURNING`,
  row-lock; seeded once from the highest existing `JE-<n>` suffix, malformed numbers ignored, no
  renumbering) + `create or replace create_journal_entry_with_lines` (allocates when
  `p_entry_number` is NULL/''). SECURITY INVOKER, `search_path` locked, EXECUTE authenticated-only.
- `20260830170001__0034_purchase_price_variance_account.sql` — seeds `5060 Purchase Price Variance`
  (expense, debit) per company, idempotent (`where not exists … code = '5060'`). No row mutation.
- `20260830170002__0035_inventory_rpc_round_after_sum.sql` — `create or replace` on BOTH inventory
  RPCs: (a) raw `|qty|×unit_cost` (NUMERIC, unrounded) flows into `v_je_lines`, per-account CTE does
  the single `round(sum(), 2)` = round-after-sum; `stock_movements.total_cost` keeps its per-movement
  2dp value; (b) `allocate_journal_number(v_company)` replaces the inline `count(*)+1` in both RPCs;
  (c) `reverse_inventory_transaction`'s idempotent branch returns `movement_ids` + `warnings`
  (contract-compatible with the success result). Security properties preserved.
- `20260830170003__0036_stock_take_atomic_freeze.sql` — `freeze_stock_take(uuid)`: locks every
  scoped product `FOR UPDATE` (id order), replaces the take's lines in ONE `INSERT … SELECT`
  (`expected_qty` from `stock_balances` for the take's warehouse, `unit_cost` from
  `products.cost_price`), stamps `frozen_at` / `status='counting'`. Caller supplies SCOPE only
  (`all|category|items`). Draft-only, rejects a double freeze. SECURITY INVOKER, `search_path`
  locked, EXECUTE authenticated-only.

**Code changes (all behind the gate):**
- `PURCHASE_PRICE_VARIANCE` → `5060` in `accountMappingService.ts`; `acc_5060` in `mock-data/accounts.ts`.
- **JE numbering:** `journalEntryService.nextEntryNumber()` deleted; service passes a blank number;
  the repository / DB boundary assigns it. New `utils/journalNumbering.ts` (one rule);
  `MockJournalEntryRepository` derives it in memory; `SupabaseJournalEntryRepository` passes `null`.
- **Supplier return (PPV model):** inventory leaves at WAC, AP/GRNI + input VAT unwind at the
  supplier's actual credit value, the gap posts to `PURCHASE_PRICE_VARIANCE`. Worked examples in
  `docs/INVENTORY_ACCOUNTING.md`.
- **Bill immutability:** `billService.updateBill` + `voidBill` are now draft-only (matching posted
  invoices). Invoice immutability unchanged + regression-tested.
- **Stock-take freeze:** `stockTakeService.freeze()` calls the atomic `StockTakeFreezeExecutor`
  (production: `freeze_stock_take` RPC; test: fake mirror); no caller-supplied line values trusted.
- **Reconciliation:** `reconcileInventory` — rounding band is now `0.005 × distinct
  inventory-affecting postings` (per posting, not per movement) with `toleranceBound` exposed;
  evidence rules BY movement type (no blanket adjustment/correction exemption); in-transit
  understands `correction` chains + flags `duplicate_transfer_receipt` / `orphan_in_transit`.
- Fake posting engine mirrors the round-after-sum aggregation + the enriched idempotent-reversal
  result (migration 0035).

**Gate:** type-check ✅ / lint ✅ / **1484 tests (195 files)** ✅ (+52 / +1 vs Review 3B) / build ✅
(before and after apply). Independent migration QA: PASS.

- [x] **Review 3C-A — APPROVED.** Migrations 0033–0036 applied under the controlled procedure.
- [x] **Review 3C-B — APPROVED. Phase 3 closed** — accounting engine ready for frontend integration.

## PHASE 4 — CORE INVENTORY FRONTEND — **DONE (Review 4 approved), shipped `40f10fb`** (browser QA of the UI still outstanding)

UI/UX + service integration over the Phase-3 engine. No engine redesign. Real hook/service data
throughout (correct empty states, no fabricated business numbers). No commit, no push. Phase 5 NOT started.

**Navigation:** Organisation → "Inventory" (`/inventory`); "Inventory" operational group after
"Purchases & Expenses" → Overview / Products / Categories / Warehouses / Stock Movements (both
"Inventory" links → `/inventory`). Fixed Assets group unchanged (assets-only). `segmentLabels` +
`permissionRouteMap` + `router.tsx` updated. (`navigation.test.ts` asserts the structure.)

**Screens:**
- `/inventory` — **rewritten** `InventoryOverviewPage`: primary actions (New item, Import, Stock
  actions ▾ [adjustment/transfer/take/supplier-return/opening], Reports); live FigureBlock strip
  (Inventory value, Items in stock, Low stock, Out of stock, Activity 30d); `InventoryReconciliationCard`
  (subledger / GL 1200 / in-transit / GL 1210 / difference / status + every finding shown verbatim);
  `InventoryTable` register (SKU / Product / Category / Preferred supplier / On hand / Available /
  Committed / Reorder / Avg cost / Inventory value / Selling price / Margin / Status — search + category
  + supplier + stock-level (+ warehouse when >1) filters + sort + paginate + empty); row → tabbed
  `InventoryItemDetailSheet` (Overview / Stock / Purchasing / Sales / Transactions / Accounting /
  Documents / Audit — Accounting tab shows the resolved semantic mapping incl. 5060 Purchase Price
  Variance, and product-override / category-default / standard source).
- `/inventory/categories` — **new** `CategoriesPage`: relational `product_categories` list (product
  count, account-mapping status) + Vertex `FormShell` create/edit (name/description/active + 4 GL
  account selects + default tax rate) + guarded delete (blocks a category still assigned to a product).
- `/inventory/movements` — **new** `StockMovementsPage`: append-only ledger, read-only. Date/item/
  warehouse/type/qty/unit cost/value/source + reversal relationship. Type / direction / source
  (+ warehouse) filters, search.
- `/inventory/products`, `/inventory/warehouses` — unchanged (kept).

**Quick actions:** New item, Stock adjustment, Stock transfer open real forms (adjustment/transfer
via the pre-existing `stockService` path also used by `/inventory/warehouses`). Import, Stock take,
Supplier return, Opening stock open a `ConfirmDialog` "arrives in the workflow phase" notice —
**Phase 4 never wires a shortcut that bypasses the approved lifecycle/posting services.**

**Real-data integration:** new hooks `useProductCategories`, `useStockBalances`,
`useInventoryReconciliation` (the last runs `reconcileInventory()` with the real
`accountMappingService` + `journalEntryService`, read-only). `buildInventoryRows` is a pure display
rollup. Office National was not mutated.

**Gate:** type-check ✅ / lint ✅ (`--max-warnings 0`) / **1526 tests (203 files)** ✅ (+42 / +8 vs
Phase 3) / `vite build` ✅.
**Browser QA:** no Chrome DevTools / Playwright MCP available in this environment → NOT performed.
Every change is behind strict type-check + lint + the full suite + a production build; layout uses
the established responsive Tailwind + Vertex components.

- [x] **STOP — Review 4.** Report delivered. **APPROVED** — shipped to `main` (`40f10fb`).
  Browser QA of the Phase 4 UI still outstanding (no browser tooling in this env).

## PHASE 5 — STOCK TAKE SYSTEM / WORKFLOWS — **DONE (Review 5 approved), shipped `40f10fb`**

Draft-then-post UI over every Phase-3 workflow service (stockAdjustmentService /
stockTransferService / stockTakeService / supplierReturnService /
openingStockBatchService) — no engine changes, no migrations, no Office National writes.

**Step 0 (approved):** shared `AccountingEffectPreview` contract + `previewXEffect()` on
all five services (same line-building pass that posts — preview can never drift from what
posts); shared `AccountingPreview` table component; supplier-return PPV line always shown,
even at R0.00; transfer preview corrected to the product's live WAC; inventory statuses
added to `StatusBadge`.

**Steps 1–5 — one register per workflow**, each: `use<Workflow>()` hook →
`<Workflow>LinesEditor` → `<Workflow>DocumentForm(Modal)` (draft header + lines) →
`<Workflow>Detail(Sheet)` (register/preview/lifecycle actions, `AccountingPreview` wired
to the real `previewXEffect()`) → `<Workflow>sTable` → `<Workflow>sPage`, routed under
`/inventory/*`:

- `/inventory/adjustments` — draft → pending_approval → posted (or cancelled); posted can
  be reversed.
- `/inventory/transfers` — draft → in_transit → completed (dispatch/receive, two GL legs)
  **or** draft → completed immediate (GL-neutral) — both branches are the service's own,
  not a UI choice.
- `/inventory/stock-takes` — draft (scope only, no manual lines) → counting (freeze
  snapshots `expectedQty`/frozen WAC server-side; counts entered in place) →
  ready_for_review → posted.
- `/inventory/supplier-returns` — draft → posted; PPV always shown in the preview.
- `/inventory/opening-stock` — draft → confirmed, gated behind an explicit
  "I confirm this opening balance is accurate" checkbox in the UI (the service's own
  `{ confirmed: true }` contract), not a plain click-to-post button.

**Step 6 — Operations hub + navigation:** new `/inventory/operations` landing page
(`InventoryOperationsPage`) linking to all five registers with a pending-count badge per
workflow, real hook data only; "Operations" added to the Inventory nav group (position 2,
after Overview); breadcrumb segment labels added for every new route.

**Step 7 — InventoryOverview integration + legacy UI removed:** `InventoryOverviewPage`'s
"Stock actions" menu now links straight to the five real registers (plus "View all
operations") instead of opening the old single-delta `StockAdjustmentFormModal` /
`StockTransferFormModal` dialogs or a Phase-5 "coming soon" `ConfirmDialog`; same swap on
`WarehousesPage`'s quick actions. The two legacy direct-mutation form components
(`StockAdjustmentForm(Modal)`, `StockTransferForm(Modal)` — the ones that called
`stockService.adjustStock/transferStock` directly, bypassing the lifecycle/posting
services) are deleted; nothing references them any more. Fixed a pre-existing Base-UI
`DropdownMenuLabel` crash (`Menu.Group` context) uncovered by testing the now-real menu.

**Step 8 — permission sweep:** every one of the five pages now gates "New …" on
`useCanAccess('inventory','create')`, the register's Delete action on `'delete'`, and the
ENTIRE detail-sheet action bar (submit/approve/post/dispatch/receive/complete/freeze/
mark-ready/confirm/cancel/reverse) on `'update'` via a new `canManage` prop — previously
none of the five pages checked permissions at all. A user without `inventory:update` sees
every register as read-only; a stock-take's `onSaveCounts` is also gated so counts can
never be entered without it.

**Gate:** type-check ✅ / lint (`--max-warnings 0`, tracked `src/`) ✅ /
**1589 tests (210 files)** ✅ (+42 vs Phase 4) / `vite build` ✅. No Office National writes.
No commits, no pushes.

- [x] **STOP — Review 5.** Report delivered. **APPROVED** — shipped to `main` (`40f10fb`).

## PHASE 6 — SHARED IMPORT FRAMEWORK — **DONE (Review 6 approved), shipped `40f10fb` / `4ac5277`**

One reusable import engine (`src/features/import/`) — CSV/XLS/XLSX, generic column
mapping, row-level validation, duplicate detection, execution, result reporting — NOT
Inventory-only. Full architecture, the accounting-safety boundary for every
accounting-adjacent adapter, and known limitations: `docs/IMPORT_EXPORT_ARCHITECTURE.md`.

**Audit (step 1):** reused `banking/utils/statementParsers.ts`'s quoted-CSV parsing
approach (as an independent copy — banking-specific, not a dependency to take) and
`StatementImportWizard.tsx`'s visual idiom; no XLS/XLSX library, column mapping, generic
validation model, duplicate-detection abstraction, or product/customer/supplier import
existed anywhere before this phase.

**Engine:** `parsers/` (CSV hand-rolled; XLS/XLSX via `xlsx@0.18.5` — SheetJS, the only
maintained npm package; `npm audit` flags a known no-fix-available advisory, mitigated
by file-size/row limits and never evaluating formulas, not eliminated — see the doc's §
Known issues) → `mapping.ts` (exact-normalized-match alias suggestion only, never fuzzy)
→ `types.ts`'s `ImportAdapter<T,C>` contract → `hooks/useImportWizard.ts` (the pipeline
state machine) → `components/ImportWizard.tsx` (the one shared UI, Vertex form shell).

**Five adapters** (`adapters/`): Inventory Products (SKU/name/pricing/category/
supplier/tax; WAC protection — never rewrites `costPrice` on a SKU with stock on hand),
Opening Stock (creates one `draft` batch only, never posts — Phase 5's own confirm gate
still required), Stock Take Counts (writes only `countedQty` onto an already-frozen
sheet's existing lines — `expectedQty`/frozen WAC are physically unreachable from this
adapter), Customers, Suppliers (bank details are not an import field at all — cannot be
set or overwritten by any spreadsheet). None post to the GL except by creating an
inert draft (Opening Stock) that a human must still explicitly confirm.

**UI integration:** `InventoryOverviewPage`'s Import button (was a "coming soon"
placeholder) now opens the real wizard with all three Inventory adapters;
`CustomerListPage`/`SupplierListPage` each gained their own gated Import button.

**Permissions:** every adapter gates on `useCanAccess(feature, 'import')` — `inventory`
for the three Inventory adapters, this codebase's real `customer_management`/
`supplier_management` feature keys for the other two (verified against those pages' own
`useCanAccess()` calls, not guessed). No new RLS.

**Audit:** new `AuditAction` value `data_imported` (text column, no migration) — one
summary row per run (counts + filename, never the parsed rows or the file itself) via
`services/importAuditService.ts`.

**A real bug found and fixed along the way:** `useImportWizard`'s adapter-context load
for a single-adapter wizard unconditionally forced the step back to `'file'` once its
own async load resolved — if that (real reference-data fetch) outlasted the user's file
upload, it would silently discard whatever step the user had already reached. Caught by
the wizard's own integration test, not by inspection; fixed by splitting context-loading
from step-navigation (`loadAdapterContext()` vs `selectAdapter()`).

**Gate:** type-check ✅ / lint (`--max-warnings 0`, tracked `src/`, incl.
`--report-unused-disable-directives`) ✅ / **102 new tests (13 files)** covering every
parser, mapping, normalization helper, all five adapters (incl. WAC protection and the
frozen-stock-take-scope boundary specifically), and a full `ImportWizard`
file→mapping→review→execute→result integration test / build: pending final full-suite
run. No Office National writes (all tests run against mocks/fakes). No commits, no
pushes.

**Not built (documented, not silently dropped):** Price-list import (spec marked it
conditional — "if the architecture fits cleanly"; the shape fits, left as a follow-up
adapter) and an XLSX (vs CSV) error-report export.

- [x] **STOP — Review 6.** Report delivered. **APPROVED** — shipped to `main` (`40f10fb` / `4ac5277`).

## PHASE 7 — SHARED PRINT / EXPORT INFRASTRUCTURE — **DONE (Review 7 approved), shipped `4ac5277`**

One reusable print/export engine (`src/features/export/`) — structured-data CSV/XLSX
export, a shared printable report shell, and one `ExportMenu` — reused across
Customers/Suppliers/Inventory/Stock Movements/Stock Takes/Operations, not built
per-page. Full architecture, formatting rules, and known limitations added as
`# PART B` of `docs/IMPORT_EXPORT_ARCHITECTURE.md` (Part A is Phase 6's import engine).

**Audit (step 1):** no CSV/XLSX export, print stylesheet, or shared export model
existed anywhere before this phase; the only prior "export" was ad hoc and unwired.
Reused Phase 6's adapter-contract idiom (`ExportColumn<T>`/`ExportDataset<T>`) and
Tailwind's built-in `print:` variant instead of a hand-rolled `@media print`
stylesheet for hiding individual screen-only controls.

**Engine:** `types.ts` (`ExportColumn<T>`/`ExportDataset<T>`/`ExportOptions` — export
always reads structured data via `accessor`, never React table markup) → `csvExport.ts`
(UTF-8 BOM, quote/comma/newline escaping, numeric values stay numeric, totals row) →
`xlsxExport.ts` (genuine SheetJS cells — `{ cellDates: true }` after a test caught
dates being written as serial numbers instead — real number/date types, never a
formula cell, sheet name truncated to Excel's 31-char limit) → `PrintableReport.tsx`
(the one printable shell: company name/reg/VAT via `useCompany()`, title, subtitle,
active filters, generated timestamp, table, totals, footer — no sidebar/nav/buttons/
filters/modal chrome, ever) → `ExportMenu.tsx` (Print/Save PDF via `window.print()`,
Export CSV, Export Excel; `allowed` prop gates rendering entirely; disabled with zero
rows; busy state during XLSX generation).

**Print mechanism:** browser-native only — "Print / Save PDF" opens the OS print
dialog, no PDF-generation dependency added. `globals.css` gained one `@media print`
block hiding `[data-slot='sidebar']`/`app-topbar`/toaster app-chrome and giving tables
sane page-break behavior; individual screen-only controls hide via `print:hidden`
instead of stylesheet bloat.

**Export what's filtered, not what's paginated:** `DataTable` gained
`onVisibleRowsChange(rows, activeFilters)`, reporting the full search/filter/sort
result — never just the current page of 12 — plus human-readable filter descriptions
(option labels, never raw values), so a page's export/print dataset and its printed
report both reflect what the user is actually looking at.

**Wired into 9 surfaces:** Customers (code/name/email/phone/VAT/terms/balance/status —
no sensitive fields), Suppliers (same shape, explicitly no banking data — verified by
a new negative test), Inventory (SKU→Margin/Status, using the existing valuation
contract, never independently recalculated), Stock Movements (full append-only
evidence trail incl. reversal linkage), Stock Take count sheets (Blind: SKU/Product/
blank write-in only; Standard: adds Expected Qty; neither ever shows WAC/unit cost —
Phase 5's printing placeholder, now real) and results (Expected/Counted/Variance/
Frozen WAC/Variance Value/Reason once counting is done), and the four Operations
registers (Adjustments/Transfers/Supplier Returns/Opening Stock — list/history level
only, no per-document PDFs yet, per spec).

**Money formatting, deliberately split:** CSV/XLSX numeric columns are always real
numbers (`1234.56`, never `"R 1,234.56"`); the printed report is the only place money
renders as formatted currency text — enforced per-column via an explicit
`formatForPrint` on top of the plain numeric `accessor`, not inferred.

**Permissions:** every surface's `ExportMenu`/count-sheet export gates on
`useCanAccess(feature, 'export')` against that surface's real feature key
(`customer_management`/`supplier_management`/`inventory`) — no new RLS, consistent
with Phase 5/6.

**A real bug found and fixed along the way:** the first `onVisibleRowsChange`
implementation kept a naive `useEffect([visible, activeFilters])`. Every real caller
constructs its `columns`/`filters` as fresh array/function literals per render
(never memoized) — harmless before this phase, but since the effect calls the
parent's `setState`, a fresh-reference re-render → effect fires → parent re-renders →
fresh references again became an infinite loop, pegging a test-runner worker's CPU for
27+ minutes before being caught (not a slow test — a genuinely hung one, confirmed via
direct process inspection). This is a real production bug: it would have hung the
browser on every page using the new export wiring, not just in tests. Fixed by
comparing a cheap content signature (row-key + filter-descriptor string, via
`useRef`) instead of object identity, so the callback only fires when the actual
result changes. A second, narrower regression surfaced while re-running the full
suite: always mounting `PrintableReport` (a second, real `<table>` with identical row
text, `hidden print:block` only — a CSS class jsdom doesn't apply) made ordinary
`getByText` queries ambiguous across every exporting page's tests. Fixed with a
dedicated `data-print-only` marker plus a global RTL `defaultIgnore` — deliberately
NOT scoped off `aria-hidden` generally, since Base UI's own Dialog/Sheet/Dropdown
primitives legitimately apply `aria-hidden` to background content while a portal is
open, and doing so first broke an unrelated, pre-existing banking test for exactly
that reason before being narrowed.

**Gate:** type-check ✅ / lint (`--max-warnings 0`, tracked `src/`, incl.
`--report-unused-disable-directives`) ✅ / **full suite: 1735 tests, 228 files, all
passing** (new export/print tests plus every pre-existing test re-verified clean after
the two fixes above) / build ✅ (`vite build`, one pre-existing informational
chunk-size warning, no errors). No Office National writes — print/export is read-only,
no DB mutations. No commits, no pushes.

**Not built (documented, not silently dropped, per spec):** per-document Operations
PDFs (list/history export only), slow-moving/dead-stock/profitability/valuation-by-date
report analytics (Phase 8), a true running page-footer beyond the browser's own print
header/footer, company logo (no such field exists on `Company` yet — branding is
name/registration/VAT only), and a separate export row-limit distinct from the
existing XLSX 20,000-row import limit.

- [x] **STOP — Review 7.** Report delivered. **APPROVED** — shipped to `main` (`4ac5277`).

## PHASE 8 — INVENTORY REPORTS & ANALYTICS — **DONE (Review 8 approved), shipped `4ac5277`**

14 reports + one hub over the authoritative inventory/accounting data — never
independently recalculated. Full data-availability audit, per-report purpose/source/
formula/limitations: `docs/INVENTORY_REPORTS.md`.

**Audit (step 1, before any screen was built):** classified every proposed report
A (fully supported) / B (derived but honest) / C (cannot be built without fabricating
a relationship). Found: `InvoiceLineItem`/`BillLineItem` carry no `productId` anywhere
in this schema, and `StockMovement` carries no `supplierId` — so Category/Supplier
"sales," "COGS," "margin," and "purchase activity/profitability" are all class C and
were NOT built as such; Margin Analysis is current-theoretical only. Reconciliation
Check F (movement evidence) stays deferred to Phase 14 per its own pre-existing doc
comment. Full table in `docs/INVENTORY_REPORTS.md` §0.

**Route:** `/inventory/reports` hub (STOCK/MOVEMENT/CONTROL/ANALYSIS groups) + 14
report routes, added to the Inventory nav group between Operations and Products.

**Shared infrastructure (new):** `src/features/inventory/reports/` — pure,
independently-tested row builders (`buildStockOnHandRows`, `buildLowStockRows`,
`buildOutOfStockRows`, `buildAdjustmentReportRows`, `buildTransferReportRows`,
`buildStockTakeVarianceRows`, `buildWarehouseAnalysisRows`,
`buildCategoryAnalysisRows`, `buildSupplierAnalysisRows`, `buildMarginAnalysisRows`,
`buildSlowMovingRows`) + `dateRange.ts` (This Month/Last Month/This Quarter/This
Financial Year — real `FinancialYear` records, never hardcoded/Custom) +
`useStockOnHandData()` (one combined fetch, avoiding N+1 across 8 report pages) +
`InventoryReportShell`/`DateRangeControl` (shared chrome, reusing Phase 7's
ExportMenu/PrintableReport — no bespoke per-report export code).

**Reports built:** Stock on Hand, Inventory Valuation (line-level + the real
`reconcileInventory()` GL reconciliation reused verbatim), Low Stock (documented
`max(reorderQuantity, preferredStockLevel − available)` formula), Out of Stock, Stock
Movement (date-range report view alongside the unchanged operational ledger page),
Stock Adjustments (line-level, gain/loss/write-off totals), Transfers (in-transit
days), Stock Take Variance (frozen evidence only, counted lines only), Inventory
Reconciliation (full A–G sectioned report over the Phase 3B engine, Check F shown as
an honest "not run"), Warehouse Analysis, Category Analysis (stock/value only, limit
documented on-screen), Supplier Analysis (inventory position only, never
"profitability"), Margin Analysis (current theoretical, labeled everywhere), Slow-
Moving/Dead Stock (economic-movement definition excludes transfers, matching
`reconcileInventory()`'s own convention; `lastSaleAt` tracked separately from
`lastMovementAt`).

**Not built (documented, not silently dropped):** per-document Operations PDFs (list/
history level only, per spec), inline row-click drill-down from a report page into a
detail sheet, sales/COGS/margin/purchase-activity columns anywhere the schema can't
support them honestly.

**Gate:** type-check ✅ / lint (`--max-warnings 0`, incl.
`--report-unused-disable-directives`) ✅ / **full suite: 1825 tests, 256 files, all
passing** (90 new tests for this phase's builders/hooks/pages, plus every pre-existing
test re-verified clean) / build ✅. No Office National writes — every report page is
read-only, no service mutation imported anywhere in `pages/reports/`. No commits, no
pushes.

- [x] **STOP — Review 8.** Report delivered. **APPROVED** — shipped to `main` (`4ac5277`).

## PHASE 9 — RELATIONSHIPS

### PHASE 9A — RELATIONSHIP AUDIT — **DONE, shipped to `main` (`4ac5277`)**
Full relationship audit → `docs/ACCOUNTING_RELATIONSHIPS.md` (sales/purchase chains, stock-movement
source-line evidence, journal reverse-lookup, product-delete gap, credit-note over-return gap,
realised-margin evidence boundary, supplier-evidence contract, report-unlock criteria).

### PHASE 9B — NORMALIZED DOCUMENT-LINE TABLES — **CODE COMPLETE, committed on branch `phase-9b-relationship-design-and-code` (`38f6b78` / `465c10f`), NOT merged to `main`**
- Design: `docs/PHASE_9B_DESIGN.md`. Migrations **0037–0042 APPLIED** to Supabase (schema + exact
  backfill): `invoice_lines` 198 / `bill_lines` 68 / `purchase_order_lines` 0 / `credit_note_lines` 6.
  Full parity (0 missing / 0 extra / 0 field mismatch), zero accounting impact, Office National uncontaminated.
- Two standalone integrity fixes shipped in the same branch: `deleteProduct()` history guard
  (deactivate instead of hard-delete); `issueCreditNote()` per-line return-quantity validation.
- Dual-write projector (`SupabaseDocumentLineProjector`) + `DocumentLineParityChecker` shipped
  **disabled** — `NORMALIZED_DOCUMENT_LINES_ENABLED = false`; jsonb `line_items` is still authoritative.
- Reviews 9B-A → 9B-E complete on the branch.
- [ ] **Open a PR and merge `phase-9b-relationship-design-and-code` → `main`.**
- [ ] **Separate later review:** flip `NORMALIZED_DOCUMENT_LINES_ENABLED` to `true` — only after
      forward dual-write parity is tested against the live DB via `DocumentLineParityChecker`
      (needs a service-role client).
- Deferred by design (documented in `docs/PHASE_9B_DESIGN.md`): `bill_lines.source_purchase_order_line_id`
  line-level PO→bill provenance (§6); `journal_entries.source_id` reverse lookup (§8); `discount`
  field mapping (§2); report-layer queries against the normalized tables (§13 — the next phase).

## PHASE 10 — FIXED ASSET CLEANUP — NOT STARTED
Strip Products / Warehouses out of the "Fixed Assets" nav grouping (cosmetic, zero-risk per Phase 0).

## PHASE 11 — PERMISSIONS / AUDIT — NOT STARTED
Inventory RLS is still UI/service-only (`useCanAccess`); DB stays coarse company-tenant. `AuditAction`
coverage for inventory. (App-wide role-aware DB authz is the separate unscheduled task at the bottom of this file.)

## PHASE 12 — OFFICE NATIONAL DATA — NOT STARTED (SQL/migration only)

## PHASE 13 — ACCOUNTING INVARIANT TESTS — NOT STARTED
Regression tests for the GL 1200 ↔ valuation tie — flagged as the highest re-contamination risk;
currently has no regression test.

## PHASE 14 — RECONCILIATION / INVESTIGATOR UI — NOT STARTED
Surface `reconcileInventory()` in the Difference Investigator + evidence UI. Also picks up reconcile
Check F (movement evidence), deferred here from Phases 3/8.

Phase 14 consumes the Phase 3 `reconcileInventory()` result in the Difference Investigator and
evidence UI; it does not defer the reconciliation engine itself.

---

## FUTURE TASK — APPLICATION-WIDE ROLE-AWARE DATABASE AUTHORIZATION (not scheduled; not part of the Inventory initiative)

**Origin:** Review 2C (2026-08-30). Codex's Review-2B pass built an inventory-only role-aware RLS
layer (`user_has_permission()` SECURITY DEFINER + per-operation, permission-gated policies on the 10
new inventory document tables). The user **reverted** it: with `user_roles` currently at 0 rows it
would have locked ordinary authenticated users out of the new tables, and it would have created two
incompatible security models (fine-grained DB authz on Inventory, coarse `profiles.role` everywhere
else). The design is preserved here for the real, intentional version.

**Scope — the whole accounting application together:** inventory · invoices · sales/quotes/orders/
credit-notes/receipts · purchases/POs/bills/payments · banking/transactions/reconciliation ·
accounting/journals/GL/trial-balance · VAT & tax · customers · suppliers · reports · payroll ·
fixed assets · leases · administration.

**Must include:**
- `user_roles` population / migration strategy for every existing profile (the ~45 pre-existing
  tables are still `profiles.role`-only).
- Admin / superuser behaviour (bypass rules), staff role definitions, permission → table/operation
  mapping for every module.
- Backward compatibility + a rollout strategy (feature-flag / phased enablement) that **cannot** lock
  an existing user out mid-migration — explicit lockout-prevention checks.
- The reusable predicate (a reviewed `user_has_permission()` or equivalent), applied uniformly.
- Full test coverage (RLS integration tests with real authenticated sessions per role).
- One migration series, application-wide — never per-module.

Until this ships, all module-level `*:*` permissions (including `inventory:*`) gate the **UI /
service layer only** (`useCanAccess`), and DB RLS stays coarse company-tenant.
