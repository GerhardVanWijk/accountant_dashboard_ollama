# Vertex Accounting — CURRENT TASKS

**Authoritative project status**  
**Date:** 2026-09-05 (FINAL CORE HARDENING run)  
**Branch:** work on `hardening-2026-09-05` (off `main` `f7ec377`); `main` untouched pending human QA  
**Gate:** 2739 tests / 332 files PASS · TypeScript PASS · ESLint (`--max-warnings 0`) PASS · Build PASS  
**Live accounting:** Trial Balance difference `R0.00` — byte-identical to pre-run baseline. GL 1200 `R1,478,853.74` = physical inventory valuation exactly. 247 JE / 928 lines / 0 unbalanced / 343 stock movements / 0 negative / 0 cross-company.  
**Latest applied migrations:** `0063_normalized_line_warehouse_parity_correction` + `0064_core_permission_catalog_extension` — both APPLIED + LIVE-VERIFIED this run (data / catalog only, zero DDL on business tables)  
**Normalized document line flag:** `NORMALIZED_DOCUMENT_LINES_ENABLED = true` — **ACTIVATED this run** (parity 340/340 clean, forward smoke test passed — see P3)  
**FIFO flag:** `FIFO_VALUATION_ENABLED = false` — unchanged; 0 live products on FIFO; gate re-confirmed unreachable  
**Permission catalog:** 18 features (9 M11 + 9 new via 0064); route gates on every Sales/Purchasing/Banking/Assets/Tax/Compliance/Periods/Audit route; representative action gates; `user_roles` still 0 → no lockout (admin/superuser bypass)

## STATUS THIS RUN — read first

- **CORE COMPLETE:** normalized document lines activated · app-wide permission catalog + route enforcement + representative action enforcement + Financial-Periods self-lockout guard · FIFO gate re-confirmed · final accounting gate green · live accounting byte-identical to baseline.
- **HUMAN QA REQUIRED:** browser QA of the branch (§P1) — now also a role-based click-through of the new permission gates (viewer / stock_controller / sales_manager / finance_manager / accountant / admin). No browser tooling in this environment.
- **POST-V1:** exhaustive per-button action gating on banking/assets/tax/compliance + document detail pages (post/reverse/void) · jsonb `line_items` warehouse enrichment from posted movements · normalized-line reader migration · Accounting Settings (Block C) · FIFO persistence · multi-currency.

---

## 1. WHERE WE STAND

Vertex Accounting is now in **completion / production-hardening**, not core-engine construction.

The full system audit covered **128 routes across 17 feature domains**. The major accounting engines are real and operational: Sales/Fulfilment, Purchasing, Inventory, Banking/Reconciliation, General Ledger, Fixed Assets, Payroll, Tax, Reporting/Forecasting, Compliance, Related Parties, FX infrastructure, Leases, Administration, and Settings.

Current maturity is approximately **90%+ of the intended core product**. Remaining work is concentrated in production correctness, permissions, normalized-line activation, a small amount of accounting/settings hardening, browser QA, and optional post-v1 enhancements.

**FINAL CORE HARDENING progress (2026-09-05):** builds on the earlier Block A/B run (0061 return-aware fulfilment, FIFO gate, 0062 SO→invoice projection — all live). This run: (1) **normalized document lines ACTIVATED** — migration `0063` corrected 58 seed-written stray `warehouse_id` values, live parity swept 340/340 clean, rollback-wrapped forward-write smoke test passed, `NORMALIZED_DOCUMENT_LINES_ENABLED` flipped to `true`; (2) **app-wide permission catalog** — migration `0064` added 9 features / 38 permissions / 86 role grants under the brief's APPROVED policy, with `<PermissionRoute>` route gates on every Sales/Purchasing/Banking/Assets/Tax/Compliance/Periods/Audit route, representative `useCanAccess()` action gates, and a Financial-Periods self-lockout guard; no `user_roles` write (no lockout — admin/superuser bypass); (3) **FIFO gate re-confirmed** unreachable; (4) **final gate green** (2739/332, tsc/eslint/build); (5) **live accounting byte-identical** to baseline (TB 0.00, GL 1200 = physical inventory R1,478,853.74). Browser QA + role-based click-through: still REQUIRED (no browser tooling here). `main` unchanged at `f7ec377`; all code on `hardening-2026-09-05`, all migrations live, NO production deploy.

