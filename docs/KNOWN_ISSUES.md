# Known Issues

Running log of real issues hit during hive development — not a bug tracker for the
product itself (no real users yet), but a record of things that were true problems
during the build, whether fixed, worked around, or still open. Newest first within
each section.

## Open

### 2026-09-05 (FINAL CORE HARDENING run) — normalized lines ACTIVATED, app-wide permission catalog, migrations 0063 + 0064

Branch `hardening-2026-09-05` (off `main` `f7ec377`). `main` untouched. Gate: **2739 tests / 332 files**,
tsc / eslint (`--max-warnings 0`) / build clean. Live accounting byte-identical to the pre-run baseline
(TB 0.00, GL 1200 = physical inventory R1,478,853.74, 247 JE / 928 lines / 343 movements, 0 negative /
0 unbalanced / 0 cross-company / 0 normalized-line orphans). Security advisors: 88 WARN / 0 ERROR
(unchanged — 0063 is a data UPDATE, 0064 is catalog INSERTs, neither adds a function or touches RLS).

**RESOLVED / DONE this run:**
- **Normalized document lines ACTIVATED** — `NORMALIZED_DOCUMENT_LINES_ENABLED = true`. Controlled
  procedure: flag-off-window scan (only INV-1068/1072/1074 touched since the seed, by the 5B.1
  `salesOrderLineId` jsonb backfill — a non-projected field, parity already fine); read-only SQL parity
  sweep replicating `DocumentLineParityChecker`; migration **`0063`** NULLed 58 seed-written stray
  `warehouse_id` values (invoice 40 / bill 10 / PO 7 / CN 1 — the jsonb line has no `warehouseId`,
  0042's backfill and the live projector both write NULL there); re-swept → 340/340 MATCH, 0
  orphans/dupes/count-mismatches/cross-company; rollback-wrapped live forward-write smoke test of
  `create_invoice_from_sales_order(p_project_lines := true)` → exact field-for-field parity, 0 persisted;
  flipped the flag + updated 3 tests. Only the WRITE side is gated; no reader consults the normalized
  tables yet; jsonb `line_items` stays authoritative. Full detail: `docs/PHASE_9B_DESIGN.md` § 4c.
  Rollback: flip to `false` (dual-write stops, no data loss); 0063 reversible — re-set `warehouse_id =
  '692a3d01-9835-4340-b5ab-44fe96067490'` on the 58 seed line ids matching
  `5eed0000-0000-4000-8000-(31|71|61|41)%` (full list in 0063's `raise notice`).
- **App-wide permission catalog** — migration **`0064`** added 9 features (`sales_documents`,
  `fulfilment`, `purchasing`, `banking`, `assets`, `tax`, `compliance`, `financial_periods`, `audit`),
  38 permission rows, 86 system-role grants, under the brief's APPROVED policy. `permissionRouteMap.ts`
  + `router.tsx` `<PermissionRoute action="read">` on every previously-ungated Sales/Purchasing/Banking/
  Assets/Tax/Compliance/Periods/Audit route. `useCanAccess()` action gates on the primary create/record
  controls of Quotes / Sales Orders / Credit Notes / Customer Receipts / Purchase Orders / Bills /
  Supplier Payments, plus the Financial-Periods close/lock/reopen controls + a "can't lock the period
  covering today" self-lockout guard. Tests: `permissionCatalogHardening.test.ts` (36),
  `FinancialPeriodsPage.test.tsx` (gate + self-lockout). **No lockout:** `user_roles` = 0, only
  functional users are admin + superuser (bypass `useCanAccess`), the 4 viewer profiles have
  `company_id = NULL`; 0064 writes zero `user_roles` / zero `profiles` rows. **RLS unchanged.**
  Full grid + rationale: `docs/PERMISSIONS.md` § "Ungated areas — CLOSED 2026-09-05".
- **FIFO gate** — re-confirmed: `FIFO_VALUATION_ENABLED = false` unchanged, 0 live products on `fifo`,
  `ProductForm`/`ProductService` gate still enforced (tests green in the full suite). No `SupabaseStockLotRepository` built (post-v1).

**STILL OPEN / DEFERRED (POST-V1, non-blocking):**
- **Exhaustive per-button action gating.** Banking / Assets / Tax / Compliance pages and the document
  *detail* pages (post / reverse / void / issue buttons) are NOT yet individually `useCanAccess()`-gated.
  The route-level `:read` gate already fully blocks every role lacking read on those features; the
  residual is a role with `:read` but not full mutation (chiefly `finance_manager`, a trusted senior
  role) still seeing a mutation button that then hits RLS — defense-in-depth, not a hole. Folds into the
  human-QA UI-polish pass.
- **jsonb `line_items` warehouse enrichment.** All 40 divergent invoice lines 0063 nulled DO have a
  posted, immutable `stock_movements` row confirming "Main Distribution Centre". Enriching the
  authoritative jsonb from those movements (instead of nulling the projection) is a defensible
  data-quality improvement — deliberately NOT taken here because it mutates the authoritative source
  during a controlled non-destructive activation. Needs its own explicit decision.
- **Normalized-line reader migration.** Nothing reads `*_lines` as authoritative yet. Switching
  reports / search / traceability to join the normalized tables instead of re-parsing jsonb is separate
  future work (explicitly out of Phase 9B scope).
- **Human browser QA** — still required (no browser tooling here). Now also a role-based click-through of
  the permission gates + a create/edit smoke of each document type with the normalized flag on.
  Checklist: `docs/CURRENT_TASKS.md` § P1.

**Database writes this run:** `apply_migration` × 2 — `0063` (one `do $$` block, 58-row UPDATE across
the 4 `*_lines` tables, guarded by an exact-count assertion) and `0064` (INSERT into `permissions` +
`role_permissions`, `on conflict do nothing`, guarded by 38/86 count assertions). One rollback-wrapped
`execute_sql` transaction for the forward-write smoke test (0 rows persisted, re-verified: invoices 83,
invoice_lines 240). No other live writes.

### 2026-09-05 (Block A + B run) — 0061/0062 applied live, FIFO gated, normalized-lines blocker resolved

Branch `hardening-2026-09-05` (off `main` `f7ec377`). `main` untouched pending human browser QA. Full
detail: `docs/CURRENT_TASKS.md` §§ P0–P4. Gate: **2701 tests / 331 files**, tsc/eslint/build clean.

**RESOLVED this run:**
- **Return Note ↔ Sales Order fulfilment (P0 / migration `0061`)** — APPLIED + live-verified. The DB
  RPCs `post_delivery_note` / `create_invoice_from_sales_order` now run the SAME return-aware formula
  the UI read-model already used (`netDeliveredQty = deliveredQty − returnedUninvoicedQty`, no
  double-subtraction). Proven live (rollback-wrapped): re-delivering previously-returned stock now
  succeeds; over-delivery / over-invoice correctly rejected with the exact remaining figures;
  delivery-note / return-note journals touch only GL 1200 / 1220. The "MEDIUM — re-delivering
  previously-returned stock not netted into `remainingToDeliver`" entry below is now CLOSED.
- **FIFO production trap (P4)** — GATED. `FIFO_VALUATION_ENABLED = false`; `ProductForm` hides the
  option and `ProductService` rejects a new switch to `fifo` at the service layer. 0 live products on
  FIFO, so zero behavioural / accounting impact. `MockStockLotRepository` stays wired but is now
  unreachable through the product forms — the "only Mock repo in prod" finding is de-fanged (still
  worth a real `SupabaseStockLotRepository` before the flag ever flips).
- **Normalized-document-lines SO→invoice blocker (P3 / migration `0062`)** — RESOLVED.
  `create_invoice_from_sales_order` now does an OPT-IN, transaction-atomic `invoice_lines` projection
  from the SAME `v_new_lines` array it writes to jsonb (no recalculation; stale FK → NULL), gated by
  the SAME `NORMALIZED_DOCUMENT_LINES_ENABLED` flag as the TS projector. Forward-write parity proven
  live for both direct and delivery-linked invoices — exact field-for-field, no dupes, no orphans.
  Classification: **READY FOR CONTROLLED ACTIVATION**. Flag still `false` — the flip is its own
  dedicated change (backfill flag-off-window docs → `DocumentLineParityChecker` live → flip → monitor).

**STILL OPEN / STOPPED (at the time of that run — now superseded by the FINAL CORE HARDENING run above):**
- ~~**Permissions rollout (P2)** — STOPPED for product approval.~~ **RESOLVED** — approved by the
  FINAL CORE HARDENING BLOCK brief and applied via migration `0064` (see the run above).
- **Human browser QA** — still required (no browser tooling here). Checklist: `docs/CURRENT_TASKS.md` §P1.

**Database writes this run:** two `apply_migration` DDL calls only (`0061`, `0062` — function
replacement, zero data change). Every live verification was rollback-wrapped; leftover-row counts
confirmed 0. Live accounting byte-identical to the pre-run baseline (TB 0.00, GL 1200 = physical
inventory R1,478,853.74, 247 journal entries / 928 lines / 343 movements, 0 negative stock, 0
unbalanced, 0 orphan/dup normalized lines, 0 cross-company). Security advisors: 88 WARN / 0 ERROR
(unchanged — 0061/0062 are `security invoker`, add none).

### 2026-09-05 (final same-day run) — Pre-merge stabilization: Return Note fulfilment fix, normalized-lines blocker sharpened, Forecasting precision bug fixed

Full detail: `docs/CURRENT_TASKS.md` § "PROJECT STATE" (PERMISSIONS DECISION MATRIX and HUMAN
BROWSER QA CHECKLIST sections live there too). Summary:

- **RESOLVED (code) / AUTHORED NOT APPLIED (DB)** — Return Note ↔ Sales Order fulfilment netting.
  One authoritative formula (`orderedQty`, `deliveredQty`, `returnedUninvoicedQty`,
  `netDeliveredQty = deliveredQty − returnedUninvoicedQty`, `directlyInvoicedQty`,
  `physicalFulfilledQty = netDeliveredQty + directlyInvoicedQty`, `remainingToDeliver = max(0,
  orderedQty − physicalFulfilledQty)`) now lives in `salesOrderFulfilment.ts`
  (`sumReturnedBySalesOrderLine`, updated `sumPhysicallyIssuedBySalesOrderLine`/
  `computeSalesOrderFulfilment`), threaded through `StockCommitmentService`, `SalesOrderForm`,
  `SalesOrderDetailPage`, `CreateDeliveryNotePage`, and `DeliveryNoteService`'s own pre-checks
  (including `buildInvoiceSelectionsForDeliveryNote`, which now nets a delivery line's own returned
  quantity too). Migration `0061_return_note_aware_fulfilment_rpcs` applies the SAME fix to
  `post_delivery_note` and `create_invoice_from_sales_order` (both `create or replace`, no schema
  change) — authored, migration-contract-tested (17 tests incl. a formal quantity-matrix proof,
  `src/repositories/returnNoteAwareFulfilmentRpcs.test.ts`), but **NOT applied live**: this
  session's `apply_migration` call was blocked by its own permission gate (a live function
  change). Until applied, the DB-level guards still reject a valid re-delivery of previously-
  returned stock even though the TS read-model (Sales Order detail page, commitment map) now shows
  it correctly as available — a real, visible UI/DB disagreement to watch for in browser QA.
- **RESOLVED** — GDN-I report ("Goods Delivered Not Invoiced") ignored Return Notes.
  `reconcileGoodsDeliveredNotInvoiced` now nets posted Return Note quantity out of
  `outstandingQty` per delivery-note line (new `returnedQty` field + column), so the report and GL
  1220 stay reconciled once returns exist. Re-proved the Return Note accounting entries while at
  it: `post_return_note` posts exactly `DR 1200 / CR 1220` at the frozen delivery-time cost via
  `costing_mode: 'return_in'` + `unit_cost_override` (confirmed in `post_inventory_transaction`'s
  own sign logic) — no revenue/VAT/AR/COGS line, matching the design doc exactly.
- **NEW finding, sharper than the prior "just needs a smoke test" framing** —
  `NORMALIZED_DOCUMENT_LINES_ENABLED` readiness: `create_invoice_from_sales_order` (the RPC every
  Sales-Order-derived invoice — partial invoicing, delivery-linked invoicing — is created through)
  inserts directly into `invoices` via SQL and is **never routed through
  `invoiceService.createInvoice()`**, so it permanently bypasses `invoiceLineProjector` regardless
  of the flag (confirmed by code: `RpcSalesOrderDraftInvoiceWriter.write()` only calls `getById`
  after the RPC insert, never `.create()`). Confirmed independently live: static parity across all
  4 normalized tables is still perfect (0 mismatched docs/orphans/duplicates/company-mismatches),
  but only because the newest `invoices.created_at` live is `2026-09-02 20:59:58` — zero documents
  of any of the 4 types have been created or edited live since the backfill, so the dual-write path
  has genuinely never been exercised, not merely gone unobserved. Flipping the flag today would
  leave every SO-derived invoice's `invoice_lines` permanently empty. **NORMALIZED_DOCUMENT_LINES_
  ENABLED stays `false`** — not flipped this run.
- **PROPOSED, not applied** — a permissions decision matrix for Purchasing + non-Invoice Sales
  documents (two new catalog features, `purchasing` / `sales_documents`, 8 proposed actions × 6
  existing system roles). See `docs/CURRENT_TASKS.md`. No migration, no `usePermission()` call site.
- **FIXED** — Forecasting: `FinancialPlanService.upsertPlanLine` now rounds `amount` to 2dp before
  writing (`financial_plan_lines.amount` is a plain unscoped `numeric` column, so nothing else
  guarded this) — closes a real precision gap (`100.999` or `0.1+0.2` float drift would previously
  have been stored and summed verbatim). 11 new tests in the previously test-less
  `financialPlanService.test.ts`. Everything else reviewed (income/expense sign handling,
  favourable/unfavourable, zero-budget variance%, month-boundary crossing, empty periods, company
  isolation via RLS) was already correct and already tested in `computeForecastReport.test.ts`.
- **Gate:** tsc ✅ · eslint `--max-warnings 0` ✅ · **2680 tests / 330 files** ✅ (+48/+2 vs the
  completion run) · `vite build` ✅. Live DB re-verified byte-identical to the completion run's own
  figures (TB 0.00, all control accounts unchanged) — confirming zero live writes this run.

### 2026-09-05 (later same day) — Major completion run: what got fixed, what's genuinely left

Following the completion audit below, a large implementation run closed most of the findings it
raised. Full detail: `docs/CURRENT_TASKS.md` § "PROJECT STATE", `docs/RETURN_NOTES_DESIGN.md`.

**CLOSED this run:** the leaked `INV-2026-0001` smoke-test artifact (deleted, re-verified isolated
first); Return Notes (Phase 5D, migrations 0056-0058); Credit Note original-invoice-line picker +
historical cost basis; account reference company-safety hardening (migration 0059, 18 columns / 8
tables, live-verified zero cross-company violations both before and after); global search coverage
(now indexes Invoices/Bills/Quotes/Sales Orders/Purchase Orders/Credit Notes/Return Notes/Journal
Entries); Journal Entry full-page migration (the last sheet-backed transaction record); Forecasting
/ Budget vs Actual (migration 0060 — previously entirely absent).

**CORRECTED finding (the earlier claim below was stale/wrong):** `usePermission()`/`useCanAccess()`
is NOT "called nowhere in Sales/Purchases/Inventory feature UI" — live code shows it's already wired
into 36+ files across Inventory, Invoicing, Customer Management, Supplier Management, Payroll,
Reports, GL, and User Management (create/update/delete/import/export actions). The GENUINE gap,
confirmed live: the permission catalog itself has no `purchasing` feature and no feature for any
non-Invoice Sales document (Quotes/Sales Orders/Delivery Notes/Return Notes/Credit Notes/Receipts) —
only 9 features exist at all: `customer_management`, `dashboard`, `gl`, `inventory`, `invoicing`,
`payroll`, `reports`, `supplier_management`, `user_management`.

**NOT done, deliberately — a real STOP, not an oversight:** extending the permission catalog to
Purchasing/non-Invoice-Sales was NOT attempted this run. Reason: `user_roles` has 0 live assignments
today, but `profiles.role` DOES have 4 real `viewer`-role accounts live. Quotes/Sales
Orders/Delivery Notes/Return Notes/Credit Notes/Receipts/Purchase Orders/Bills/Payments currently
have NO route-level gate at all — any authenticated user, including those 4 viewer accounts, can use
every action on those pages today. Inventing a default role→permission matrix for two new feature
areas (should `viewer` be able to create a Purchase Order? a Quote?) is a genuine business-policy
decision this audit has no basis to make — guessing wrong either locks out real accounts with no
admin-assignable recovery path (since assigning roles itself requires reaching a page these
same permissions might gate) or ships gating that does nothing. This is exactly the "insufficient
role data to safely infer access defaults" case documented as a valid stop condition. Needs an
explicit product decision, then a migration + UI wiring pass mirroring the already-proven
Inventory/Invoicing pattern exactly.

**NOT flipped, deliberately:** `NORMALIZED_DOCUMENT_LINES_ENABLED` stays `false`. The 2026-09-05
readiness audit found live parity perfect and the dual-write path provably non-blocking (see
`docs/CURRENT_TASKS.md`), but no live smoke test of an actual create/update through the running app
with the flag flipped has been run — static analysis alone shouldn't be the last word before a
production flag flip.

### 2026-09-05 — Whole-project completion audit findings

A broad, read-only audit (code + live database) was run across the entire app after closing Phase
5C, to establish exactly what remains before Vertex can be called complete. Full detail and the
resulting finite roadmap: `docs/CURRENT_TASKS.md` § "PROJECT STATE". Summary of NEW findings this
audit surfaced (issues already tracked elsewhere are not repeated here):

- **MEDIUM — no fine-grained UI permission enforcement.** `usePermission()` / the `(feature, action)`
  catalog (migration `0030`) exists but is called nowhere in Sales/Purchases/Inventory feature UI —
  only route-level `PermissionRoute` gating exists (~15 routes). RLS still enforces company
  isolation regardless; this is an authorization-*granularity* gap, not a tenant-isolation hole.
- **MEDIUM — Phase 5D's real scope, precisely identified.** Credit Notes already fully support
  returning INVOICED goods (COGS/VAT/AR/stock all reverse correctly, over-return and double-credit
  are both guarded, live-tested). The genuine gap is a **Return Note** mechanism for goods that were
  *delivered but not yet invoiced* — Credit Notes structurally cannot cover this (there is no
  invoice to credit against). This is the actual, scoped Phase 5D, not "polish the existing path."
- **LOW — a live data anomaly.** `invoices` row `INV-2026-0001` (id `974ebb56-…`), company "Office
  National Demo", zero value, status `sent`, no `journal_entry_id`, created `2026-09-04 13:29:33Z`
  against the real `SO-2026-0004` — this timestamp falls exactly inside the CP-5C-A live
  rollback-wrapped smoke test window, meaning the rollback did not fully undo every write (an
  `inventory_transaction_log` row with posting key `invoice:974ebb56-…:post` also exists from the
  same test). Zero accounting effect (no GL/journal impact — the value is 0.00), but it is real,
  human-numbered test residue in production data. **Not deleted during this read-only audit** — a
  one-row `delete from invoices where id = '974ebb56-7939-4d5a-8e5a-697e1474d49c'` is the
  recommended cleanup, pending explicit approval (it is genuinely a live-data delete, so it gets the
  same authorization treatment as any other production data change).
- **LOW — `CreditNoteForm` never sets `originalInvoiceLineId`.** The field, its validation guard,
  and its DB composite FK (migration `0041`) all exist and work — but no UI path ever populates it
  (`CreditNoteForm` uses a generic line editor, not a "credit this specific invoice line" picker), so
  only the coarser whole-invoice/per-product double-credit guard ever fires for a real user.
- **LOW — a return posts at current WAC, not historical cost.** A Credit Note return
  (`reason: 'return'`) re-costs the returned stock at the product's CURRENT weighted-average cost —
  documented in `creditNoteService.ts`'s own comment as a deliberate simplification, not an unknown
  defect. The RPC already supports a `unitCostOverride` (migration `0032`); the service just never
  populates it with the original sale's cost for a return.
- **LOW — global search coverage.** Only Products/Customers/Suppliers/Delivery Notes are indexed;
  Invoices/Bills/Quotes/Sales Orders/Purchase Orders/Credit Notes are not searchable by number.
- **INFO — finite security hardening scope, not urgent.** `post_inventory_transaction`'s account FKs
  (`journal_lines.account_id`; `products.sales_account_id`/`inventory_account_id`/`cogs_account_id`/
  `purchase_account_id`; `product_categories.revenue_account_id`/`cogs_account_id`/
  `inventory_account_id`/`adjustment_account_id`; `category_account_mappings`' 3 account columns;
  `accounts.parent_account_id`; 3 `fixed_assets` GL columns) are plain FKs to `accounts(id)`, not the
  composite `accounts(company_id, id)` pattern `opening_stock_batches` already uses. A live read-only
  query (2026-09-05) confirmed **zero actual cross-company violations exist today** — this is a
  structural gap, not an active exploit. Finite scope: ~7 tables / ~18 columns, one migration.

**FIXED this audit (found and closed immediately, no schema change, in the affected code already
being touched):** `InventoryItemDetail.tsx`'s `resolveParty()` resolved a `credit_note`-sourced
movement's customer by looking up `sourceDocumentId` in the INVOICE map — but a credit note's own id
is what's stored there, not its invoice's, so the customer column silently showed nothing for every
credit-note-caused stock movement. Fixed by adding a `creditNotes` prop and resolving via the credit
note's own `customerId`.

> **Roadmap note (2026-09-03):** several open items below are now scheduled — see the
> **POST-4A ROADMAP** in `docs/CURRENT_TASKS.md`:
> "no formal print layout" → **Phase 4B**; "no stock reservation / commitment" → **Phase 5A**;
> "partial Sales-Order invoicing" → **Phase 5B/5D**; `MockStockLotRepository`/FIFO → **Phase 7E**;
> `recordReceipt` non-atomicity → **Phase 7F**; deposit unallocation/refund UI → **Phase 7I**.
>
> **Roadmap note (2026-09-04):** Phase 5C (Delivery Notes) design APPROVED, CP-5C-A schema/RPC
> AUTHORED, HARDENED, FINALIZED, and **APPLIED + LIVE-VERIFIED** (complete `0050`-`0055` changeset,
> live on `bcaffvpibpitpuqglszn`) — see `docs/DELIVERY_NOTES_DESIGN.md`. All CP-5C-0/CP-5C-A
> findings below are RESOLVED, by decision, by an applied migration, or both: the
> invoice-spans-multiple-deliveries question, the `sales_orders`/`customers` composite key, and
> **the CRITICAL over-issue gap between Delivery Notes and `create_invoice_from_sales_order`**
> (resolved via `0055`, applied and confirmed live — Phase 5B itself is NOT reopened). The
> `post_inventory_transaction` caller-ownership gap (LOW risk, not a blocker) and the
> unwired-permissions finding remain open, targeted at Phase 7.
>
> **Roadmap note (2026-09-05):** CP-5C-B / CP-5C-C / CP-5C-D (service, UI, reconciliation report,
> release readiness) are **COMPLETE**, and the three LOW cleanup items found at that checkpoint
> (Product-detail Sales tab, `DeliveryNoteDetailPage`/`CreateDeliveryNotePage` dedicated tests,
> `SalesOrderForm`'s own-commitment display nuance) are now **ALL RESOLVED** as final Phase 5C
> cleanup — see `docs/DELIVERY_NOTES_DESIGN.md` § "CP-5C-B/C/D" and the entries below. **Phase 5C is
> CLOSED.** No open issues remain from Phase 5C.

### Deployment candidate (branch `phase-9b-relationship-design-and-code`, 2026-09-03) — known non-blocking items
The record-detail full-page migration (increments 1 + 2) is committed + pushed to the branch and
awaiting human browser QA before any merge to `main`. Carried forward, **not fixed**, none blocking:
- **`MockStockLotRepository` / FIFO** — see the entry immediately below.
- ~~**Deferred configuration / admin `NativeSelect` sweep**~~ — **RESOLVED 2026-09-03** (GLOBAL SELECT
  MIGRATION, `docs/CURRENT_TASKS.md`). Every non-transaction native `<select>` migrated to `EnumSelect` /
  `SearchableSelect`; **zero** native `<select>` app-wide outside `native-select.tsx` + test files, guarded
  by `src/components/app/combobox/noNativeSelect.global.test.ts`. Pure UI, no domain/DB change.
  Committed + pushed to the branch 2026-09-03 (`main` not merged). **Real-browser check of the new
  popups is the one remaining risk** — dark styling, downward opening near the viewport bottom,
  long-list scroll, `SearchableSelect` filter typing, long entity-name wrapping, layering over a
  Dialog/Sheet/drawer, ~400px mobile width, keyboard nav, and Companies → Edit → Legal entity type.
  jsdom tests cover the wiring only; folds into human QA 7A.
- **Journal Entry detail is still sheet-backed** — every new record page's "View journal entry" link opens
  `/accounting/journals?record=<id>` (the side-sheet). A full-page `JournalEntryDetailPage` is a later increment.
- **GL Account / Fixed Asset / Lease retained as side-sheets** this increment — the three borderline records
  (ledger / depreciation schedule / amortization schedule), deferred per brief §B.
- **Create / edit modal shell width** still needs browser confirmation — not changed in this increment.

### [RESOLVED in Increment 4A — code-complete, uncommitted, migration 0045 not yet applied] Pre-invoice customer receipts are credited straight to Accounts Receivable (no customer-deposit liability)
**Fix (2026-09-03, Increment 4A):** new `2600 Customer Deposits` liability account + `CUSTOMER_DEPOSIT`
mapping key. `recordReceipt()` now posts a split entry — `DR 1000` for the total, `CR 1100` for the
portion applied to invoices, `CR 2600` for the unapplied portion. `allocateToInvoice()` posts
`DR 2600 / CR 1100` (no bank movement, deterministic idempotency token) when a deposit is later
applied. New `reconcileCustomerDeposits()` (2600 control vs Σ `unallocatedAmount`), wired into Books
Integrity / the integrity audit / the Trial Balance cards. `reconcileAccountsReceivable()` now nets
only the applied portion of receipts. Cash flow gained a "Customer Deposits" operating line.
`reverseJournalEntry()` now guards subledger-sourced entries. UI: "Available customer deposit" on the
receipt page, "Available deposit" card on the customer page, "Apply deposit" on the invoice page.
Migration `0045` **authored, not applied**; the 3 legacy Office National unapplied receipts (R4,250)
have reviewed correction entries authored in `docs/db-changes/0045b_...` but **not posted**. Full
detail: `docs/ACCOUNTING_RELATIONSHIPS.md` § "CUSTOMER DEPOSITS / PREPAYMENTS — INCREMENT 4A".

Original report (record-page increment-3 sales-workflow audit, 2026-09-03):
`customerReceiptService.recordReceipt()` (`src/features/sales/services/customerReceiptService.ts`)
**always** posts `DR 1000 Cash and Bank / CR 1100 Accounts Receivable` for the full receipt amount,
regardless of how much is allocated to invoices. An unallocated receipt (a customer paying a deposit
before any invoice exists) therefore drives the customer's AR subledger **negative** — a credit
balance sitting in a receivable account — instead of raising a customer-deposit / "income received in
advance" contract liability. There is no such account: `AccountMappingKey`
(`accountMappingService.ts`) has no `CUSTOMER_DEPOSIT` / `CONTRACT_LIABILITY` key and no 2xxx code is
mapped for it. Later allocation (`allocateToInvoice` → `invoiceService.recordPayment`) posts **no**
journal, so once the invoice posts (`DR AR …`) the AR balance nets to the correct outstanding figure —
**the end state is right**, but between deposit and invoice the balance sheet understates AR and omits
a current liability (IFRS 15 / SA GAAP would show a contract liability). No evidence this is a
deliberate design choice (the only "deposit" in the ledger docs is an unrelated bank-reconciliation
scenario). **Reported, not fixed** — the correct treatment needs a new chart-of-accounts row + mapping
key + a branch in `recordReceipt` (CR the deposit liability for the unallocated portion) + an
`allocateToInvoice` journal (`DR deposit / CR AR`): an explicit accounting decision plus a DB change,
out of an inspect-only increment's scope. Full detail: `docs/ACCOUNTING_RELATIONSHIPS.md` § "SALES
DOCUMENT WORKFLOW AUDIT — 2026-09-03" Q5.

### ~~No stock reservation / commitment model — "Available" always equals "On hand"~~ — RESOLVED (Phase 5A, 2026-09-03, code-complete/uncommitted)
See the Resolved section below.

### ~~Partial Sales-Order invoicing~~ — RESOLVED (Phase 5B, 2026-09-04, uncommitted; migrations 0048+0049 APPLIED)
- **Severity:** was HIGH → resolved. **Status:** Phase 5B COMPLETE, uncommitted on `phase-9b-relationship-design-and-code`.
- **Done:** `DocumentLineItem.salesOrderLineId?` link; `createInvoiceFromSalesOrder(soId, selections[])`
  via the atomic `create_invoice_from_sales_order` RPC (migration 0049) + `PartialInvoicePicker` modal;
  multiple invoices per SO; derived progress badges; `StockCommitmentService` commits only the
  remaining quantity; document-level `closed` status (migration 0048) + `closeRemaining()` to abandon
  an un-invoiced remainder. "SO qty 10 → invoice 2 → invoice 3 → close 5" works end to end.
- **Accounting impact:** none — engine untouched; each invoice posts exactly its own quantities;
  closing posts nothing.
- **Deployment blocker:** no.
- **Deferred (not blockers):** per-line partial cancellation → 5D; delivery notes → 5C;
  `sales_order_lines` normalization → Phase 6/7.

### ~~Phase 5B.2: create-invoice-from-Sales-Order is not row-locked atomic (concurrency race)~~ — RESOLVED (Phase 5B FINAL / 5B.4, 2026-09-04)
Migration **0049** (`create_invoice_from_sales_order`, APPLIED) makes it atomic: `SECURITY INVOKER`,
locks the `sales_orders` row `FOR UPDATE`, re-derives every line's remaining (`ordered − Σ non-void
draft+posted linked qty`) **inside the transaction**, rejects an over-invoice, creates the `draft`
in one commit. `RpcSalesOrderDraftInvoiceWriter` routes the production path through it;
`buildInvoiceFromSelections` stays as fail-fast UX validation. Rollback-wrapped smoke test confirmed
the in-transaction remaining check. Residual (LOW, → Phase 7): no client request-id idempotency
log, so a lost-response retry *can* create a second draft — but the remaining cap (which counts
existing drafts) rejects it once it would exceed the ordered quantity.

### ~~CP-5C-0 (Delivery Notes design audit): invoice-line-spans-multiple-delivery-notes has no schema answer yet~~ — RESOLVED BY DECISION (CP-5C-A, 2026-09-04)
- **Area:** Phase 5C design, `docs/DELIVERY_NOTES_DESIGN.md` Part 9. **Severity:** was MEDIUM.
  **Status:** decided, not built (nothing implements it yet — 5C-B). **Deployment blocker:** no.
- **Was:** the relationship model is genuinely many-to-many — one invoice line CAN need to span
  quantity from two different Delivery Notes (e.g. 2 units from DN-1001 + 2 from DN-1002 in one
  4-unit invoice line). A single scalar `InvoiceLine.deliveryNoteLineId?` (mirroring
  `salesOrderLineId?`) cannot represent that on its own.
- **Decision (explicit, CP-5C-A approval):** enforce **one invoice-line allocation per Delivery
  Note line** — the 5C-B picker offers one invoice line per contributing DN when an SO line's
  remaining quantity spans more than one delivery, rather than merging them. `InvoiceLine.
  deliveryNoteLineId?` stays a plain scalar jsonb field, no join table. This is why `0051`'s
  `delivery_notes` table needs no normalized child table and `0053`'s RPC needs no
  allocation-splitting logic. The general solution (`invoice_line_delivery_allocations` join
  table) remains documented as the correct answer if real invoice-spans-multiple-deliveries
  volume ever appears — see the SUGGESTIONS entry below. **Not built** — this is a design/schema
  decision only; 5C-B implements the picker behaviour.

### ~~CP-5C-A (Delivery Notes schema): `sales_orders` / `customers` have no `(company_id, id)` composite key~~ — RESOLVED (CP-5C-A HARDENING, 2026-09-04, authored not applied)
- **Area:** `supabase/migrations/20260904160010__0050_prereq_sales_order_customer_company_id_id_keys.sql`, `20260904160030__0052_delivery_notes_table.sql`. **Severity:** was LOW. **Status:** fixed in the authored (not-yet-applied) migration set. **Deployment blocker:** no.
- **Was:** unlike `products`/`warehouses`/`accounts` (migration 0027/0029) and `invoices`/
  `credit_notes` (migration 0037), `sales_orders` and `customers` had no `unique (company_id, id)`
  candidate key — so `delivery_notes.sales_order_id`/`customer_id` had to be authored as PLAIN
  (non-composite) FKs.
- **Fix:** a new prerequisite migration `0050` (renumbered — was going to be "Phase 7 hardening",
  brought forward at explicit instruction: "we have repeatedly chosen company-safe composite
  relationships elsewhere in Vertex... do not knowingly introduce weaker plain FKs merely to add a
  cleanup migration later"). Re-verified read-only against live data first (0 NULL `company_id`, `id`
  count = distinct-`id` count on both tables — trivially guaranteed since `id` is already a globally
  unique `uuid primary key`, so `unique (company_id, id)` can never conflict with existing data on
  any table, by construction). `delivery_notes` (0052, renumbered) now declares `sales_order_id`,
  `customer_id` AND `warehouse_id` as composite FKs — no plain FK remains anywhere in the table.

### CP-5C-A HARDENING: `post_inventory_transaction`'s account-ownership gap — full caller audit, root cause identified, precedent for the fix already exists
- **Area:** `supabase/migrations/20260830162737__0031_inventory_posting_engine.sql` (pre-existing, unchanged — out of scope to modify in 5C-A itself). **Severity:** LOW (not a blocker — see the risk assessment below). **Status:** open, fully audited 2026-09-04. **Deployment blocker:** no.
- **Root cause, precisely identified:** the engine writes `journal_lines` with whatever
  `inventory_account_id`/`contra_account_id` it is given, with no company-ownership check of its
  own. The TERMINAL write path is `journal_lines.account_id uuid not null references
  public.accounts(id)` — a **plain** FK, from the original ledger migration `0004`. Two further
  upstream columns share the same gap: `products.inventory_account_id`/`cogs_account_id`/
  `sales_account_id`/`purchase_account_id` and `product_categories.inventory_account_id`/
  `cogs_account_id`/`revenue_account_id`/`adjustment_account_id` (migrations 0019/0024/0025) — all
  plain FKs to `accounts(id)`, no company-match enforcement.
- **Full audit of every current caller** (`invoiceService.postInvoice()`, `billService.postBill()`,
  `purchaseOrderService.recordReceipt()`, `creditNoteService.issueCreditNote()`,
  `stockAdjustmentService`, `stockTransferService`, `stockTakeService`, `supplierReturnService`,
  `openingStockBatchService`): every one resolves accounts via `AccountMappingService.getAccountId()`
  (RLS-scoped, always same-company) or `InventoryAccountResolverService.resolveForProduct()` (whose
  product/category OVERRIDE tiers are the plain-FK columns above — same-company only by UI
  convention, not by schema). All nine share the identical LOW-severity risk profile: exploiting it
  requires an attacker to already hold valid credentials in SOME company AND already know a real,
  foreign `accounts.id` UUID (not enumerable — RLS-protected; not guessable — 122-bit random). Even
  then, RLS on `journal_lines` INSERT still confines every written row to the attacker's OWN
  company — no other company's amounts are ever exposed; the worst case is the attacker's own
  company's reporting referencing a foreign account row (self-inflicted data-integrity issue) plus
  a minor label (name/code, not amounts) disclosure. **Cross-company account risk assessed: LOW,
  not a BLOCKER** — this does not let one company read or alter another's actual financial records.
- **`post_delivery_note` (0054) is the single strictest caller of `post_inventory_transaction` in
  the codebase today** — the only one that re-validates both supplied account ids belong to the
  calling company via an explicit `exists(...)` check, closing the "hand-crafted direct RPC call"
  path for itself (it cannot close the upstream product/category override gap, which lives outside
  any RPC).
- **Recommended fix, with an ALREADY-PROVEN-SAFE precedent in this exact codebase:**
  `opening_stock_batches.offset_account_id` (migration 0029) is ALREADY a composite FK to
  `accounts(company_id, id)` — `accounts` has carried `unique (company_id, id)` since 0029. The same
  pattern, simply never extended to `journal_lines.account_id`, `products.*_account_id`, or
  `product_categories.*_account_id`, would close this for every caller at once. **Target:** Phase 7
  hardening (verify no existing bad rows first, then swap 3 FK definitions across 2 tables) — NOT a
  5C-A defect and NOT changed in 5C-A (the instruction was explicit: don't touch the underlying RPC
  unless absolutely necessary to make the Delivery Note migration itself safe; it wasn't).

### ~~CP-5C-A HARDENING — CRITICAL: `create_invoice_from_sales_order` (0049, live) does not know Delivery Notes exist~~ — RESOLVED + APPLIED + LIVE-VERIFIED (0055, 2026-09-04)
- **Area:** `supabase/migrations/20260904170010__0055_delivery_aware_create_invoice_from_sales_order.sql` — a `create or replace` upgrade of the same `create_invoice_from_sales_order` function `0049` (Phase 5B) created. **Severity:** was HIGH (same-company inventory-accuracy risk — never a cross-company/security issue). **Status:** RESOLVED — `0055` is APPLIED to project `bcaffvpibpitpuqglszn` (2026-09-04) and the fix was confirmed against the real database via a rollback-wrapped smoke test (a direct 10-unit invoice request after a 6-unit posted delivery was correctly rejected: "only 4.000 remain to invoice directly"). **Deployment blocker:** cleared.
- **Was, proven with exact numbers:** SO ordered 10 → DN 6 posted → a direct `create_invoice_from_
  sales_order` request for the full 10 units was **incorrectly allowed** (0049 never looked at
  `delivery_notes`) → `deliveredQty(6) + directlyInvoicedQty(10) = 16 > ordered(10)` — reached by
  ordinary sequential usage, not a race condition.
- **Fix (this is explicitly NOT a Phase 5B reopening — Phase 5B remains COMPLETE):** `0055`
  `create or replace`s the SAME function (same name, same signature) so its "remaining" check for a
  **direct** selection now subtracts `deliveredQty` (Σ posted Delivery Note line qty) in addition to
  its own original `directlyInvoicedQty` (draft+posted, non-DN-linked, unchanged reservation
  semantics preserving Phase 5B's own invoice/invoice race protection). Also adds an OPTIONAL
  `deliveryNoteLineId` per selection for the future 5C-B "invoice this delivery" workflow — validated
  against that specific DN line's own remaining-to-invoice quantity, independent of
  `remainingToDeliver`, and excluded from `directlyInvoicedQty` (the double-subtraction guard).
- **Proven, not asserted:** a formally runnable 18-scenario quantity-matrix (`src/repositories/
  deliveryNotesMigrations.test.ts`, describe "CP-5C-A quantity matrix — formal proof") covers every
  scenario the hardening brief specified, including all 4 named concurrency races (DN vs direct
  invoice, existing-DN vs new-DN-vs-invoice, invoice vs invoice, DN vs DN) and an explicit
  double-count-detection test. `remainingToInvoice` is proven UNCHANGED and never collapsed into
  `remainingToDeliver` (worked example: ordered 10, delivered 7, invoiced 4 → remaining delivery 3,
  remaining invoice 6 — both correct, independently). Backward compatibility is proven, not assumed:
  `deliveredQty ≡ 0` makes `0055`'s formula reduce byte-identically to `0049`'s original.
- **Not fixed by silently reopening Phase 5B** — flagged explicitly first (this entry, prior state),
  then resolved only on the user's explicit instruction that this is a "Phase 5C compatibility
  amendment," per CP-5C-0's own "do not reopen Phase 5B without explicit authorization" rule.
- **Done:** `0050`-`0055` applied together as a single reviewed changeset (2026-09-04). Not yet
  committed/pushed to git at the time of apply. 5C-B/C/D (service/UI implementation) are now
  COMPLETE, 2026-09-05 — see `docs/DELIVERY_NOTES_DESIGN.md` § "CP-5C-B/C/D".

### CP-5C-0 (Delivery Notes design audit): a Delivery Note permission proposal would be inert, same as the existing inventory catalog rows
- **Area:** `usePermission()` / `(feature, action)` catalog. **Severity:** LOW / INFO. **Status:** confirmed finding, not new — reconfirmed while auditing for 5C. **Deployment blocker:** no.
- **Observed:** grepped every Sales/Purchases/Inventory feature UI — `usePermission()` is called
  nowhere. The catalog (migration `0030`, e.g. `inventory:adjust`) exists as scaffolding only.
  Any `delivery_note:*` permission rows proposed for 5C-C would follow the same shape but be
  equally inert until Phase T's broader permission rollout — not a parallel system, just honestly
  not wired to anything yet.
- **Recommended fix:** none needed for 5C itself; wiring `usePermission()` into real document
  actions is its own cross-cutting Phase T follow-up, out of scope for Delivery Notes specifically.

### ~~CP-5C-A HARDENING: `reconcileInventory()`'s movement-evidence check doesn't yet list `'delivery'` as requiring a source line id~~ — RESOLVED (CP-5C-D, 2026-09-05)
- **Area:** `src/features/inventory/services/reconcileInventory.ts` (`LINE_ID_REQUIRED` set). **Severity:** was INFO. **Status:** FIXED. **Deployment blocker:** no.
- **Observed:** the function's movement-evidence-completeness check has a `LINE_ID_REQUIRED` set of
  movement types that must carry `source_document_line_id` when structurally linked — `'delivery'`
  wasn't in it.
- **Fix:** added `'delivery'` to `LINE_ID_REQUIRED`. Confirmed (separately, and unaffected by this)
  that `reconcileInventory()` resolves ONLY `INVENTORY` (1200) and `INVENTORY_IN_TRANSIT` (1210) for
  its GL-tie checks — `1220` remains structurally excluded from that reconciliation, by design (it
  has its own dedicated "Goods Delivered Not Invoiced" report instead — see the Phase 5C-B/C/D entry
  below).

### ~~Phase 5C-B/C/D (2026-09-05): three LOW, non-blocking gaps disclosed at checkpoint close~~ — ALL THREE RESOLVED (final Phase 5C cleanup, 2026-09-05)
- **Product detail "Sales" tab.** `InventoryItemDetail.tsx`'s Sales tab now includes `'delivery'`-type
  movements alongside `sale`/`sales_return`, and its "Ref" column resolves to the real Delivery Note
  number (via the same `SourceCell`/`resolveSource` machinery the Transactions tab already used) —
  no raw UUID. Fixed a companion gap found while wiring this: `InventoryItemDetailPage.tsx`'s
  `numberById` map (used to resolve every movement's source to a human document number) never
  included Delivery Notes at all, so a delivery movement's source would previously have shown no
  number anywhere in the product detail page, not just the Sales tab. Both fixed together.
- **`DeliveryNoteDetailPage`/`CreateDeliveryNotePage` dedicated tests.** Added — 8 tests
  (`DeliveryNoteDetailPage.test.tsx`: full-page render, no raw UUID, related-SO link, draft vs
  posted vs fully-invoiced action-set correctness, print action, not-found state) + 6 tests
  (`CreateDeliveryNotePage.test.tsx`: full-page render with correct default quantity, fully-delivered
  empty state, non-confirmed-order block, unknown-order not-found, missing-warehouse validation,
  Cancel navigation).
- **`SalesOrderForm` own-commitment display.** Now computes `fulfilledByLine` via
  `sumPhysicallyIssuedBySalesOrderLine(invoices, deliveryNotes)` (a `useDeliveryNotes()` fetch added
  to the form) instead of the narrower posted-invoice-only formula — matches the global commitment
  map exactly. Test mocks (`SalesOrderForm.commitments.test.tsx`, `salesFormModalWidths.test.tsx`)
  updated accordingly.

All three closed with **no schema change**, gate green throughout (2500 tests / 317 files).

### Phase 5B.2: `PartialInvoicePicker` uses company-wide product on-hand for its stock hint
- **Area:** `src/features/sales/components/PartialInvoicePicker.tsx`. **Severity:** LOW. **Status:** open, new. **Deployment blocker:** no.
- **Observed:** the per-line "On hand / Committed / Available" hint uses `product.quantityOnHand`
  (company-wide) + `getCommittedForProduct` (summed across warehouses), even when the SO line targets
  one warehouse. Same class as the (now-fixed) `SalesLineItemsEditor` issue, but here it's a
  read-only advisory in a modal that creates a *draft* — final availability is validated at posting.
- **Recommended fix:** hydrate per-warehouse `stock_balances` when the line has a `warehouseId`
  (reuse `useStockBalances` + `onHandFor` as `SalesLineItemsEditor` now does). Fold into 5B.6 or a
  Phase 7 polish pass.

### `SupabaseSalesOrderRepository` / `SupabaseInvoiceRepository` instantiated in several composition points
- **Area:** DI wiring. **Severity:** LOW. **Status:** open, cleanup only. **Pre-existing** (5A), widened by 5B.3 and 5B.2. **Deployment blocker:** no.
- **Observed:** `SupabaseSalesOrderRepository` is now constructed in `src/features/sales/services/index.ts`,
  `src/features/inventory/repositories/instances.ts` (5B.3, for `stockCommitmentService`) and
  `src/services/index.ts` (5B.2, for `syncSalesOrderStatusAfterPost`); `SupabaseInvoiceRepository`
  in `src/services/index.ts` and inventory `instances.ts`. All are **stateless wrappers over the
  same shared `supabase` client** — no in-memory cache, no divergence hazard (that risk exists only
  with `Mock*Repository`).
- **Accounting / data impact:** none. Every instance reads the same rows.
- **Recommended fix:** a single shared repository export each feature imports — deferred, not worth
  a cross-feature refactor now. **Target:** Phase 7 hardening.

### Phase 5A: `committed` shows 0 for products with no product-linked confirmed Sales Order — NOT a defect
The derived commitment is correct: with no `confirmed` Sales Order line referencing a product, that
product's committed quantity **is** 0, so Available == On Hand. The current demo/live DB may have
few or no product-linked confirmed SOs, so the feature can look inert on the deployed app. A
demo-seed of confirmed SOs to exercise it visibly is proposed as a **separate approval item**
(`docs/CURRENT_TASKS.md` Phase 5A) — it would touch live data and is out of scope for the fix.

### ~~Phase 5A: Sales Order line caption pairs company-wide On Hand with warehouse-scoped Committed~~ — RESOLVED (Phase 5B.1, 2026-09-04, uncommitted)
`SalesLineItemsEditor` now takes an `onHandFor(productId, warehouseId?)` accessor; when a line
targets a specific warehouse the caption uses that warehouse's `stock_balances` on-hand so on-hand
and committed are at the **same scope**. `SalesOrderForm` wires it from `useStockBalances()`.
Falls back to company-wide `product.quantityOnHand` when there is no balance row / no line
warehouse. Regression test: `SalesLineItemsEditor.test.tsx` "uses warehouse-scoped on-hand".

### ~~Phase 5A: over-commitment warning text attributes same-document lines to "other orders"~~ — RESOLVED (Phase 5B.1, 2026-09-04, uncommitted)
The shortage caption now reads "(N committed to other confirmed orders, M to other lines on this
order)" — the same-document contribution is named separately and only shown when non-zero.
Regression test: `SalesLineItemsEditor.test.tsx` "separates 'other orders' from 'other lines on
this order'".

### Phase 5B.1: Product-detail movement ledger does not surface the originating Sales Order
- **Area:** `src/features/inventory/components/InventoryItemDetail.tsx` (`MovementLedger`). **Severity:** LOW. **Status:** open, new.
- **Observed:** a `sale` movement's evidence panel resolves the invoice, customer, warehouse, qty,
  unit cost and resulting balance (Increment 3) but not the Sales Order the invoice line came from,
  even though the data path now exists (`stock_movements.source_document_line_id` →
  `invoice_lines/jsonb line` → `salesOrderLineId` → SO).
- **Accounting / data impact:** none — display completeness only.
- **Recommended fix:** extend the ledger's `resolveSource` to add a "Sales order" row + preview when
  the invoice line carries `salesOrderLineId`. Small, UI-only. **Target:** a focused 5B follow-up
  or Phase 7. Deliberately not done in 5B.1 to avoid destabilising the large `InventoryItemDetail`
  component this checkpoint.

### Phase 5B.1: legacy SO→invoice conversions have no line-level link until the backfill runs
- **Area:** `docs/db-changes/5b1_backfill_sales_order_line_links.sql`. **Severity:** LOW. **Status:** authored, NOT run.
- **Observed:** the 3 September SO→invoice pairs (`INV-1068/1072/1074`) were created before
  `salesOrderLineId` existed, so their invoice lines carry no link. `computeSalesOrderFulfilment`
  falls back to the commercial `fulfilled` status for them (`displayInvoicingStatus`) — correct, but
  the per-line Ordered/Invoiced/Remaining grid is hidden for those orders (`hasLineLevelEvidence`
  false). They are all `fulfilled`, so commitment is unaffected.
- **Recommended fix:** run the guarded backfill script (needs explicit approval — it writes live
  jsonb). Deterministic, idempotent, refuses to guess.

### ~~The migrated full-page record pages have no export / formal print layout~~ — RESOLVED (Phase 4B, 2026-09-03)
`src/features/businessDocuments/` now provides a branded A4 document system (id-free
`BusinessDocumentViewModel` + 5 adapters + `BusinessDocument` A4 template + `businessDocuments.css`
print strategy + `BusinessDocumentPreviewModal`). A **Print / PDF** action (and, for
Quote / Sales Order / Purchase Order / Invoice, a **Duplicate** action) is wired onto the 5
`*DetailPage`s. `ExportMenu` (CSV/Excel *data* export) on the record pages was **not** added —
it stays list-oriented; the formal document is a separate surface. See `docs/BUSINESS_DOCUMENTS.md`.

### ~~Company document profile — schema authored~~ — RESOLVED (Phase 4B-2, migration `0047` APPLIED 2026-09-03)
Found 2026-09-03 (Phase 4B), built out in Phase 4B-2. `Company` has the optional fields
(`tradingName`, `logo` = base64 data URL, `documentAddress` jsonb `Address`, `phone`, `email`,
`website`, `documentTerms`, `documentsBankAccountId` → `bank_accounts` FK), the
`SupabaseCompanyRepository` mapping, the `CompanyForm` "Document & branding" section (client-side
logo validation, bank-account selector), and the businessDocuments adapters consume all of it from
one source. **Migration `0047_company_document_profile` was APPLIED to the live project 2026-09-03**
(`supabase/migrations/20260903120200__0047_company_document_profile.sql`). All 3 live `companies`
rows are NULL on all 8 new columns — no profile data was invented or written; an admin sets real
values through Company Settings. Post-apply verification (schema / FK / all-NULL / Trial Balance
balanced / 0 new security advisors): `docs/SUPABASE_MIGRATION_GUIDE.md` § "0047".

**Still open / deferred (not solved in 4B-2):**
- `DocumentLineItem` has no per-line **discount** field → no Discount column on any document
  (`Customer.defaultDiscountPercent` exists but is not captured per line).
- `SalesOrder` has no **delivery address**, **customer-PO reference**, or **expected-delivery**
  field → those are omitted from the printed sales order.

### Browser native print headers/footers cannot be suppressed by the web app — documented limitation (not a bug)
Confirmed 2026-09-03 (Phase 4B-VISUAL). When a business document is printed, the browser adds its
own page chrome: a top-left date, a bottom-left page URL and a bottom-right page number. **No web
API can disable or alter these** — the only control is the user's "Headers and footers" checkbox in
the print dialog. The app does what it can: `printBusinessDocument(documentNumber)` swaps
`document.title` for the print so the **top-centre** header shows the document number (e.g.
`INV-2026-1072`) instead of "Accounting Suite", and restores it on `afterprint`. The preview modal
toolbar carries a one-line instruction to turn "Headers and footers" off for a clean PDF. `@page {
margin: 0 }` would make Chrome drop the chrome but bleeds content to the sheet edge — rejected.
No PDF library was added (native `window.print()` → "Save as PDF" is retained deliberately — see
`docs/BUSINESS_DOCUMENTS.md` § "PDF export").

### FIFO stock-lot repository is still `MockStockLotRepository` in production wiring
Found 2026-09-03 during the Increment-2 Mock-repository audit (record-detail full-page migration).
`src/features/inventory/repositories/instances.ts:30` — `export const stockLotRepository = new
MockStockLotRepository();`. There is no `SupabaseStockLotRepository`; every other repository in the
codebase is Supabase-wired. Same *class* of latent bug as the tax-rate discovery below (a production
service silently on a Mock), but **not currently exercised**: weighted-average is the active valuation
method for every seeded product, and FIFO lot allocation only runs when a product is set to
`valuationMethod: 'fifo'`. Impact if it were: FIFO lots would be in-memory only, lost on reload.
Recommendation: build `SupabaseStockLotRepository` + a `stock_lots` migration before the UI allows
`valuationMethod: 'fifo'` on any product, or gate the FIFO option out of `ProductForm` until it exists.
Reported, **not fixed** (outside the increment's UI-only scope). `grep -rn "= new Mock[A-Za-z]*Repository
\s*(" src` (excl. tests/stories/mock-data) confirms this is the only occurrence; the
`MockTaxRateRepository`/`MockInvoiceRepository` strings in the sales/tax barrels are comments and test
re-exports only. Guarded against a *new* Mock wiring by `taxRateServiceWiring.test.ts`.

### ~~Pre-existing, unrelated to Phase T: `MockSupplierRepository.test.ts`'s accounts-payable delete guard fails~~ — RESOLVED (re-verified 2026-09-05)
Found while verifying Phase T (2026-08-23): `service.deleteSupplier('sup_00000004')` resolved
instead of rejecting when the supplier had linked open bills. **Re-verified 2026-09-05 (Block A/B
run):** `npx vitest run src/features/suppliers/repositories/MockSupplierRepository.test.ts` now
passes — 9/9, standalone and in the full suite. The delete-guard was fixed in a subsequent
Suppliers/Purchases pass (the entry above was stale). No action needed.

### Phase T (Multi-Tenant Auth + Role System + Superuser Dashboard) — real, deliberate scope boundaries
Built 2026-08-23: real Supabase email/password auth (replacing the anonymous-session
bootstrap and the Phase-0 `isAuthenticated` boolean stub), a company-creation onboarding
flow, the fine-grained roles/permissions/user_roles/audit_logs_access schema (migrations
0009-0015), `usePermission()` feature-gating, a real Superuser Dashboard, and a real
Users & Roles admin page. Full design rationale in
`docs/SUPABASE_MIGRATION_GUIDE.md`'s Phase T section — summarized gaps below:

- **The new fine-grained roles (accountant/stock_controller/sales_manager/
  finance_manager/employee/viewer) only gate the UI** (`usePermission()`), confirmed with
  the user before building: the ~45 pre-existing tables' RLS is still gated by the
  original coarse `profiles.role` enum (admin/accountant/manager/operator/viewer/
  superuser) only, unchanged by this phase. Assigning someone the new "stock_controller"
  role does not, by itself, restrict what their `profiles.role` already lets them read/
  write at the database level.
- **No self-serve "join an existing company."** Every company-scoped table grants full
  CRUD the instant `company_id` matches, with no separate membership-approval gate — a
  self-service join-by-company-id would have been a real tenant-isolation bypass (found
  while designing onboarding, not shipped). Joining is admin-initiated instead: a
  colleague signs up, then a company admin adds them by exact email from the Users &
  Roles page.
- **No real email delivery anywhere in this app** (no backend/edge functions) — "Invite
  User" from the brief doesn't exist as an email invite; see the point above for the
  actual flow shipped instead.
- **Superuser Dashboard usage stats are real activity counts, not infra metering.**
  Storage/egress/API-call-per-tenant numbers are Supabase platform-level data no MCP
  tool or client API here can reach — deliberately not fabricated, per §110's
  "no unsupported claims" rule applied to infra, not just accounting figures.
- **`useRealtimeProfiles` (Step 7 of the brief) is built and correct against the current
  supabase-js v2 API but not wired into any page** — a demonstrated pattern, not a
  shipped live-updating feature yet.
- **`Company.subscriptionTier` and `roles`/`permissions` role_permissions seed mappings
  are this session's own reasonable defaults, not user-specified.** The brief's own
  system-role permission table left `payroll` ungranted to every role; extended to
  accountant (create/read/update) and finance_manager (read) as a real-world default,
  called out explicitly in migration 0010's comment rather than silently guessed.

**Two real pre-existing security gaps found and fixed while building this** (not Phase T
regressions — these existed since the original Phase A schema, just never exercised
until Phase T built the first UI that would have exposed them):
- `profiles_update_self`'s RLS policy had no `with_check` at all — any signed-in user
  could have set their own `role` to `'admin'`/`'superuser'` or jumped their own
  `company_id` into any other tenant via a plain client `.update()`. Fixed with a
  `BEFORE UPDATE` trigger (migration 0012) that locks `role`/`company_id`/`is_active`
  against self-elevation, superuser and same-company-admin exempted.
- `profiles.is_active` (present since Phase A) was never checked by any RLS policy
  anywhere — a "suspended" user could still fully use the app. Fixed at the two shared
  helper functions (`get_my_company_id()`/`get_my_role()`) every one of the ~45
  company-scoped tables' policies already call (migration 0015), so a suspended
  profile now resolves to no company/role and loses access everywhere, without
  touching any of those 45 tables directly.

### Phase 11 (Compliance): Regulation 27's low-score/internally-compiled reporting-framework band, and the s30(2A) owner-managed exemption, aren't machine-verified
Built 2026-08-22: the Public Interest Score engine (§3, Companies Regulations 2011 reg
26(2)) and its audit/independent-review (reg 28-29) and reporting-framework (reg 27)
suggestions. Every source consulted (CIPC's own summary page, RSM, RandCo, The Glass
Castle) converged exactly on the score formula and the reg 28/29 audit-vs-review bands,
so those are implemented with `confidence: 'high'`. WebFetch could not reliably extract
the primary Government Gazette PDF text (scanned/compressed), so this is a multi-source
cross-check, not a verified primary-source quote — see
`complianceDeterminations.ts`'s doc comment. Two specific pieces stayed genuinely
uncertain even after that cross-check and are deliberately flagged
`requires_professional_review` / surfaced as a note rather than presented as confirmed
(§110): which standard Regulation 27 leaves to a company's own discretion when its score
is below 100 AND internally compiled, and the Companies Act s30(2A) "owner-managed"
exemption from independent review (this app has no shareholder register to check every
shareholder is also a director against). Neither blocks the feature — the score still
calculates, the suggestion still shows — but neither should be relied on for an actual
statutory filing without an accountant confirming it.

Remaining deliberate Phase 8 simplifications (allowance/deduction taxability as
booleans, no retirement-fund deduction cap, UIF-exempt/SDL-exempt as flags rather than
the real statutory tests, no IRP5/payslip document generation, no settings UI to add a
new tax year's config, no "mark payroll as paid" settlement step) are tracked in
`docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 8 section, not listed here — they're scope
boundaries, not bugs.

### Phase 9 (Tax) — Deferred Tax and TaxComputation reversal remain open
Built 2026-08-22 (Income Tax §51/§52/§53, Capital Gains Tax §55, Dividends Tax §56, then
Provisional Tax §54 as a sequential Wave 2 — see Resolved below for Provisional Tax's
completion). Deliberately NOT attempted, per
`src/features/tax/incomeTax/services/taxComputationService.ts`'s class doc comment:
Deferred Tax (§50, correctly Phase 12 per §116's own build order, not a Phase 9 gap); no
reversal/correction path for a posted `TaxComputation` — once posted it is immutable,
mirroring the same open gap `PayrollRunService.postPayrollRun()` and
`DepreciationService.runDepreciation()` already carry (Provisional Tax's own
`ProvisionalTaxPeriod` inherits the same "no revision once a slot is paid" shape).

### Two GitHub identities in play
`gh auth status` shows two authenticated accounts, `GerhardVanWijk` and `Gerhard29046`.
**Pushing to `GerhardVanWijk/accountant_dashboard_ollama` (this repo's `origin`) requires
`GerhardVanWijk` to be the active `gh` account** — `Gerhard29046` gets a 403. `gh` is the
git credential helper for github.com, so `git push` uses whichever account is active.
Switch with `gh auth switch --hostname github.com --user GerhardVanWijk`. On 2026-09-02
the active account was found to be `Gerhard29046` (push failed); switched to
`GerhardVanWijk` for the push/merge and left it there. The local git commit email for
this repo is `gerhard.ark.of.war@gmail.com` (repo-local override, set 2026-08-20, not the
global git config) — intentional, don't "fix" it back to the global default.

## Resolved

### No stock reservation / commitment model — "Available" always equalled "On hand"
**Resolved (Phase 5A, 2026-09-03 — code-complete, uncommitted on `phase-9b-relationship-design-and-code`).**

**Before:** `StockBalance.quantityCommitted` existed in the type and `quantityAvailable()` subtracted
it, but nothing ever wrote it — `stockBalanceService` hardcoded `quantityCommitted: 0` and
`stockService.getQuantityAvailable` carried `const quantityCommitted = 0; // TODO(Phase 2)`. A
confirmed Sales Order did not ring-fence stock; every "Available" figure equalled "On hand".

**After:** committed quantity is **derived on read** from confirmed Sales Order lines — no schema
change, no `stock_reservations` table, no migration, no Supabase write, no `stock_movement`. New
`stockCommitmentService.getCommitmentMap()` (Σ confirmed-SO line quantities per product+warehouse,
default-warehouse fallback), `applyStockCommitments()` pure hydrator (+ synthetic zero-on-hand rows
so Available can show negative), `useStockCommitments()` hook. `stockService.getQuantityAvailable`
and `stockBalanceService.getAvailable` derive `committed` from the map (row's own field ignored —
still 0 in storage). Inventory register, item-detail Stock tab, and the Sales Order line editor
("On hand · Committed · Available", warn-don't-block) all show the real value. `applyDelta` /
`rebuildFromMovements` still emit 0 (committed is not ledger-derivable). Full detail:
`docs/INVENTORY_ARCHITECTURE.md` § "STOCK COMMITMENT (PHASE 5A)". Gate (after the self-commitment
fix below): tsc / eslint `--max-warnings 0` / **2231 tests / 306 files** / `vite build` all green.

**Still 0 until data exists:** `committed` displays 0 for a product until a `confirmed` Sales Order
references it. `On Order` (open POs) and `In Transit` (transfers) stay out of the formula until
Phase 6. Per-line `ordered − delivered` netting is Phase 5B.

### Editing a confirmed Sales Order made it compete with itself for stock (self-commitment)
**Resolved (Phase 5A CP-5A correction, 2026-09-03 — code-complete, uncommitted on
`phase-9b-relationship-design-and-code`).**

- **Area:** Inventory / Sales — `SalesOrderForm` line-editor availability caption.
- **Severity:** Medium (spurious shortage warning; display only, never blocked submit or touched
  stock/GL).
- **Observed:** opening an already-`confirmed` Sales Order for editing — the global
  `getCommitmentMap()` already contains that order's own quantities, so the line editor counted the
  order's own reserved units as "committed to other orders" and could show a false shortage.
- **Expected:** the order's own reserved units are not "committed elsewhere" from its own editor's
  point of view; only *other* confirmed orders reduce available-for-this-order.
- **Accounting impact:** none — Sales Orders never post; caption is a read-only display signal.
- **Data impact:** none — no persistence, no cleanup needed (commitment is derived).
- **Fix:** document-context exclusion at the `SalesOrderForm` layer only — new pure helpers
  `ownCommitmentMap(order, defaultWarehouseId)` (the persisted order's own contribution to the
  global map; empty unless `status === 'confirmed'`) and
  `externalCommittedFor(global, own, productId, warehouseId?)` = `max(0, global − own)`. The global
  map / inventory register / product detail / stock reports / availability services are unchanged —
  they still count the edited order. `StockCommitmentService` is **not** globally altered.
- **Evidence:** `src/features/inventory/services/stockCommitmentContext.test.ts` (24 tests,
  incl. worked example onHand 20 / own 5 / external 7 → editor available 13),
  `src/features/sales/components/SalesOrderForm.commitments.test.tsx`. Detail:
  `docs/INVENTORY_ARCHITECTURE.md` § "Document-context self-commitment exclusion".

### Every product showed "Unknown tax rate" (and tax dropdowns offered dead ids) in the deployed app
Found 2026-09-03 during live browser QA. `taxRateService`
(`src/features/tax/services/index.ts`) was still wired to `MockTaxRateRepository`, so
the app-wide singleton served the hand-typed `src/mock-data/taxRates.ts` fixtures (ids
`tax_std_v1`, `tax_std_v2`, `tax_zero`, …). Every real product / invoice / bill is
Supabase-backed and carries a real UUID `tax_rate_id` (`04ea4780-…`). Those two id
spaces never intersect → `getTaxRateLabel()` fell through to "Unknown tax rate" for
every product, and every "pick a rate" dropdown (`useTaxRates`) offered ids that don't
exist in Supabase (so saving a product/document through the UI wrote a bogus
`tax_rate_id`). Not a data bug (verified read-only: all 50 products reference the valid
active STD rate; RLS policy `tax_rates_all_own_company` resolves fine for `admin@demo.com`),
not the September seed, not the row mapper — purely repository wiring. The historical
reason it stayed Mock-wired ("the Supabase `tax_rates` table is correctly empty, and
`billService.test.ts` fixtures reference `tax_std_v2`") no longer holds: the Office
National demo seeded the real STD/ZERO/EXEMPT rows on 2026-08-28. Fixed: flipped
`taxRateService` → `SupabaseTaxRateRepository`; moved `billService.test.ts` onto a
locally-constructed `new TaxRateService(new MockTaxRateRepository(), …)` (both now
re-exported from the tax service barrel), matching every other Supabase-wired service
test; `useAllTaxRates` gained a `.catch` + `error` (it was silently swallowing a failed
fetch into `[]`); `getTaxRateLabel(id, rates, { pending })` now returns `…` for an
as-yet-unresolved id while the list is empty/loading, so a valid id is never mislabelled
"Unknown". Zero DB writes. Full suite green.

### `calculateAgingForCustomer` silently summed every customer together when given an unfiltered multi-customer source
`src/features/customers/utils/calculateAging.ts`'s `calculateAgingForCustomer(customerId,
asOf, source)` only filtered `source` down to `customerId` via its third parameter's
*default value* (`getOpenItemsForCustomer(customerId)`) — a caller that passed its OWN
explicit `source` array (as any fleet-wide report reusing one invoice fetch across every
customer must) got no internal filtering at all, silently summing every customer's open
items together. Suppliers' equivalent (`src/features/suppliers/utils/calculateAging.ts`'s
`calculateAging(supplierId, asOf, bills)`) never had this asymmetry — it always filters by
`supplierId` internally regardless of caller. Found 2026-08-22 while building the Reports
module's Customer Aging report (the bee worked around it locally with an explicit
pre-filter and flagged it rather than silently trusting the existing function). Fixed at
the source the same day: `calculateAgingForCustomer` now always calls
`getOpenItemsForCustomer(customerId, source)` internally before bucketing — idempotent (a
no-op) on the default-parameter path, corrective on the bug path. New regression test in
`calculateAging.test.ts` passes an unfiltered two-customer array and proves only the
target customer's total comes back; QA independently confirmed this test would have failed
against the old code.

### Phase 9 Wave 2 (Provisional Tax) and the Reports module — both ✅ complete
**Provisional Tax (§54)**, `src/features/tax/provisionalTax/`: due dates for the
first/second/top-up payments computed from the company's own FinancialYear (never the
unrelated 1 March–end-Feb individual/PAYE tax year `getSarsTaxYear()` computes — a
distinction this module's own doc comments draw explicitly, mirroring Income Tax's). Estimates
reuse `calculateTaxLiability()` rather than reimplementing SBC/flat-rate math a second way.
`payProvisionalTax()` posts DR Income Tax Payable (`acc_2300`) / CR Cash and Bank
(`acc_1000`) — no new GL account needed, since a provisional payment is simply an early
debit against the same liability the final `TaxComputation` will credit at year-end; the
reconciliation (paid vs. actual) falls out of the GL for free rather than needing its own
mechanism. No underpayment-interest calculation — SARS's rate floats with the repo rate
rather than being a fixed statutory figure (§110/§111), so only the plain Rand-value gap is
surfaced. 23 new tests.

**Reports module**, three bees in parallel plus this session's own resume-after-usage-limit
recovery (see below): `src/features/reports/financialStatements/` (a classified Income
Statement ending in Net Profit After Tax, and a Balance Sheet that computes and displays
`Assets = Liabilities + Equity` rather than assuming it — flagged one honest constraint:
the identity only holds cleanly because this app has no year-end closing entry yet, verified
against real seed data that this doesn't currently cause a problem, not papered over);
`src/features/reports/cashFlow/` (indirect-method Cash Flow reconciled to real Cash and Bank
movement — the bee found and correctly fixed a real discrepancy in its own dispatch brief,
that dividends-paid is the GROSS debit to Dividends Payable net of the Dividends Tax Payable
credit, not a flat net figure, by reading `dividendDeclarationService.pay()` directly rather
than trusting the brief); `src/features/reports/aging/` (Customer/Supplier Aging Reports,
one row per entity — see the aging bug entry above, found while building this).

**A three-bee wave hit the session's usage limit mid-build** (each stopped with progress
saved, per the harness's own checkpoint mechanism) and was resumed via SendMessage once the
limit reset — each bee picked up exactly where it left off rather than restarting from
scratch, per its own "resume" report. Queen Bee then wired routes/nav for all 6 new pages,
rebuilt the `ReportsPage` hub (previously a bare placeholder) into a real grid linking to
all 5 new report pages, added `provisionalTax` to `src/types/index.ts`'s barrel, fixed the
aging bug above, and deliberately kept the pre-existing `/purchases/aging` Vendor Aging page
(bills-only suppliers) alongside the new, broader `/reports/supplier-aging` (every supplier,
with a toggle) as two legitimately different reports rather than dedup**e**ing them.

706/706 tests passing (up from 631), type-check/lint/build clean, independently QA-verified
(zero defects found — the QA pass specifically traced the Balance Sheet identity and the
Cash Flow reconciliation's non-circularity rather than trusting the tests alone).
Deliberately still open, not gaps in this pass: Deferred Tax (§50, Phase 12); no reversal
path for a posted `TaxComputation`/`ProvisionalTaxPeriod` slot; no Notes to Financial
Statements/Statement of Changes in Equity/comparatives/export (§43, out of scope); Cash
Flow's working-capital tracking is scoped to AR/Inventory/AP only (any other cash-touching
account would correctly surface as a reconciliation variance, not silently pass).

### Phase 9 Income Tax's capital-gain adjustment was a manual zero placeholder
`TaxComputationService.prepareComputation()` (`src/features/tax/incomeTax/`) auto-suggests
a `disposal_gain_loss_addback` line per Fixed Asset disposal, removing the ACCOUNTING
gain/loss from taxable income per §55's "separate accounting profit from taxable capital
gain" requirement — but at the point the income-tax bee finished, the parallel
capital-gains bee's module (`src/features/tax/capitalGains/`) hadn't landed yet, so the
real `recoupment_or_capital_gain` figure was a manual, zero-amount, user-filled placeholder.
Fixed the same day, immediately after both bees finished: `TaxComputationService` gained an
optional `capitalGainsLookup` constructor dependency (`CapitalGainsLookup`, kept optional so
the income-tax bee's own existing tests — which construct the service without a 10th
argument — keep passing unchanged); `src/features/tax/incomeTax/services/index.ts` wires it
to the real `capitalGainsService.getPeriodReport()` singleton. The suggested adjustment line
is now pre-filled with the real taxable capital gain for the financial year (still fully
user-editable before posting, per §111), with the description citing the Capital Gains Tax
module and surfacing any net capital loss for the period. Proven by a new test in
`taxComputationService.test.ts` ("pre-fills the capital-gain adjustment from an injected
CapitalGainsLookup..."). 631/631 tests passing, type-check/lint/build clean.

### Payroll (Phase 8) tax figures were unverified placeholders
`src/mock-data/payrollTaxConfig.ts`'s PAYE brackets/rebates, UIF ceiling, and SDL
rate/threshold were originally reconstructed from general training knowledge of a
recent published SA individual tax year, mapped onto this app's fictional current
2026/2027 SARS tax year as a stand-in — not the real published 2026/2027 tables and not
independently verified against any official source. Fixed 2026-08-22, same day: fetched
the live sars.gov.za pages directly (`WebFetch`/`WebSearch`, not recalled from memory)
— the individual tax rate table, UIF rate/ceiling, and SDL rate/threshold, each cited by
URL in the seed record's `sourceReference` and per-field comments. The bracket table was
cross-checked two independent ways (a direct page fetch and a search-engine summary of
the 2026 Budget tax guide PDF) and agreed exactly. Real changes from the old placeholder
figures: PAYE bracket thresholds/bases moved up (245,100/383,100/530,200/695,800/887,000/
1,878,600 vs. the old 237,100/370,500/512,800/673,000/857,900/1,817,000 — the genuine
2026/27 inflation-adjusted brackets, the first such adjustment since 2023/24) and
rebates increased (primary R17,820/secondary R9,765/tertiary R3,249 vs. the old
R17,235/R9,444/R3,145); UIF ceiling (R17,712/month) and SDL rate/threshold (1%,
R500,000) were unchanged — the placeholder had gotten those two right already. Tests
that hardcoded the old bracket boundaries as literals were rewritten to derive expected
values from the seeded config instead, so they stay correct across any future
re-verification. `docs/SA_SPEC_GAP_ANALYSIS.md`'s Phase 8 section still carries a
caveat — this is a live-web verification as of one date, not a substitute for
professional sign-off, and any future tax year's config must repeat the same process.

### Dashboard financials were fully mocked
Revenue/Expenses/Profit and the Cash Flow chart had no real General Ledger or Banking
data to draw from (`src/features/dashboard/mock-data/financials.ts`, commented
`TEMPORARY`, a fixed 6-month hand-typed series). Fixed 2026-08-22, now that the GL has
enough real posted activity to draw from: new `calculateMonthlyFinancials()`
(`src/features/dashboard/utils/`) computes real monthly Revenue/Expenses from posted
`JournalEntry` lines against revenue-/expense-type Chart-of-Accounts accounts (so a
credit note, which debits Sales Revenue, correctly reduces that month's revenue — no
special-casing needed) and real Cash In/Out from debit/credit movement on the single
Cash and Bank control account (`acc_1000`) — one source of truth rather than mixing in
Banking's `BankTransaction` records separately and risking the two disagreeing.
`calculateDashboardKpis()`/`calculateCashFlowSeries()` needed NO changes at all — both
only ever depended on the `MonthlyFinancials[]` shape, never the mock source directly,
so `useDashboardData.ts` just fetches `journalEntryService.getEntries()`/
`accountService.getAccounts()` now and computes real trailing-6-months data instead.
10 new tests, including two against the real seed ledger (non-zero Revenue/Expenses/
Cash In/Out for August 2026 — the month the seed data concentrates in — and a sanity
bound proving computed revenue can never exceed what was actually ever posted to Sales
Revenue).

### Invoice/Bill "Record Payment" actions existed as component props but were never wired up
`InvoiceDetail`'s `onRecordPayment` and `BillDetail`'s `onRecordPayment` were never
passed from `InvoicesPage`/`BillsPage`, and neither page had an amount-entry UI to
drive them. Fixed 2026-08-22 — rather than building a bespoke one-off amount field
(which would have meant calling `invoiceService`/`billService`'s naive
`recordPayment()` directly, bypassing the GL entirely), both detail pages now open the
SAME real, GL-posting forms the Customer Receipts / Payment Register pages already use
(`CustomerReceiptForm`/`PaymentForm`), pre-aimed at the one invoice/bill via a new
`presetInvoiceId`/`presetBillId` prop: customer/supplier, amount (the outstanding
balance), and a single allocation row are all pre-filled, still fully editable (e.g.
to record a partial payment) before submitting. Also tightened both detail
components' "Record Payment" button gating while wiring this — `InvoiceDetail` showed
it for a still-`'draft'` invoice (no real AR posted yet to pay down) and `BillDetail`
showed it for a `'void'` bill with a leftover `outstandingAmount` (a voided bill
carries no real liability), both now excluded. 6 new tests (3 per form, covering the
preset prefill, that it still submits correctly with no further input, and that an
unset preset leaves the form at its normal empty-state defaults).

### AR/AP subledger reconciliation showed a variance for partially-paid seed documents
`generateSeedPostings.ts` (2026-08-21) backfilled the ORIGINAL posting entry for every
non-draft/non-void seed Invoice/Bill, enough for VAT reconciliation (VAT is fully
recognized at posting time, unaffected by later payment status) but not for
`reconcileAccountsReceivable()`/`reconcileAccountsPayable()`: the GL's AR/AP control
account reflected the FULL original posting while the subledger total
(`total - amountPaid`) was net of payments with no matching GL credit. Fixed
2026-08-22: `generateSeedPostings.ts` now also generates a receipt/payment entry (DR
Cash and Bank / CR Accounts Receivable, or DR Accounts Payable / CR Cash and Bank,
mirroring `customerReceiptService.recordReceipt()`/`paymentService.createPayment()`
exactly) for every FULLY-ALLOCATED seed `CustomerReceipt`/`Payment`
(`unallocatedAmount === 0`) — `seedCustomerReceipts`/`seedPayments` gained a matching
`journalEntryId`, same `seedJournalEntryId()` pattern `seedInvoices` already used. The
one genuinely on-account seed receipt (money received with no invoice to apply it to
yet) is deliberately excluded — see below.

**Found and fixed along the way, not guessed**: cross-checking every seed Invoice/Bill
with `amountPaid > 0` against the seed `CustomerReceipt`/`Payment` records that were
supposed to explain it surfaced two real fixture bugs, not just the missing GL
postings: `rcpt_00000002` claimed `amount: 1500` against `inv_00000002`, but that
invoice's own `amountPaid` was `1437.50` (half of its `2875` total, matching its
`'partially_paid'` status) — the receipt was corrected to match the invoice, not the
other way around, since the invoice is what the subledger check actually reads. Three
paid/partially-paid invoices (`inv_00000006`, `inv_00000008`, `inv_00000014`) had NO
seed receipt behind their `amountPaid` at all — three receipts added
(`rcpt_00000004`-`rcpt_00000006`), each matching its invoice's real `amountPaid`
exactly. Proven, not just claimed: a new integration test
(`subledgerReconciliation.test.ts`) wires the real `JournalEntryService` against the
real seed ledger and real seed Invoices/Bills and asserts both `reconcileAccountsReceivable()`
and `reconcileAccountsPayable()` report `isReconciled: true` — it failed against the
first backfill attempt (the two fixture bugs above), which is how they were caught.

**Deliberately still not backfilled**: `rcpt_00000003` (2000 on-account, no invoice
allocation) gets no journal entry. A real `recordReceipt()` call always credits AR for
the full amount regardless of allocation, but `reconcileAccountsReceivable()` only
sums open invoice balances, not unapplied cash sitting against a customer with no
invoice to net against — posting this one would introduce a genuine reconciliation
variance of its own (real unapplied-cash accounting, not currently modeled), a
separate, narrower gap left as-is rather than papered over.

### No Bill-line capitalization path into the Fixed Asset Register
`FixedAsset.sourceBillId` existed specifically for this since Phase 7 shipped
(2026-08-22), but nothing set it — an asset could only be registered manually on the
Asset Register page, not by flagging a Bill line item as "this is a fixed asset, not
an expense" the way Inventory lines already capitalize. Fixed same day, later pass:
`DocumentLineItem` gained an optional `fixedAssetDetails` (category/useful life/
depreciation method/residual value/reducing-balance rate/tax wear-and-tear rate —
`src/types/fixedAsset.ts`'s `FixedAssetLineDetails`), mutually exclusive with
`productId`. `billService.postBill()`'s expense/inventory split became a three-way
split (`splitLineItems()`): a `fixedAssetDetails` line now debits Fixed Assets
(`acc_1500`) instead of Operating Expenses, in the SAME journal entry as the rest of
the bill. `FixedAssetService.capitalizeFromBillLine()` writes the register row
directly as `'active'` (not through the draft-then-`postAcquisition()` flow every
manually-registered asset uses) — the Bill's own posting IS the capitalization event,
mirroring how a Bill's tracked-inventory line results in stock being received
immediately with no separate "post" step of its own. The Purchases
`LineItemsEditor` (shared by PurchaseOrderForm and BillForm) gained an
`allowFixedAssetCapitalization` prop, passed `true` only from `BillForm` — capitalizing
on a PO makes no accounting sense, nothing has been invoiced yet. Checking a line's new
"Asset" toggle clears `productId` and expands an inline panel (category, useful life,
method, residual value, conditionally the reducing-balance rate, and the SARS
wear-and-tear rate prefilled from the category default) rather than adding columns to
the already-dense line-item grid. 5 new `billService` tests (single fixed-asset line,
three-way split alongside Inventory/Expense lines), 4 new `fixedAssetService` tests
(`capitalizeFromBillLine`'s active-on-creation behavior, sequential asset numbering
alongside manual registrations, shared validation), 6 new `LineItemsEditor` tests.

### GL posting engine had no storage-layer enforcement of the balance invariant
`JournalEntryService.postJournalEntry()` validated sum(debit) === sum(credit) in
application code before writing, but the mock repository was an in-memory array with
no `CHECK` constraint or transaction backing it — a real DB should still enforce this
independently at the storage layer, since application code alone can't stop a second
writer with direct storage access from bypassing the service. Fixed 2026-08-22:
`MockJournalEntryRepository` now independently re-checks the balance invariant, both
in its constructor (against whatever seed data it's given) and in `create()` — the
closest an in-memory array can get to a real CHECK constraint. 3 new tests (rejects an
unbalanced `create()`, rejects unbalanced seed data at construction, confirms the
existing seed ledger and every genuinely-posted entry still construct/insert cleanly).

### GL posting engine had no currency dimension
`JournalLine`/`JournalEntry` had no currency field at all, so every seeded account and
posting was implicitly single-currency even though `CurrencyCode` existed as a shared
primitive nothing used. Fixed 2026-08-22: `JournalEntry` gained an optional `currency`
field (entry-level, not per-line — a real double-entry transaction is denominated in
one currency; per-line transaction-currency + exchange-rate pairs for a genuine
foreign-currency transaction is Phase 12/Advanced FX-translation scope, not attempted
here). `JournalEntryService.postJournalEntry()` always populates it now (defaults to
`'ZAR'`, overridable per entry via a new optional constructor param), and
`reverseJournalEntry()` carries the original entry's currency forward rather than
silently reverting to the default. 4 new tests.

### Aging-bucket key-name inconsistency between Customers and Suppliers
`src/features/customers/utils/calculateAging.ts` and
`src/features/suppliers/utils/calculateAging.ts` were built independently (parallel
Wave 1 dispatch) and produced differently-shaped bucket objects for the same concept:
- Customers: `{ current, days1to30, days31to60, days61Plus, total }`
- Suppliers: `{ current, days30, days60, days90Plus, total }`

Dashboard Bee had already correctly normalized both into a shared `FleetAgingBuckets`
shape rather than assuming they matched, so nothing was ever actually broken — but the
inconsistency itself remained in the two source files. Fixed 2026-08-22: Customers'
`AgingBuckets` renamed to match Suppliers' convention (`days30`/`days60`/`days90Plus`),
the more common "Current/30/60/90+" framing and the one already closer to
`FleetAgingBuckets`' own `bucket30`/`bucket60`/`bucket90Plus` naming — one shared shape
now, not two normalized at the Dashboard boundary. Every consumer (the aging math
itself, `CustomerAgingBreakdown`, `calculateArAgingForCustomers`, both feature's tests)
updated together.

### CRLF/LF git warnings on every commit
Every commit printed a `LF will be replaced by CRLF` warning per changed file (Windows
checkout, no `.gitattributes` committed). Fixed 2026-08-22: added `.gitattributes`
pinning `* text=auto eol=lf` (with an explicit CRLF carve-out for `.bat`/`.cmd` files,
which some Windows tooling still expects).

### FIFO was not an available valuation method — WAC was the only option
`StockService.calculateValuation()`'s own doc comment had flagged this since Phase 1:
FIFO needs a unit-cost tracked per individual goods-received lot, which
`StockMovement` (a single append-only ledger of quantity deltas, no per-lot cost) never
carried — deferred until Purchase Orders/GRNs existed to source real per-receipt costs.
Fixed 2026-08-22, once PO/GRN 3-way matching (below) gave FIFO a real cost source:
- `Product.valuationMethod?: 'weighted_average' | 'fifo'` — optional, defaults to
  `weighted_average` when absent, so every existing product keeps behaving exactly as
  before. Selectable in `ProductForm` (only shown for tracked-inventory goods).
- New `StockLot` (`src/types/stockLot.ts`) — one row per goods-IN event for a
  FIFO-valued product, holding `unitCost`/`quantityReceived`/`quantityRemaining`.
  Deliberately NOT append-only like `StockMovement`: `quantityRemaining` is a
  narrow, documented exception, decremented as FIFO consumption draws from a lot
  oldest-first. `StockMovement` remains the sole, complete, immutable audit trail of
  every quantity change for every product regardless of valuation method — `StockLot`
  is a secondary costing structure layered on top, not a replacement.
- New `StockLotService` (`src/features/inventory/services/stockLotService.ts`):
  `previewFifoCost()` (read-only dry run) and `consumeFifoLots()` (the real mutation,
  called only after the GL entry posts) share one lot-walking algorithm, so a preview
  and its matching consume always agree — proven, not assumed, by 10 tests including
  multi-lot consumption spanning different unit costs, cross-warehouse/cross-product
  isolation, and a lot fully draining before the next one is touched. Throws a clear
  error (never a silently wrong or partial number) when open lots can't cover the
  requested quantity — "don't guess" over "post something plausible," same principle
  `splitDeductibleVat()` already applies to VAT.
- `InventoryPostingAdapter` branches on `product.valuationMethod` in all four
  operations: `calculateCogs()` previews FIFO cost instead of `quantity * costPrice`;
  `recordSaleMovement()` actually consumes lots after the stock movement posts;
  `recordReceiptMovement()` creates a new lot instead of recalculating the
  weighted-average (and still updates `costPrice` — informational only under FIFO,
  the "most recently received cost" for display, never consulted by FIFO's own
  costing math); `recordReturnMovement()` creates a new lot at a caller-supplied
  `unitCost`, falling back to the product's current `costPrice` if none is given.
- `creditNoteService.issueCreditNote()` now passes the EXACT per-unit cost it just
  reversed to the GL (`cogsByLine[i] / line.quantity`) into `recordReturnMovement()`'s
  new `unitCost` param — a FIFO return lot's cost can never disagree with the GL
  amount that was posted for it.
- `calculateCogs()` gained an optional `warehouseId` param (FIFO lots are tracked per
  warehouse; ignored for WAC) — threaded through from `invoiceService.postInvoice()`/
  `creditNoteService.issueCreditNote()`'s `line.warehouseId`, same pattern as the
  warehouse-attribution fix.
- 11 new tests directly on `InventoryPostingAdapter` covering all four FIFO branches
  (including proving a WAC product never touches the lot ledger at all).

**Deliberately still open**: no partial-lot-history migration — switching an existing
product to FIFO has no historical lots to draw on until its next real receipt, so a
sale before then will throw (see `StockLotService`'s "don't guess" behavior above,
not a bug). No FIFO valuation-report UI yet (open lots aren't surfaced anywhere in the
Inventory pages) — the engine is real and tested, the reporting view isn't built.

### Purchase Order Goods Receipt didn't move stock quantity or GL value (no real 3-way matching)
`purchaseOrderService.recordReceipt()` was status-only by design (2026-08-21) — stock
quantity and the Inventory GL value were only recognized when the resulting Bill
posted (`billService.postBill()`), not when the PO was marked received, so goods
physically received well before the bill posted (a common real lag) were invisible on
the books during that window. Fixed 2026-08-22 — real 3-way (PO/GRN/Invoice) matching:
- New GL account `acc_2050` "Goods Received Not Invoiced (GRNI)" — a liability/clearing
  account for goods physically received but not yet formally invoiced by the supplier.
- `recordReceipt()` now posts DR Inventory / CR GRNI for every tracked-inventory line
  item (ex-VAT — input VAT is only claimable against a real supplier tax invoice, the
  Bill, never at goods-receipt time), then records the real stock receipt via
  `InventoryPostingAdapter.recordReceiptMovement()` — GL posts first, stock mutates
  only after it succeeds, same ordering used everywhere else. Rejects receiving an
  already-received or cancelled PO (idempotency — this now posts a real GL entry, so
  running it twice would double-post). `PurchaseOrder` gained `receivedDate`/
  `journalEntryId` fields to track this.
- `billService.postBill()` checks whether the bill's linked PO already has a
  `journalEntryId` (i.e. was GRNI-received): if so, it debits GRNI instead of
  Inventory (clearing the liability) and does NOT call `recordReceiptMovement()` again
  — stock/value were already recognized at receipt time; recording it twice would
  double-count both quantity and any WAC/FIFO cost recalculation. A bill with no
  linked PO, or one linked to a PO that was never GRNI-received, behaves exactly as
  before (debit Inventory, record the receipt now).
- `purchaseOrderService`/`billService` are wired to the SAME `purchaseOrderService`
  singleton in `src/features/purchases/services/index.ts` (declared before
  `billService`, passed directly) — the same "two-disconnected-singletons" bug class
  already fixed once elsewhere in this codebase, avoided here by construction.
- 9 new tests (5 on `PurchaseOrderService.recordReceipt()`, including a genuinely
  balanced GRNI entry and the double-receipt guard; 1 dedicated GRNI-clearing test on
  `BillService.postBill()` proving Inventory is NOT debited again and the stock
  movement is NOT re-recorded).

**Deliberately still open**: no true partial receipt (a PO's `partially_received`
status exists on the type but `recordReceipt()` is still all-or-nothing per PO — only
some of a line's ordered quantity arriving isn't modeled). No price-variance handling
— relies on `purchaseOrderService.convertToBill()` copying a PO's line items verbatim
into the Bill (true today, and the only way a Bill gets linked to a PO through the
UI), so the Bill's own inventory-line value always exactly matches what GRNI
recognized; if that assumption were ever violated (a hand-edited Bill with different
amounts), GRNI would carry a genuine residual balance rather than silently
reconciling it away — a real variance surfacing honestly, not a masked one.

### `ProductsPage.test.tsx`'s "low stock" test failed only when run after its sibling tests
Introduced 2026-08-21 while wiring `ProductsTable`/`ProductForm` to the new
`useTaxRates()`/`useAllTaxRates()` hooks (Tax module) — flagged and explicitly left
unfixed that session per direct instruction ("not part of current phase"). Fixed
2026-08-21 (later session): the real cause wasn't hook-cancellation or DOM/state
leakage between tests — `findByText`'s own internal polling wasn't reliably catching
the render (confirmed by direct DOM inspection: the row was demonstrably present
moments after `findByText` reported a timeout), because `ProductsTable`'s
`useAllTaxRates()` fetch is a second async hop after products load, so the render
genuinely lands a tick later than a single-hop async render. Switched both async
assertions in the file to `waitFor(() => expect(screen.getByText(...)))` (explicit
poll loop) instead of `findByText`, and added an `afterEach(cleanup)` for good
measure. Passes reliably as part of the full suite now, not just in isolation.

### Stock/GL postings always used the single default warehouse
Neither `Invoice`/`Bill` line items nor `PurchaseOrder`/`Quote`/`SalesOrder` carried a
`warehouseId` field, so `InventoryPostingAdapter` (2026-08-21) posted every sale/
receipt/return stock movement against the one `Warehouse.isDefault` warehouse
regardless of which warehouse the goods actually left from or arrived at. Fixed
2026-08-22, right after the product-picker fix above (which is what made this worth
doing — the feature it refines can now actually be exercised from the UI):
- `DocumentLineItem.warehouseId?: ID` added — optional, so every existing document
  keeps working unchanged.
- `InventoryPostingAdapter.recordSaleMovement()`/`recordReceiptMovement()`/
  `recordReturnMovement()` all take an optional `warehouseId` now, resolved via a new
  private `resolveWarehouseId()`: use the given id if it resolves to a real warehouse,
  else fall back to the default — never a hard failure, since a stale/missing id
  shouldn't block a sale or receipt from posting. `DefaultWarehouseLookup` gained
  `getWarehouse(id)` to support this (already existed on the real `WarehouseService`,
  so only the interface needed extending).
- `invoiceService.postInvoice()`/`billService.postBill()`/
  `creditNoteService.issueCreditNote()` all now pass `line.warehouseId` through to
  their respective `InventoryMover`/`InventoryReceiver`/`InventoryReturnMover` calls.
- Both `LineItemsEditor`s gained a Warehouse column — but ONLY rendered when
  `warehouses.length > 1`, so a single-warehouse business (the common case, per the
  original "fine for a single-location business" framing) sees no extra UI at all.
  Disabled until a product is picked, since a custom/service line has no warehouse
  concept. Every form using the editors now calls `useWarehouses()` and passes the
  list down, same pattern as `products`/`taxRates`.
- New tests: 2 in `inventoryPostingAdapter.test.ts` (explicit id used when valid,
  falls back to default when it doesn't resolve), 1 each in `invoiceService.test.ts`/
  `billService.test.ts`/`creditNoteService.test.ts` proving `warehouseId` actually
  reaches the adapter call from a real `postInvoice()`/`postBill()`/
  `issueCreditNote()` run, not just at the adapter layer in isolation.

386/386 tests passing (up from 383), type-check/lint/build clean.

### No document line item created through the UI could ever carry a productId, and Invoices/Bills had no real way to post from the UI
Discovered 2026-08-22 while starting on "close remaining Phase 6 gaps" (per-warehouse
attribution, FIFO): every Cost of Sales/Inventory-capitalization/credit-note-reversal
feature built in Phase 6 was only reachable via seed data or direct service/test calls,
never from a real user clicking through the app, because:
- `src/features/sales/components/LineItemsEditor.tsx` (Quote/Sales Order/Credit Note)
  and `src/features/purchases/components/LineItemsEditor.tsx` (Purchase Order) had no
  product picker at all — free-text description only, `productId` never set.
- `InvoiceForm.tsx` didn't even use the shared editor — a separate, older
  implementation that hardcoded 15% VAT (`taxAmount = lineTotal * 0.15`) and was never
  rewired to the real `TaxRateService` despite Phase 5's docs claiming "every consumer"
  was.
- `BillsPage.tsx`'s "+ New Bill" button had no `onClick` handler — the only real path
  to a posted Bill was PO→Bill conversion (through the same product-less editor).
- `InvoicesPage.tsx` never passed `onMarkAsSent`/`onRecordPayment` to `InvoiceDetail`,
  so the one legitimate posting action (`invoiceService.postInvoice()` via
  `markInvoiceAsSent()`) never rendered — the only way to move an invoice off `draft`
  was a raw status `<select>` in the old `InvoiceForm`'s edit mode, which called
  `updateInvoice()` directly and could silently jump status to `'sent'`/`'paid'`
  without ever posting to the GL. `BillDetail` had no posting action at all.

Fixed the same day:
- Both `LineItemsEditor`s take an optional `products` prop (via `useProducts()`,
  passed from `QuoteForm`/`SalesOrderForm`/`CreditNoteForm`/`PurchaseOrderForm`/the
  rebuilt `InvoiceForm`/the new `BillForm`) and render a Product `<select>` per line.
  Picking a product sets `productId` and pre-fills description/tax rate and — a
  deliberate difference between the two editors — unit price from `product.unitPrice`
  on the Sales side (what we charge) versus `product.costPrice` on the Purchases side
  (what we pay). "Custom line" (empty selection) clears `productId` without touching
  anything the user typed. 6 new tests across both editors.
- `InvoiceForm.tsx` rebuilt to match every sibling form's pattern: real
  `useTaxRates()`/`useProducts()`, the shared `LineItemsEditor`. The raw status
  dropdown is gone — status is no longer directly editable from this form at all;
  posting only happens through the dedicated action below.
- `InvoicesPage.tsx` now wires `onMarkAsSent` to a new `markInvoiceAsSent()` mutation
  (`useInvoiceMutations`, delegating to the real `invoiceService.markInvoiceAsSent()`)
  so "Mark as Sent" actually renders and actually posts.
- New `BillForm.tsx` (mirrors `PurchaseOrderForm.tsx`'s pattern) plus a real "+ New
  Bill" flow in `BillsPage.tsx`, and a new `onPost` action on `BillDetail` wired to
  `billService.postBill()` — a standalone Bill can now be created AND posted through
  the UI, not just via PO conversion. `BillDetail`'s `onEdit`/`onRecordPayment` are
  now gated to `status === 'draft'`/`status !== 'draft'` respectively (editing or
  paying a bill that hasn't posted yet doesn't make sense) — `onRecordPayment` itself
  is still unwired, see Open above.

381/381 tests passing (up from 375), type-check/lint/build clean.

### Credit notes didn't reverse Cost of Sales or restore stock quantity
`creditNoteService.issueCreditNote()` reversed revenue/AR/VAT for a returned item
(§15) but was never wired to `InventoryPostingAdapter` — a returned tracked-inventory
item's original Cost of Sales entry (posted when the invoice sold it) stayed on the
books, and the item's stock quantity was never restored. Flagged 2026-08-21 while
wiring Cost of Sales onto `invoiceService.postInvoice()`, fixed the same day in a
later pass: `CreditNoteService` now takes an `InventoryReturnMover` dependency (wired
to the same `inventoryPoster` singleton `invoiceService`/`billService` already use)
and `issueCreditNote()` posts DR Inventory / CR Cost of Sales for every
tracked-inventory line item — but only when `reason === 'return'`, since a
pricing_error/discount/other credit note is a value adjustment with nothing physically
coming back. Added `StockMovementType: 'sales_return'` (distinct from `'adjustment'`
— a return is conceptually its own thing) and
`InventoryPostingAdapter.recordReturnMovement()`, which deliberately does NOT
recalculate weighted-average cost (unlike a purchase receipt, returned goods aren't a
new purchase at a new price). Cost is calculated at the product's CURRENT
weighted-average cost, same simplification `invoiceService.postInvoice()` already
makes — not necessarily the exact cost the goods left at if the WAC has since moved.
Stock is restored only after the reversal entry posts successfully, mirroring the
GL-then-mutate ordering used everywhere else. 4 new tests (reversal posts and
balances, stock restored, non-return reason does neither, non-tracked product does
neither).

### No Cost of Sales posted on a sale, no Inventory capitalization on a purchase
Phase 1's Inventory module had a real stock-movement ledger and WAC valuation, and
`StockMovementType` had carried `'sale'`/`'goods_received'` variants since Phase 1 —
but nothing ever called them. Fixed 2026-08-21: `invoiceService.postInvoice()` now
posts DR Cost of Sales / CR Inventory (§24) for every tracked-product line item, in the
same journal entry as the sale, then reduces stock after it posts; `billService.postBill()`
now capitalizes tracked-product lines to the Inventory asset instead of always
expensing the subtotal (§22), recalculating the product's weighted-average cost on
receipt. Both via a new constructor-injectable `InventoryPostingAdapter`
(`src/features/inventory/services/`), independently tested (10 tests) rather than only
reachable through the real singleton. A genuinely zero-value bill (no lines, no tax)
now throws a clear error instead of silently posting a malformed zero-amount GL line —
caught by a test failure while building this, not something that could have happened
before (the code path was previously unreachable in practice).

### Non-deductible input VAT was posted in full to VAT Input instead of the expense line
`billService.postBill()` used to debit `acc_2110` (VAT Input) for a bill's ENTIRE
`taxTotal`, with no check for `non_deductible`-treatment lines (e.g. `NODEDUCT`). Fixed
2026-08-21: `BillService` now takes a `TaxRateResolver` dependency (wired to the real
`taxRateService`); `splitDeductibleVat()` sums each line's VAT by resolved treatment,
capped at `bill.taxTotal` so the debit total can never drift from the AP credit
regardless of per-line data issues. Non-deductible VAT (and VAT on any line whose
`taxRateId` doesn't resolve at all — the conservative default is "don't claim it", not
"claim it anyway") folds into the Expense debit instead. 4 new tests covering
all-deductible, all-non-deductible, mixed, and unresolved-rate cases.

### VAT (and AR/AP) reconciliation showed a variance against every pre-existing seed document
`src/mock-data/journalEntries.ts` only ever seeded the opening-balance entry — none of
the seeded Invoices/Bills/Credit Notes had a matching real GL posting, so every
reconciliation report showed "Variance detected" out of the box regardless of whether
the underlying logic was correct. Fixed 2026-08-21: `generateSeedPostings.ts` generates
the exact JournalEntry a real `postInvoice()`/`postBill()`/`issueCreditNote()` call
would produce (mirroring the same account ids and math, including the non-deductible
VAT split above) for every non-draft/non-void seed document, and `seedInvoices`/
`seedBills`/`seedCreditNotes` now set a matching `journalEntryId`. Proven, not just
claimed: an integration test (`vatReportService.test.ts`) wires the real
`JournalEntryService` against the real seed data across all of 2026 and asserts
`isReconciled === true` for both VAT Output and VAT Input. The AR/AP subledger
reconciliation still shows a variance for partially-paid documents specifically — see
Open above, a narrower, separate remaining gap (payment/receipt entries, not the
original posting).

### Delete had no posted-record guard across 7 services (SA spec §14/§36/§72/§79)
`deleteInvoice`/`deleteBill`/`deleteCreditNote`/`deleteQuote`/`deleteSalesOrder`/
`deletePurchaseOrder`/`deleteCustomer`/`deleteSupplier` all called
`repository.delete(id)` unconditionally. Fixed 2026-08-21: each now guards on status —
`deleteInvoice`/`deleteBill`/`deleteCreditNote`/`deleteQuote` require `'draft'`,
`deleteSalesOrder` requires `'pending'` (no true draft state), `deletePurchaseOrder`
requires `'draft'`, and `deleteCustomer`/`deleteSupplier` check for linked open
Invoices/Bills (see next item) rather than a status, matching
`docs/DO_NOT_BREAK.md`'s existing pattern of never-hard-delete-with-history. 2 new tests
added (draft deletes succeed, posted deletes are rejected); 2 pre-existing tests that
deleted a seeded non-draft bill/PO were updated to use a draft fixture instead (a test
data problem, not a false failure — the guard's new behavior is correct).

### Customers/Suppliers aging (and their delete-guards) were still on temporary mock data
Flagged 2026-08-20 as blocked on Sales/Purchases not existing; Wave 1b (2026-08-21)
shipped both. Fixed 2026-08-21: added `invoicesToOpenItems()`/`billsToOpenBills()`
adapters converting real, non-draft/non-void Invoice/Bill records (aged on the
*outstanding* balance, `total - amountPaid`, not the original total) into the existing
`OpenItem`/`MockOpenBill` shapes the aging math already consumed — no signature changes
needed to `calculateAging`/`calculateFinancialSummary` themselves. Rewired: Customer/
Supplier Detail pages, the Dashboard's fleet-wide AR/AP aggregation
(`calculateArAgingForCustomers`/`calculateApAgingForSuppliers` now take real
invoices/bills as parameters), and `customerService.deleteCustomer()`/
`supplierService.deleteSupplier()`'s linked-history guards (previously Supplier's guard
checked mock data; Customer had no guard at all despite a doc comment claiming
customers are "NEVER hard-deleted"). One existing test asserted the guard against a
seeded supplier (`sup_00000001`) whose only real Bill is fully paid — updated to use
`sup_00000004`, which has a real unpaid bill, since the guard's *behavior* is unchanged,
only which fixture demonstrates it.

**Found along the way, also fixed**: `src/features/sales/hooks/useCustomerMap.ts`
constructed its own separate `CustomerService`/`MockCustomerRepository` instance instead
of importing the canonical singleton from `src/features/customers/services/
customerService.ts` — the same "two disconnected in-memory stores" bug already fixed
once this session for `InvoiceService` (see the Wave 1b commit). Now imports the shared
singleton.

### Tax invoices didn't render real company/VAT registration data (SA spec §13)
`InvoiceDetail.tsx`'s `companyName` prop defaulted to the literal string `'Your
Company'`, never wired to the real `Company` entity. Fixed 2026-08-21: added
`useCompany()` (`src/features/admin/hooks/`), and both `InvoiceDetail` and
`CreditNoteDetail` now accept a `company` prop rendering the real name, VAT
registration number, and CIPC registration number when available. `Company` has no
address field yet, so that's still not renderable — not fabricated, left absent.

### No AR/AP subledger reconciled to its GL control account (SA spec §17/§18/§70/§71)
Nothing compared sum(open invoices)/sum(open bills) against the GL's `acc_1100`/
`acc_2000` balance. Fixed 2026-08-21: added `reconcileAccountsReceivable()`/
`reconcileAccountsPayable()` (`src/features/accounting/services/
subledgerReconciliation.ts`), each comparing the control account's real posted GL
balance (via `journalEntryService.getAccountLedger()`) against the real subledger
total, with 5 tests covering an exact match, a fully-unposted invoice, a
partially-posted bill, and draft/void exclusion. Surfaced on the Trial Balance page as
a "Subledger Reconciliation" section (`SubledgerReconciliationCard`) — a variance is
shown, never silently corrected, matching §40's suspense-account principle.

### Purchase Order could be converted to a Bill more than once
`PurchaseOrder` had no `billId`/converted-status field, and `PurchaseOrderDetail`'s
`canConvert` guard didn't track that a conversion already happened. Fixed 2026-08-21:
added `PurchaseOrder.billId?: ID`, set once `PurchaseOrdersPage`'s "Convert to Bill"
action succeeds; `purchaseOrderService.convertToBill()` now rejects a PO that already
has one (enforced at the service layer, not just hidden in the UI).

### `ARCHITECTURE.md` claimed Phase 0 work was done when the repo was empty
At hive startup (2026-08-20), `docs/ARCHITECTURE.md`'s "Current Phase" section had
✅ checkmarks against Architecture/Design System/Routing/Auth/Mock repos, but the
filesystem had no `src/`, no `package.json` — nothing but docs and agent personas.
`docs/DEVELOPMENT_STATUS.md` and `docs/HIVE_TASKS.md` correctly showed everything
unchecked/🔴. Treated the task board as source of truth and corrected `ARCHITECTURE.md`
once real work landed. **Lesson**: docs can drift from reality even at hour zero;
audit the filesystem, don't trust doc checkmarks.

### npm audit: 7 vulnerabilities requiring breaking major-version upgrades
Post-Phase-0, `npm audit` found `esbuild`/`vite` (moderate, dev-server request
forgery) and `react-router` (moderate, open redirect + SSR deserialization issue),
both only fixable via `npm audit fix --force`: Vite 5→8, react-router-dom 6→7.18,
`vitest` 2→4 (transitive), `@vitejs/plugin-react` 4→6 (peer-dep bump needed
separately, `--force` alone left it mismatched). Fixed; `npm audit` now reports 0
vulnerabilities. **Follow-on breakage from the majors, also fixed**:
- `src/app/App.tsx` imported `type { Router as RemixRouter } from '@remix-run/router'`
  — that package no longer exists in React Router v7 (merged into `react-router`).
  Replaced with `ReturnType<typeof createBrowserRouter>`.
- `vite.config.ts` used `__dirname`, which Vite 8 deprecates in favor of
  `import.meta.dirname`.
- Architect Bee's dependency-upgrade report initially didn't mention the `vitest` 2→4
  bump (only react-router-dom/vite/plugin-react) — QA Bee's independent `git diff`
  review caught it. Not a functional problem (tests stayed green), but a reminder that
  self-reports need independent diff verification, not just command-output trust.

### `ROUTES.md` domain grouping doesn't match bee/feature-folder ownership
`docs/ROUTES.md` puts the Customer Directory under `/sales/customers` and the Vendor
Directory under `/purchases/vendors` (matching how real accounting software groups
AR/AP under Sales/Purchases menus), but `customers-bee`/`suppliers-bee` own
`src/features/customers/`/`src/features/suppliers/` per their persona files — not
`src/features/sales/`/`src/features/purchases/`. Resolved by scoping each bee to its
own feature folder plus exactly one named "exception file"
(`src/features/sales/pages/CustomersPage.tsx`,
`src/features/purchases/pages/VendorsPage.tsx`) that assembles their components —
avoids both bees touching `router.tsx`/`navigation.ts` and avoids folder-ownership
confusion. Documented in `docs/ARCHITECTURE.md` so it doesn't get "fixed" into a
folder move later without realizing it's intentional.

### Repository-location convention inconsistency (Customer vs. everyone else)
`MockCustomerRepository` lives at top-level `src/repositories/mock/` because it was
Phase 0's reference-pattern proof (ADR 001) — but its own doc comment directs every
OTHER feature to put repositories feature-local at `src/features/[feature]/repositories/`.
Not a bug, but easy to copy the wrong precedent if a bee reads the file location
instead of the doc comment. Now called out explicitly in every subsequent bee's
dispatch brief and in `docs/ARCHITECTURE.md`.

### Icon-registry gaps discovered iteratively, not upfront
The Icon System was designed before any feature UI existed, so the initial registry
(33 keys) covered nav/chrome/domain concepts but missed common row/table-action icons.
Customers Bee and Suppliers Bee (parallel Wave 1) both independently hit missing
`edit`/`add`/`delete`/`filter`/`download`/`view`/`sort`/`calendar`/`phone` and correctly
worked around it with text-label fallbacks rather than importing `lucide-react` directly
or editing the frozen registry mid-parallel-run. Fixed in a dedicated follow-up UI Bee
pass once Wave 1 landed. Dashboard Bee (Wave 2, solo dispatch, no parallel-write risk)
later added `trendUp`/`trendDown` directly. **Lesson**: expect at least one follow-up
icon-registry pass per wave; budget for it rather than treating it as a surprise.

### Parallel-dispatch file-conflict risk (process fix, not a code bug)
Running multiple bees concurrently against the same working directory (no git
worktrees) risks silent last-write-wins collisions on any shared file two bees both
touch (`router.tsx`, `navigation.ts`, `icons.ts` were the real risks). Mitigated by:
scoping each parallel bee to disjoint folders, freezing shared config files during
multi-bee waves (only a single sequential bee — or a solo-dispatch wave — may touch
them), and deferring cross-module wiring to genuinely sequential passes. Held for
all of Phase 1 Wave 1 without incident.

### ADR 002 (sequential-only worker execution) — obsoleted
Originally: workers dispatched strictly sequentially, because the hive was assumed to
run on a local Ollama Qwen3:8b instance with limited VRAM. User confirmed (2026-08-20)
that constraint no longer applies. Superseded in `docs/DECISIONS.md`: parallel dispatch
is fine when bee scopes don't overlap and there's no dependency ordering; still
sequence bees that share files or have producer/consumer dependencies (e.g. Dashboard
Bee needed Wave 1's services to exist first).
