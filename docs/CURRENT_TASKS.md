# Vertex Accounting — CURRENT TASKS

**Authoritative project status**  
**Date:** 2026-09-05 (Block A + Block B run)  
**Branch:** work on `hardening-2026-09-05` (off `main` `f7ec377`); `main` untouched pending review  
**Gate:** 2701 tests / 331 files PASS · TypeScript PASS · ESLint PASS · Build PASS  
**Live accounting:** Trial Balance difference `R0.00` — byte-identical to pre-run baseline (0061/0062 are pure DDL)  
**Latest applied migration:** `0062_sales_order_invoice_rpc_projects_lines` (0061 + 0062 both APPLIED + LIVE-VERIFIED this run)  
**Normalized document line flag:** `NORMALIZED_DOCUMENT_LINES_ENABLED = false` (NOT flipped — see P3)  
**FIFO flag:** `FIFO_VALUATION_ENABLED = false` (new — FIFO gated out of new/edit product flows)

---

## 1. WHERE WE STAND

Vertex Accounting is now in **completion / production-hardening**, not core-engine construction.

The full system audit covered **128 routes across 17 feature domains**. The major accounting engines are real and operational: Sales/Fulfilment, Purchasing, Inventory, Banking/Reconciliation, General Ledger, Fixed Assets, Payroll, Tax, Reporting/Forecasting, Compliance, Related Parties, FX infrastructure, Leases, Administration, and Settings.

Current maturity is approximately **90%+ of the intended core product**. Remaining work is concentrated in production correctness, permissions, normalized-line activation, a small amount of accounting/settings hardening, browser QA, and optional post-v1 enhancements.

**Block A + B progress (2026-09-05):** migration `0061` APPLIED + live-verified (3 worked scenarios, rollback-wrapped) — the UI and the DB RPCs now use the SAME return-aware fulfilment formula; FIFO GATED out of new/edit product flows at both the UI and the service layer; the normalized-lines SO→invoice RPC blocker RESOLVED via migration `0062` (opt-in atomic `invoice_lines` projection, gated by the same flag), with forward-write parity proven live (direct + delivery-linked, exact field-for-field). Permissions: STOPPED for product approval — proposed matrix below (§P2). Browser QA: still REQUIRED (no browser tooling in this environment). `main` unchanged; all code on `hardening-2026-09-05` pending review, all migrations live.

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

Record all visual defects into one consolidated batch. Do not create one phase per visual issue.

---

### P2 — APPLICATION-WIDE PERMISSIONS ROLLOUT

**Status:** STOPPED FOR PRODUCT APPROVAL (this run). Nothing applied — no migration, no `role_permissions` row, no `usePermission()` call site added.  
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

### P3 — NORMALIZED DOCUMENT LINES: BLOCKER FIXED · **READY FOR CONTROLLED ACTIVATION** (flag still off)

**Status:** the SO→Invoice RPC blocker is RESOLVED (migration `0062`, APPLIED). Forward parity proven live.  
**Flag:** `NORMALIZED_DOCUMENT_LINES_ENABLED = false` — **NOT flipped this run** (no dedicated approved activation instruction; the flip is its own controlled change — see below).

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

### BLOCK B — Permissions + normalized-line activation

- ⏳ Approve permission matrix — PROPOSED, awaiting product sign-off (§P2 / `docs/PERMISSIONS.md`).
- ⏳ Complete app-wide permission catalog and enforcement — blocked on the approval above.
- ✅ Fix `create_invoice_from_sales_order` normalized projection (migration 0062).
- ✅ Forward-write parity testing (live, rollback-wrapped — direct + delivery-linked, exact).
- ⏳ Controlled normalized-line flag activation — READY; a separate dedicated change (backfill → parity-check → flip → monitor).

**Definition of DONE:** explicit permissions across sensitive modules ⏳ and normalized relational document lines are safe as runtime source ✅ (ready to activate).

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

P0 (migration 0061), P3 (normalized-lines RPC blocker → migration 0062) and P4 (FIFO gate) are **DONE**. What remains:

1. **Human browser QA** of the branch against production behaviour (§P1 checklist) — then batch-fix any visual defects. This is the only Block A item left.
2. **Approve the permissions matrix** (§P2 / `docs/PERMISSIONS.md`). On approval: one additive `permissions` migration + `<PermissionRoute>` / `useCanAccess()` gating + role-grant seed + tests.
3. **Flip `NORMALIZED_DOCUMENT_LINES_ENABLED`** as its own controlled change (backfill any flag-off-window documents → run `DocumentLineParityChecker` live → flip → monitor).
4. Merge `hardening-2026-09-05` → `main` once (1) is done.

Then Block C (Accounting Settings, shared reversal/correction pattern) as one block. Do not add unrelated new features until the above are resolved.