Do **not** reopen completed phases unless a verified regression requires it.

---

## 2. COMPLETED

### Core accounting and inventory

- Phases 0–8 + 9A complete.
- Phase 9B normalized document-line projection tables complete, backfilled, parity-checked.
- Immutable double-entry accounting engine in place.
- GL / Chart of Accounts / Journals / Trial Balance / Financial Periods complete.
- Inventory WAC accounting, movements, warehouses, stock takes, adjustments, transfers, supplier returns, opening stock and reporting complete.
- GL 1200 physical inventory reconciliation operational.
- Account company-safety hardening migration applied with zero live violations.

### Sales and fulfilment

- Quotes.
- Sales Orders.
- Stock commitments.
- Partial invoicing.
- Delivery Notes.
- Return Notes for delivered-but-uninvoiced goods.
- Invoices.
- Credit Notes.
- Customer Receipts.
- Customer Deposits / account 2600.
- Historical/frozen-cost return handling where evidence exists.
- Credit Note original invoice-line picker.
- Global document traceability and canonical full-page routes.

### Purchasing

- Suppliers/vendors.
- Purchase Orders.
- Goods receipt / GRNI flow.
- Bills.
- Supplier payments.
- Vendor aging.
- Real GL posting and reconciliation.

### Banking

- Bank accounts.
- Statement import.
- Split allocation with VAT handling.
- Bank reconciliation.
- Reconciliation intelligence / books-integrity investigation.

### Tax and compliance

- VAT201.
- Income Tax.
- Capital Gains.
- Dividends Tax.
- Provisional Tax.
- Deferred Tax.
- Expected Credit Losses.
- Public Interest Score / audit-review determination.
- Reporting-framework suggestion.
- Related Parties register.
- FX infrastructure/calculator.
- IFRS 16 lease accounting.

### Fixed assets and payroll

- Draft → capitalize → depreciate → dispose asset lifecycle.
- Straight-line / reducing-balance depreciation.
- Bill-line capitalization.
- SARS wear-and-tear tax register.
- Payroll employees / runs / EMP201 / EMP501.
- PAYE / UIF / SDL engines for current configured tax year.

### Reports and forecasting

- Income Statement.
- Balance Sheet.
- Cash Flow.
- Customer Aging.
- Supplier Aging.
- Budget vs Forecast vs Actual.
- Variance / Variance %.
- 6-month / 12-month views.
- Recharts graphics.
- Deterministic evidence-backed variance causes.
- Drill-down from variance to accounting evidence.
- Financial-advisor print/export report using current print/export framework.

### UX / architecture

- Record-detail full-page migration complete, including Journal Entry.
- Global Select migration completed for primary transaction UX.
- Global Search extended across major document types.
- A4 business-document framework and company profile complete.
- Audit Trail and Access Log real and populated.

---

## 3. ACTIVE — DO NEXT

### P0 — APPLY MIGRATION 0061 — PRODUCTION CORRECTNESS ✅ DONE (2026-09-05)

**Status:** APPLIED + LIVE-VERIFIED (registered `20260905132351`).  
**What was proven live (rollback-wrapped, zero persistence):**
- Scenario A — SO 10 → DN 6 → RN 2 uninvoiced → a **second DN of 6 SUCCEEDS**, remaining → 0; a 3rd delivery correctly rejected.
- Scenario B — SO 10 → DN 6 → RN 2 → direct invoice 3 succeeds (physical fulfilled 7, remaining 3); an over-invoice of 4 correctly rejected with `"6 already delivered, 2 already returned, 3 already directly invoiced"`; the exact remaining 3 accepted.
- Scenario C — two DNs (4 + 3) + one RN (1) net to remaining 4 with no double-count; over-delivery of 5 rejected, exact 4 accepted.
- Accounting: every delivery-note / return-note journal line touches ONLY GL 1200 / 1220 — no revenue, VAT, AR or COGS. Frozen delivery cost is re-used by the return.
- `security invoker` + `search_path=public` + `authenticated`-only grants preserved; `public`/`anon` revoked.

Trial Balance, GL 1200 (= physical inventory exactly), GL 1220, stock-movement count, negative-stock and unbalanced-journal counts all **unchanged** after apply.

_(Original P0 problem statement retained below for the record.)_

**Severity:** was HIGH PRIORITY / current production inconsistency  
**Schema impact:** none; replaces existing RPC/function logic  
**Expected accounting impact:** none beyond allowing valid fulfilment flow

#### Problem

The UI now correctly nets Return Notes when calculating remaining fulfilment, but the live DB RPCs still use the pre-return formula.

Worked example:

- SO ordered = 10
- Delivery Note delivered = 6
- Return Note returned uninvoiced = 2
- Net delivered = 4
- Remaining to deliver should = 6

The UI shows 6 remaining, but the live DB can reject the second delivery because `post_delivery_note` / `create_invoice_from_sales_order` still use the older formula.

#### Required action

1. Read-only preflight.
2. Reconfirm migration 0061 exact diff and test coverage.
3. Apply migration 0061 to the intended Supabase project.
4. Run rollback-wrapped/live-safe worked example proving 10 → 6 → return 2 → redeliver 6.
5. Verify no double-counting with direct invoices.
6. Verify GDN-I reconciliation nets Return Notes.
7. Recheck Trial Balance, GL 1200, GL 1220, stock movement count, negative stock and unbalanced journals.
8. Update docs after live verification.

**DONE when:** UI and DB use the same return-aware fulfilment formula and the full scenario succeeds without accounting drift.

---

### P1 — HUMAN BROWSER QA OF CURRENT PRODUCTION

**Status:** REQUIRED  
**Reason:** Recent major features are automated-test and DB verified, but not fully human browser tested.

Priority QA areas:

- Sales Order commitment / remaining-to-deliver / remaining-to-invoice.
- Delivery Note create/post/print/invoice.
- Return Note create/post/print/redelivery effect.
- Credit Note original-line picker and return quantities.
- Forecasting tables, charts, drill-down, 6/12-month filters and print report.
- Journal Entry full-page record and reversal/source display.
- Inventory product detail, committed/on-hand/available, movement links.
- Global Search for Invoice/Bill/Quote/SO/PO/DN/RN/CN/JE.
- Desktop/tablet/mobile layouts.
- Print output for Invoice, Delivery Note, Return Note and Forecasting report.
- **Permission gates (new — migration 0064):** sign in as (or assign a test user) each of `viewer`, `stock_controller`, `sales_manager`, `finance_manager`, `accountant`, `admin`. Confirm: viewer sees read-only everywhere and no create/post buttons; stock_controller can post a Delivery/Return Note but has no "New credit note" / "Record payment" / period-close; sales_manager works Quotes→SO→CN but cannot open Banking/Tax; finance_manager can open everything but sees no mutation buttons; accountant has the full operational set but not Users & Roles; admin/superuser unaffected. Direct-URL navigation to a gated route the role lacks shows Access Denied, not the page.
- **Normalized-line flag (now `true`):** create + edit one Invoice, Bill, PO and Credit Note through the running app and confirm the document renders, prints, and appears in search exactly as before (jsonb stays authoritative; the normalized rows are a silent dual-write).

Record all visual defects into one consolidated batch. Do not create one phase per visual issue.

---

### P2 — APPLICATION-WIDE PERMISSIONS ROLLOUT ✅ CORE DONE (2026-09-05)

**Status:** APPROVED (FINAL CORE HARDENING brief) + APPLIED. Migration `0064_core_permission_catalog_extension` live: 9 new features (`sales_documents`, `fulfilment`, `purchasing`, `banking`, `assets`, `tax`, `compliance`, `financial_periods`, `audit`), 38 permission rows, 86 role grants. `permissionRouteMap.ts` + `router.tsx` `<PermissionRoute action="read">` on every previously-ungated core route. Action gates on the primary create/record controls of Quotes/SO/CN/Receipts/PO/Bills/Payments + Financial-Periods manage/self-lockout. Tests: `permissionCatalogHardening.test.ts` (36) + FinancialPeriodsPage gate tests.  
**No lockout:** `user_roles` = 0, only functional users are admin+superuser (bypass), 4 viewer profiles have no company. Migration writes zero `user_roles` / zero `profiles` changes. See `docs/PERMISSIONS.md` § "Ungated areas — CLOSED".  
**RLS / tenant isolation:** UNCHANGED. 0064 is catalog data only — no policy, no `ALTER TABLE`. RLS keyed off `profiles.role` stays the only DB boundary.  
**Remaining (POST-V1):** exhaustive per-button gating on banking/assets/tax/compliance + detail-page post/reverse/void controls — route `:read` gates already block every role lacking read; residual is a read-only role seeing a mutation button that then hits RLS (defense-in-depth). Continues with human QA.

_(original problem statement retained below for the record.)_

**Was:** STOPPED FOR PRODUCT APPROVAL.  
**Severity:** MEDIUM  
**RLS / tenant isolation:** existing company RLS remains separate and must not be weakened.

#### Live evidence gathered this run

- **6 system roles** (no custom roles): `accountant`, `employee`, `finance_manager`, `sales_manager`, `stock_controller`, `viewer`. Plus the coarse `profiles.role` — `admin` / `superuser` always get full access (`useCanAccess()` bypass — a UI block on them would be theatre, RLS already grants them everything).
- **9 permission features**, 35 permission rows, 71 role→permission grants: `customer_management`, `dashboard`, `gl`, `inventory`, `invoicing`, `payroll`, `reports`, `supplier_management`, `user_management`. No feature exists for **purchasing**, **non-Invoice sales documents**, **banking**, **assets**, **tax**, **compliance / related-parties / FX / leases**, **financial_periods**, or the **audit pages** / **settings**.
- Live `user_roles` = **0 assignments**. Live `profiles.role` = `viewer` ×4, `admin` ×1, `superuser` ×1. So the 4 viewer accounts currently reach every ungated page freely; adding + route-gating new features would REMOVE that access with no fine-grained grant to restore it — the exact lockout the decision rule forbids acting on by guesswork.

#### PROPOSED default matrix — approve / edit, then a single additive migration + gating pass implements it

Full grid in **`docs/PERMISSIONS.md` § "PROPOSED (NOT APPLIED) — Block B permission-catalog extension"**. Summary, mapped to the REAL role names:

| New feature | `viewer` | `employee` | `sales_manager` | `stock_controller` | `finance_manager` | `accountant` | `admin`/`superuser` |
|---|---|---|---|---|---|---|---|
| `sales_documents` read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (bypass) |
| `sales_documents` create/update/delete | — | — | ✔ | — | — | ✔ | ✔ |
| `sales_documents` post *(confirm SO / post DN / RN / issue CN)* | — | — | ✔ | ✔ *(DN/RN only)* | — | ✔ | ✔ |
| `sales_documents` export | ✔ | — | ✔ | — | ✔ | ✔ | ✔ |
| `purchasing` read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `purchasing` create/update/delete | — | — | — | ✔ | — | ✔ | ✔ |
| `purchasing` post *(confirm PO / post Bill / record Payment)* | — | — | — | — | — | ✔ | ✔ |
| `purchasing` export / import | export ✔ | — | — | ✔ | export ✔ | ✔ | ✔ |
| `banking` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `banking` create/update/delete + reconcile | — | — | — | — | — | ✔ | ✔ |
| `assets` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `assets` create/update/delete + post *(capitalize / depreciate / dispose)* | — | — | — | — | — | ✔ | ✔ |
| `tax` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `tax` create/update + post | — | — | — | — | — | ✔ | ✔ |
| `compliance` read *(incl. related parties, FX, leases)* | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `compliance` update *(register entries, framework override, run amortization)* | — | — | — | — | — | ✔ | ✔ |
| `financial_periods` read | ✔ | — | — | — | ✔ | ✔ | ✔ |
| `financial_periods` manage *(open / soft-close / close / lock / reopen)* | — | — | — | — | — | ✔ | ✔ |
| `audit` read *(Access Log + business Audit Trail)* | — | — | — | — | ✔ | ✔ | ✔ |

Every grant mirrors the role's EXISTING shape (e.g. `sales_manager` already has full `invoicing` CRUD → gets the same on `sales_documents`; `stock_controller` already owns `inventory` → gets purchasing CRUD + the two physical-stock post actions but not accounting posts; `finance_manager` is read+export everywhere; `viewer` reads everything, matching its current all-`:read` grant; `employee` stays minimal). One open policy question flagged: **should `stock_controller` be able to POST a Delivery Note** (a real "ship the goods" action)? — proposed YES, needs an explicit call.

#### Engineering after approval

1. Inventory all feature/action permissions.
2. Extend permission catalog in one additive migration.
3. Seed safe role grants without locking current users out.
4. Route-level gating.
5. Action-level gating.
6. Service-level enforcement where architecture supports it.
7. Self-lockout protection.
8. Tests by representative role.
9. Verify RLS remains tenant boundary independent of UI permissions.

**DONE when:** every sensitive route/action has an explicit, tested permission policy and existing authorized users retain correct access.

---

### P3 — NORMALIZED DOCUMENT LINES: ✅ ACTIVATED (2026-09-05)

**Status:** `NORMALIZED_DOCUMENT_LINES_ENABLED = true` on branch `hardening-2026-09-05`. Controlled activation procedure executed in full — flag-off-window scan (nothing needing re-backfill), read-only parity sweep (found + corrected 58 seed-written stray `warehouse_id` values via migration `0063`), re-verified 340/340 lines MATCH with zero orphans/dupes/count-mismatches/cross-company, rollback-wrapped live forward-write smoke test of `create_invoice_from_sales_order(p_project_lines := true)` (exact field-for-field parity, 0 persisted), then flipped. Full detail: `docs/PHASE_9B_DESIGN.md` § 4c.  
**What the flag gates:** the WRITE side only (`SupabaseDocumentLineProjector` dual-write + the RPC's `p_project_lines`). NO reader consults the normalized tables yet, so jsonb `line_items` stays authoritative and every report/search/print path is unchanged.  
**Rollback (no data loss):** flip back to `false` — dual-write stops, jsonb untouched, any normalized rows written while `true` are inert. Migration 0063 independently reversible (re-set `warehouse_id` on 58 seed line ids — list in the migration's `raise notice` + `docs/KNOWN_ISSUES.md`). `line_items` NOT dropped this release or next.  
**Deferred:** enriching jsonb `line_items[].warehouseId` from the posted `stock_movements` (which confirm the warehouse) instead of nulling the projection — an explicit data-quality call, not taken here. Normalized-line reader migration (reports/search read `*_lines` instead of jsonb) is separate future work.

_(original state retained below for the record.)_

**Was:** SO→Invoice RPC blocker RESOLVED (migration `0062`), forward parity proven live, flag still off.

#### What was done

- **Writer audit:** every runtime path that creates/updates a normalized-lined document was traced. Standalone Invoice create/edit, Bill (standalone + from-PO), Purchase Order create/update, Credit Note create/update (+ `originalInvoiceLineId`) all already route through their TS service and the flag-gated `SupabaseDocumentLineProjector` — **the ONLY bypass was `create_invoice_from_sales_order`** (partial-SO invoicing + delivery-linked invoicing — both go through the same single RPC call in `RpcSalesOrderDraftInvoiceWriter`). No other RPC inserts into `invoices`/`bills`/`purchase_orders`/`credit_notes` directly.
- **Fix (migration 0062):** the RPC gains an OPT-IN `p_project_lines boolean` param and, when true, does an **atomic** `insert into invoice_lines` from the SAME `v_new_lines` array it writes to the jsonb `line_items` — no second calculation, `id` preserved from the line, 1-based `line_number`, stale FK refs → NULL (the 0042 backfill's own defensive pattern). It runs inside the SAME function transaction as the invoice insert, so there is **no path where the invoice is created but its lines silently are not**. `RpcSalesOrderDraftInvoiceWriter` passes `NORMALIZED_DOCUMENT_LINES_ENABLED` — the RPC dual-write turns on/off with the SAME single flag as the TS projector.
- **Forward-write parity proven LIVE** (rollback-wrapped, zero persistence):
  - `p_project_lines = false` → writes **zero** `invoice_lines` (byte-identical to pre-0062).
  - `p_project_lines = true`, DIRECT selection → `invoice_lines` match `line_items` jsonb **exactly**: count + every field (`line_number`, `description`, `quantity`, `unit_price`, `tax_amount`, `line_total`, `product_id`, `warehouse_id`, `tax_rate_id`) + `id` + `company_id`.
  - `p_project_lines = true`, DELIVERY-LINKED selection → same exact parity.
  - No duplicate ids, no orphans.
- **Tests:** new `src/repositories/salesOrderInvoiceProjectionMigration.test.ts` (11 tests — static-SQL contract + a structural-parity arithmetic proof); `salesOrderDraftInvoiceWriter.test.ts` updated to assert `p_project_lines` is passed.

#### Remaining before the flag flips (a separate, controlled change)

1. Run a fresh full backfill (0042-style) for any invoice/bill/PO/credit-note **created or edited during the flag-off window** (today: none live since the 2026-09-02 seed — but re-check at flip time).
2. Run `DocumentLineParityChecker` against the live DB with the privileged client → expect zero findings.
3. Flip `NORMALIZED_DOCUMENT_LINES_ENABLED = true` in its own commit; deploy; monitor.
4. JSONB `line_items` stays authoritative and is NOT removed in the same release.

**DONE when:** the flag is flipped, parity is zero-findings live, and the app has run for a period reading `invoice_lines` with no divergence.

---

### P4 — FIFO SAFETY ✅ GATED (2026-09-05)

**Status:** DONE for v1 — FIFO can no longer be newly selected.  
**Live check:** 50/50 products are `weighted_average`, **0 on `fifo`** — so the gate changes nothing for any live product, zero accounting impact, no migration needed.

#### What was done

- New `FIFO_VALUATION_ENABLED = false` flag (`src/config/featureFlags.ts`), same one-time-flip shape as the normalized-lines flag.
- `ProductForm` hides the FIFO option unless the flag is on OR the product being edited is already `fifo` (grandfather — none exist); the field description now names Weighted Average Cost as the supported method.
- `ProductService.createProduct` / `updateProduct` **reject** a new switch to `fifo` at the service layer (`"FIFO valuation is not available yet…"`) so the UI gate cannot be bypassed by a direct call. A product already on `fifo` can still be edited in other respects and switched back to WAC.
- 8 new regression tests in `productService.test.ts` (create rejects fifo, update rejects the switch, grandfather + switch-back allowed, flag-ships-off assertion).
- The FIFO lot-walking **engine** (`stockLotService`, `InventoryPostingAdapter` FIFO branches) is UNTOUCHED and still tested — only the selection path is gated.

#### Future optional action

Build:

- `stock_lots` schema
- SupabaseStockLotRepository
- FIFO allocation engine persistence
- migration/backfill strategy
- valuation/reconciliation tests

Do not build FIFO now unless it is an explicit product requirement.

---

## 4. IMPORTANT PRODUCT-COMPLETION WORK AFTER P0–P4

### Accounting Settings — currently link-hub / incomplete

Build a real settings model for:

- Document numbering prefixes/sequences.
- Rounding rule / precision policy.
- Default sales account mapping.
- Default expense account mapping.
- Default bank account mapping.
- VAT basis setting only if the accounting/tax requirements are explicitly approved.

Central document numbering needs service/database uniqueness and concurrency safety. Avoid per-page ad hoc numbering.

### Correction / reversal framework

Audit one-way posted workflows:

- Income Tax computations.
- Deferred Tax.
- ECL.
- Payroll runs.
- Depreciation runs.

Immutable accounting remains correct; correction should be reversal + repost, not mutation.

Create a shared pattern where practical rather than five unrelated mechanisms.

### Payroll completion candidates

- Payslip generation.
- IRP5 generation.
- Net Pay Payable settlement / mark-paid workflow.
- Configurable SARS tax-year settings.
- Retirement-fund PAYE deduction cap/rules.

These are important if Vertex is marketed as full payroll, but do not block the current core accounting release unless scope requires them.

### Financial statement completion candidates

- Statement of Changes in Equity.
- Notes to Financial Statements.
- Professional export/PDF for classified statements.

---

## 5. KNOWN GAPS — NON-BLOCKING / POST-V1 CANDIDATES

### Purchasing

- Partial PO goods receipt not yet modeled; current receipt is all-or-nothing.
- PO→Bill purchase-price variance flow not separately modeled because current Bill-from-PO path copies PO lines.

### Inventory

- Inventory Reconciliation Section F movement-source evidence completeness is still not fully resolved (honest `Not run` state on the report, not a fabricated pass).
- Real FIFO persistence deferred; **the UI + service are now gated** (`FIFO_VALUATION_ENABLED = false`) so FIFO cannot be newly selected — `MockStockLotRepository` stays wired but is unreachable via the product forms.

### GL

- Journal Entry source is plain text; no universal reverse FK from JE back to originating document.

### Tax

- Income Tax / Deferred Tax / ECL lack correction/reversal path.
- SBC eligibility and dividend allocation remain manual because there is no shareholder register.

### Payroll

- No IRP5/payslip generation.
- No payroll settlement step.
- No in-app next-year SARS configuration.

### Reports

- No Notes to Financial Statements.
- No Statement of Changes in Equity.
- Classified financial-statement PDF/export polish remains.

### Foreign Exchange

FX infrastructure exists, but transactional entities do not yet support a transaction currency distinct from ZAR.

### Related Parties

Manual register only; no automatic relationship detection or enforced Invoice/Bill links.

### Compliance

Current-year view only; historical compliance trend is deferred.

### Deferred by design

- Multi-company-per-login / tenant switching in Vertex.
- Role-based approval workflows.
- Suspense account workflow.
- Full document/attachment management platform.
- Central Reconciliation Centre across Banking + AR/AP + Compliance.
- In-app notifications backend.

These are roadmap items, not blockers for current accounting correctness.

---

## 6. DATABASE / ACCOUNTING SAFETY RULES

For all remaining work:

- Inspect first.
- Read-only live verification before migrations.
- No casual production service-layer writes.
- No test/demo records in live DB unless explicitly approved and rollback-proven.
- No posted-accounting mutation.
- Reversal instead of mutation for posted accounting corrections.
- No historical cost fabrication.
- No force push.
- Keep company isolation and RLS intact.
- Re-run Trial Balance and affected GL reconciliations after accounting changes.

Standard gate:

```bash
npm run type-check
npm run lint -- --max-warnings 0
npm run test
npm run build
```

---

## 7. FINITE ROADMAP TO FINISH CURRENT VERTEX RELEASE

### BLOCK A — Production correctness + browser QA

- ✅ Apply/verify migration 0061.
- ✅ Gate unsupported FIFO.
- ⏳ Human browser QA of recent production features — STILL REQUIRED (checklist in §P1; no browser tooling in this environment).
- ⏳ Batch-fix visual/UX defects — after browser QA.

**Definition of DONE:** no known production correctness bug ✅; unsupported valuation method cannot be selected ✅; current live features visually verified ⏳.

### BLOCK B — Permissions + normalized-line activation ✅ CORE DONE (2026-09-05)

- ✅ Permission matrix APPROVED (FINAL CORE HARDENING brief) + APPLIED (migration 0064).
- ✅ App-wide permission catalog + route enforcement + representative action enforcement + Financial-Periods self-lockout guard + no-lockout transition (zero `user_roles` writes).
- ✅ Fix `create_invoice_from_sales_order` normalized projection (migration 0062).
- ✅ Forward-write parity testing (live, rollback-wrapped — direct + delivery-linked, exact).
- ✅ Controlled normalized-line flag activation — migration 0063 parity correction, 340/340 clean, forward smoke test, flag flipped.
- ⏳ POST-V1: exhaustive per-button action gating on banking/assets/tax/compliance + detail pages.

**Definition of DONE:** explicit permissions across sensitive modules ✅ and normalized relational document lines active as a dual-write with a documented rollback ✅.

### BLOCK C — Accounting product hardening

- Real Accounting Settings.
- Central numbering/rounding/account mappings.
- Shared reversal/correction pattern for one-way accounting workflows.
- Prioritized payroll/reporting completion items.

**Definition of DONE:** remaining core operational policies are configurable and posted calculations can be corrected through auditable reversal.

### BLOCK D — Final release QA

- Full role-based QA.
- Full accounting invariant sweep.
- Mobile/responsive/print QA.
- Security-advisor review.
- Documentation cleanup.
- Production release confirmation.

**Definition of DONE:** no unresolved core blocker, green gate, balanced accounting, human QA completed, docs current.

---

## 8. NEXT

P0 (0061), P2 (permission catalog → 0064), P3 (normalized lines → 0062/0063 + flag flip) and P4 (FIFO gate) are all **DONE**. What remains before merge:

1. **Human browser QA** of the branch (§P1 checklist) — now including a role-based click-through of the new permission gates (viewer / stock_controller / sales_manager / finance_manager / accountant / admin), and confirming existing documents still render/print/search identically after the normalized-line flag flip. Then batch-fix any visual defects.
2. **Merge `hardening-2026-09-05` → `main`** once (1) passes. (Do NOT merge before human QA. Do NOT force-push. Do NOT manually deploy.)

Then Block C (real Accounting Settings, shared reversal/correction pattern) as one block, and the POST-V1 items listed in "STATUS THIS RUN". Do not add unrelated new features until the above are resolved.
