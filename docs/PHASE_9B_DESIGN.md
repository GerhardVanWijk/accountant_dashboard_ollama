# Phase 9B — Relationship Implementation Design + Code

Status: design authored, migrations authored (**NOT applied**), the two standalone
integrity fixes (product delete guard, credit-note original-line evidence) are
shipped and tested, the normalized-line dual-write projector is shipped and
tested **disabled by default** (`NORMALIZED_DOCUMENT_LINES_ENABLED = false`).
No commits. No pushes. No Office National writes — every Supabase call made
during this design pass was a read-only `SELECT`.

This document is the Review 9B-A deliverable. It complements
`docs/ACCOUNTING_RELATIONSHIPS.md` (Phase 9A) rather than repeating it.

---

## 1. Final normalized schema

Four new tables, one per document type, all following the exact
header-stays-jsonb / lines-get-normalized pattern already proven by
`supplier_return_lines` / `opening_stock_batch_lines` (migration 0029):

- `invoice_lines` (migration `0038`)
- `bill_lines` (migration `0039`) — adds `fixed_asset_details jsonb`
- `purchase_order_lines` (migration `0040`)
- `credit_note_lines` (migration `0041`) — adds `original_invoice_line_id uuid`
  (composite FK to `invoice_lines`)

Common shape (see each migration file for the exact DDL — not duplicated here):

```
id uuid primary key                    -- = DocumentLineItem.id, preserved exactly
company_id uuid not null
<document>_id uuid not null            -- invoice_id / bill_id / purchase_order_id / credit_note_id
line_number integer not null           -- 1-based position in the jsonb array
product_id uuid                        -- nullable
warehouse_id uuid                      -- nullable
description text not null
quantity numeric(14,3) not null        -- check (quantity > 0)
unit_price numeric(14,4) not null
tax_rate_id uuid                       -- nullable
tax_amount numeric(14,2) not null default 0
line_total numeric(14,2) not null
created_at / updated_at timestamptz
```

Constraints: `unique (<document>_id, line_number)`, `unique (company_id, id)`
(candidate key for the credit-note FK below), composite
`(company_id, <document>_id) → (company_id, id)` FK with `on delete cascade`
back to the header, composite `(company_id, product_id/warehouse_id/tax_rate_id)`
FKs to `products`/`warehouses`/`tax_rates` — all following the tenant-safe
composite-FK convention migration 0029 established. RLS: the same
`all_own_company` policy shape every other document table already uses.

Migration `0037` adds the two prerequisite `unique (company_id, id)` keys this
needed and that were **verified missing** on the live project during this
design pass (`bills`, `purchase_orders`, `products`, `warehouses`,
`suppliers`, `tax_rates` already had theirs from migration 0029; `invoices`
and `credit_notes` did not).

## 2. JSONB → normalized field mapping

| `DocumentLineItem` field | Normalized column | Type | Nullability | FK | Backfill rule |
|---|---|---|---|---|---|
| `id` | `id` | uuid | not null (PK) | — | EXACT — copied verbatim, never regenerated |
| — | `company_id` | uuid | not null | → companies | from the parent document's `company_id` |
| — | `<document>_id` | uuid | not null | composite → header | from the parent document's `id` |
| — | `line_number` | integer | not null | — | jsonb array position (`with ordinality`), 1-based |
| `productId` | `product_id` | uuid | **nullable** | composite → products | EXACT if it resolves to a same-company product, else NULL (never guessed) |
| `warehouseId` | `warehouse_id` | uuid | nullable | composite → warehouses | same rule as `productId` |
| `description` | `description` | text | not null | — | EXACT, empty string if absent |
| `quantity` | `quantity` | numeric(14,3) | not null, `> 0` | — | EXACT; a legacy line with qty ≤ 0 is skipped, not coerced (verified zero such rows live) |
| `unitPrice` | `unit_price` | numeric(14,4) | not null | — | EXACT |
| `taxRateId` | `tax_rate_id` | uuid | nullable | composite → tax_rates | same rule as `productId` |
| `taxAmount` | `tax_amount` | numeric(14,2) | not null | — | EXACT |
| `lineTotal` | `line_total` | numeric(14,2) | not null | — | EXACT |
| `fixedAssetDetails` (bill only) | `fixed_asset_details` | jsonb | nullable | — | EXACT passthrough, no further normalization (small nested object, same treatment as other jsonb-nested fields elsewhere) |
| `originalInvoiceLineId` (credit note only — **new field**, `src/types/creditNote.ts`) | `original_invoice_line_id` | uuid | nullable | composite → invoice_lines | EXACT only if it resolves to an `invoice_lines` row that already exists (i.e. the referenced invoice was itself backfilled/created after 0038) — otherwise NULL |
| **`discount`** | — | — | — | **NOT MAPPED** — no such field exists anywhere in `DocumentLineItem` or the live jsonb today (verified). Listed in the Phase 9B brief's field checklist but nothing to carry forward; would be a genuinely new feature, out of this migration's additive-only scope. |

## 3. Authority / transition strategy

| | AUTHORITATIVE NOW | TRANSITIONAL | AUTHORITATIVE TARGET |
|---|---|---|---|
| `invoices.line_items` (jsonb) | ✅ every reader (postInvoice, aging, dashboards, reports) | stays exactly as-is | becomes read-only projection once every reader has migrated (separate, later, reviewed phase — **not scheduled**) |
| `invoice_lines` / `bill_lines` / `purchase_order_lines` / `credit_note_lines` | not yet queried by anything | dual-write only, `NORMALIZED_DOCUMENT_LINES_ENABLED` gated | becomes the queryable source for per-product/category reporting once populated + verified |
| `CreditNoteLineItem.originalInvoiceLineId` (the DTO field) | ✅ **already authoritative today** — `issueCreditNote()` validates against it now | — | stays authoritative; `credit_note_lines.original_invoice_line_id` is its durable projection |

No permanent dual-source ambiguity: the moment the normalized tables are
promoted to authoritative for a given reader, that reader stops reading
`line_items` — never both, per-field, forever. Until then, `line_items` wins
every conflict because nothing reads the normalized tables yet.

## 4. Rollout (the actual sequencing this design depends on)

1. This PR (code + authored-not-applied migrations) merges. Behavior is
   **unchanged** — `NORMALIZED_DOCUMENT_LINES_ENABLED = false` makes every
   new class introduced here inert; `deleteProduct()`'s guard and
   `issueCreditNote()`'s line-specific validation are the only behavior
   changes, and both are pure wins (a hard-delete-with-no-check bug and an
   over-credit bug, respectively — see §8/§9).
2. Separate, reviewed step: apply migrations `0037`→`0042` to the target
   database (in order; `0042`'s backfill depends on `0038`/`0041` existing).
   **DONE — applied 2026-09-01.**
3. Separate, reviewed one-line commit: flip
   `NORMALIZED_DOCUMENT_LINES_ENABLED` to `true` in
   `src/config/featureFlags.ts`. **DONE — activated 2026-09-05 on branch
   `hardening-2026-09-05` (FINAL CORE HARDENING run). See §4c.**
4. Only after step 3 do new/edited documents start populating the normalized
   tables going forward. Report-layer work to actually query them is
   explicitly **NOT part of Phase 9B** (see §15's "Do not change Phase-8
   reports yet").

### 4a. The SO→invoice RPC bypass — CLOSED 2026-09-05 (Block B, migration 0062)

`create_invoice_from_sales_order` (the atomic RPC behind partial-Sales-Order invoicing AND
delivery-linked invoicing) inserts the invoice row in raw SQL — it never runs through
`InvoiceService.createInvoice()`, so it permanently bypassed `SupabaseDocumentLineProjector`,
flag on or off. It was the ONLY such bypass (a full writer audit confirmed every other
create/update path for invoice/bill/PO/credit-note routes through its TS service + the
flag-gated projector). Migration **`0062`** adds an opt-in `p_project_lines boolean` parameter:
when true, the RPC does an **atomic** `insert into invoice_lines` from the SAME `v_new_lines`
array it writes to `line_items` jsonb — no recalculation, `id` preserved, 1-based `line_number`,
stale FK → NULL (the `0042` backfill's own defensive pattern), inside the same function
transaction (so there is no "invoice created but lines silently missing" path).
`RpcSalesOrderDraftInvoiceWriter` passes `NORMALIZED_DOCUMENT_LINES_ENABLED` — the RPC
dual-write turns on/off with the SAME single flag as the TS projector, keeping step 3 the one
switch. Forward-write parity proven LIVE (rollback-wrapped) for both direct and delivery-linked
invoices: `invoice_lines` match `line_items` exactly, field-for-field, no dupes, no orphans.
Contract + parity tests: `src/repositories/salesOrderInvoiceProjectionMigration.test.ts`.

### 4b. Before the step-3 flip (a fresh checklist as of 2026-09-05)

- Backfill any invoice/bill/PO/credit-note **created or edited during the flag-off window** with
  a fresh 0042-style pass (today: nothing live since the 2026-09-02 seed — re-check at flip time).
- Run `DocumentLineParityChecker` against the live DB (privileged client) → expect zero findings.
- Flip the flag in its own commit; deploy; monitor a period reading `invoice_lines`.
- JSONB `line_items` stays authoritative and is NOT removed in the same release.

### 4c. The step-3 activation — DONE 2026-09-05 (FINAL CORE HARDENING run)

Branch `hardening-2026-09-05`. Executed exactly as §4b, all read-only-first:

1. **Flag-off-window scan** — the newest live `created_at` across
   `invoices`/`bills`/`purchase_orders`/`credit_notes` is still `2026-09-02 20:59:58`
   (the seed). 3 invoices (`INV-1068/1072/1074`) carry a later `updated_at`
   (`2026-09-04 11:54:05`) from the 5B.1 `salesOrderLineId` jsonb backfill — a field the
   normalized tables do not project, so line count and every projected field were already in
   parity. **No 0042-style re-backfill was needed.**
2. **Parity sweep** — a read-only SQL replica of `DocumentLineParityChecker`'s field-by-field
   comparison (`get_my_company_id()` makes the TS checker's anon client unusable from an
   MCP/service context) across all 4 line tables: 340 lines. One class of divergence —
   **58 rows with a non-NULL `warehouse_id` the authoritative jsonb line lacks** (invoice 40 /
   bill 10 / PO 7 / CN 1), all pointing at "Main Distribution Centre", all written by the
   2026-09-02 seed's direct (non-projector) normalized-row insert. 0 orphans / 0 duplicates /
   0 line-count mismatches / 0 cross-company.
3. **Migration `0063_normalized_line_warehouse_parity_correction`** — NULLs exactly those 58
   `warehouse_id` values so the projection equals a fresh re-projection of the authoritative
   jsonb (`SupabaseDocumentLineProjector` writes `line.warehouseId ?? null`, reading only the
   jsonb line). jsonb untouched; nothing reads the normalized tables at apply time; zero
   accounting impact. **Rollback:** re-set `warehouse_id =
   '692a3d01-9835-4340-b5ab-44fe96067490'` on the 58 line ids (all seed ids matching
   `5eed0000-0000-4000-8000-(31|71|61|41)%`). The full id list is in migration 0063's own
   `raise notice` and in `docs/KNOWN_ISSUES.md`. (All 40 divergent invoice lines DO have a
   posted `stock_movements` row confirming that warehouse — enriching the jsonb from those
   movements instead of nulling the projection is a deferred, explicit data-quality call.)
4. **Re-ran the parity sweep → 340/340 MATCH, zero findings.**
5. **Forward-write smoke test** (rollback-wrapped, `set local role authenticated` + jwt claims
   for the admin, `begin … rollback`): `create_invoice_from_sales_order(SO-2026-test1,
   [{salesOrderLineId, quantity:1}], …, p_project_lines := true)` → the projected `invoice_lines`
   row matched the authoritative jsonb `line_items` line field-for-field (id, description,
   quantity, unit_price, tax_amount, line_total, product_id, warehouse_id, tax_rate_id,
   company_id, line_number), 0 orphans; the transaction rolled back with 0 persisted rows
   (`invoices` still 83, `invoice_lines` still 240). The TS-projector paths (standalone
   Invoice / Bill / PO / Credit Note create+update) are covered by
   `SupabaseDocumentLineProjector.test.ts` with the flag mocked `true` and by the now-clean
   live parity; a running-app browser exercise of each is folded into human QA.
6. **Flipped `NORMALIZED_DOCUMENT_LINES_ENABLED = true`.** Updated the 3 tests that asserted
   the old `false` value. Full gate green (2739 tests / 332 files, tsc / eslint / build).

**Rollback of the activation itself:** flip `NORMALIZED_DOCUMENT_LINES_ENABLED` back to
`false` — the dual-write stops, the authoritative jsonb `line_items` was never touched, and any
normalized rows written while `true` are inert (no reader). No data loss. Migration 0063 is
independently reversible per step 3 above. `line_items` is NOT dropped in this or the next
release.

## 5. Forward invoice evidence (already true before this phase, reconfirmed)

`InvoiceService.postInvoice()` (`src/services/invoiceService.ts`) already
builds, per tracked-inventory line: `sourceDocumentLineId: line.id` on the
`InventoryTransactionLine` handed to `post_inventory_transaction()`, which
writes `stock_movements.source_document_line_id = line.id`,
`.unit_cost`/`.total_cost` = the WAC blended in that same RPC call. This
phase adds nothing new to that chain — it was already correct
(docs/ACCOUNTING_RELATIONSHIPS.md §0/§2). What Phase 9B adds is a normalized
`invoice_lines.id` row that shares that same `id`, so once §4's rollout
completes, a query can join `stock_movements.source_document_line_id` →
`invoice_lines.id` → `invoice_lines.product_id` directly instead of
re-parsing jsonb.

## 6. Forward purchase evidence (already true, reconfirmed)

Same story for `purchaseOrderService.recordReceipt()` /
`billService.postBill()` — already correct (docs/ACCOUNTING_RELATIONSHIPS.md
§0/§3). One thing explicitly **NOT authored** here: a
`bill_lines.source_purchase_order_line_id` column linking a bill line back to
the PO line it derived from. No current code populates that relationship at
the line level (only at the document level — `bills.purchase_order_id`), and
authoring a FK for a relationship nothing writes would itself be the
"manufactured relationship" the brief prohibits. Flagged as a candidate for
a follow-up phase, once/if `billService` starts copying line-level PO
provenance forward.

## 7. Stock movement source-line evidence

Unchanged by this phase — already consistent across every current workflow
(docs/ACCOUNTING_RELATIONSHIPS.md §5). The `credit_note_lines` table adds
`original_invoice_line_id`, which is a NEW relationship
(credit-note-line → invoice-line) distinct from the EXISTING
`stock_movements.source_document_line_id` (movement → credit-note's own
line, unchanged) — see the test
`'records the credit note line id (not the original invoice line id) as the
stock movement source evidence'` in `creditNoteService.test.ts`, which pins
down that these two relationships are NOT the same thing and must not be
confused.

## 8. Journal relationship — decision

**Decision: no schema change to `journal_entries` or `journal_lines`.**
Per the brief's steer (§10) and the Phase 9A finding that
`inventory_transaction_log(source_type, source_id) → journal_entry_id`
already gives inventory postings a structured reverse-lookup, and every
document already carries its own `journal_entry_id` forward-FK — a
"journal → source" reverse lookup for non-inventory postings (payments,
customer receipts, bank transactions) has no current caller that needs it.
Adding `journal_entries.source_id` now, with nothing reading it, would be
exactly the kind of speculative column the brief warns against. Revisit only
if a real investigation/reporting need for that reverse lookup appears.

## 9. Product-delete fix

`src/features/inventory/services/productService.ts` — `deleteProduct()` now
calls `hasAccountingHistory()` (checks `stock_movements`, `invoices`,
`bills`, `purchase_orders`, `credit_notes`, `supplier_returns`,
`opening_stock_batches` — every place a `productId` can appear) and
deactivates (`status: 'inactive'`) instead of hard-deleting when true. Zero
history → hard delete, same as before. 5 new tests in
`productService.test.ts`. This was a real, live gap (previously a bare
`DELETE FROM products`, no check at all — see
docs/ACCOUNTING_RELATIONSHIPS.md §12) and ships in this PR independent of
the migrations.

## 10. Credit-note original-line fix

`src/types/creditNote.ts` adds `CreditNoteLineItem.originalInvoiceLineId?: ID`.
`creditNoteService.issueCreditNote()`'s return-quantity guard now validates
per-line when that field is set (netted against every other already-posted
credit note's returns against that SAME line, not just the current note's
own lines — closing a second latent bug: the old guard only ever compared
against its own lines, so two separate credit notes could together
over-return a product with neither one alone tripping it), and falls back to
the old whole-invoice/whole-product aggregate when it isn't (financial-only
credits, or older data). 6 new tests in `creditNoteService.test.ts` covering
exactly the brief's list: same product on multiple invoice lines, partial
credit, second credit against the same line, over-credit rejection,
financial-only credit (no line evidence required), and stock-movement source
evidence. This ships in this PR independent of the migrations too — it only
touches the in-memory DTO, not any new table.

## 11. Realised-margin evidence boundary

Unchanged from docs/ACCOUNTING_RELATIONSHIPS.md §14's contract, restated
precisely per this phase's brief:

> **Historical realised margin: NOT AVAILABLE** for any sale whose
> `stock_movements` row predates migration 0022 (no `unit_cost`,
> `source_document_type`, or `source_document_line_id` recorded at the time)
> — verified 100% true for Office National's current 284 movements
> (docs/ACCOUNTING_RELATIONSHIPS.md §10). **Forward transactions — every sale
> posted through `post_inventory_transaction()` from migration 0031 onward —
> already carry everything realised margin needs**: `unit_cost`/`total_cost`
> per movement, `source_document_line_id` back to the exact invoice line.
> Never computed from current WAC.

The evidence boundary is a **date** (when the posting engine went live for a
given company/environment), not a schema gap — Phase 9B's normalized tables
make querying it easier but do not change which transactions have the
evidence.

## 12. Supplier evidence contract

Unchanged from docs/ACCOUNTING_RELATIONSHIPS.md §15 — Phase 9B adds no new
supplier relationship. "Supplier profitability" remains an undefined,
unused term.

## 13. Report unlock criteria

Not implemented in this phase (§20 of the brief: "Do not change Phase-8
reports yet"). Criteria, for the next phase to check against:

| Report | Minimum required evidence | Forward-data availability | Historical coverage | Incomplete-evidence behavior |
|---|---|---|---|---|
| Sales by Product | `invoice_lines.product_id` (or jsonb `productId`) | ✅ today, no schema needed | ✅ today (98.5% of Office National invoice lines already have `productId`) | exclude the line from the product breakdown; report its count separately, never impute a product |
| Sales by Category | above + `products.category_id` (already FK'd) | ✅ today | ✅ today | same |
| COGS by Product / Realised Product Margin | `stock_movements.source_document_line_id` + `.unit_cost` for that invoice line | ✅ for every sale posted via `post_inventory_transaction()` (migration 0031+) | ❌ NOT AVAILABLE pre-migration-0022 movements (§11) | report "evidence incomplete" for that product/period, never blend with current WAC |
| COGS by Category / Realised Category Margin | same, grouped via `product.category_id` | same | same | same |
| Purchases by Product / by Supplier | `bill_lines.product_id`/`purchase_order_lines.product_id` (or jsonb) + `bills.supplier_id` (already FK'd) | ✅ today | ✅ today (83.8% of Office National bill lines already have `productId`) | exclude + count separately |
| Purchase Price History | `stock_movements.unit_cost` ordered by `movement_date`, per product | ✅ for post-migration-0031 receipts | ❌ NOT AVAILABLE pre-0022 | same |
| PPV by Supplier | needs independent verification that the engine's PPV account isolation is correct — not verified in this pass | unknown | unknown | do not report until verified |

## 14. Test matrix — what was added, what already existed

| Area | Status |
|---|---|
| Product-delete guard (unused-delete-allowed / stock-movement-blocked / document-line-blocked / deactivate-path) | **NEW — 5 tests, `productService.test.ts`, all passing** |
| Credit-note original-line (multi-line same product / partial credit / second-credit-same-line / over-credit / financial-only / stock-movement source evidence) | **NEW — 6 tests, `creditNoteService.test.ts`, all passing** |
| `SupabaseDocumentLineProjector` (disabled no-op / enabled delete+insert+column-mapping / empty-set) | **NEW — 3 tests, `SupabaseDocumentLineProjector.test.ts`, all passing** |
| Per-service projection wiring (invoice/bill/PO/credit-note: create projects, update-with-lineItems re-projects, update-without-lineItems doesn't, projector failure doesn't fail the document write) | **NEW — 7 tests across `invoiceService.test.ts`/`billService.test.ts`/`purchaseOrderService.test.ts`/`creditNoteService.test.ts`, all passing** |
| Sales chain (invoice line → product → stock movement → historical COGS → journal), purchase chain (bill/PO line → product → receipt → WAC → journal), tenancy, immutability | **PRE-EXISTING — reverified still green, not re-authored** (`inventoryPostingEngine.test.ts`, `inventoryAccountingMatrix.test.ts`, and the rest of the 1844-test suite) |
| Normalized-table FK integrity / RLS / cross-tenant rejection at the DB level | **NOT TESTABLE yet — tables don't exist until migrations are applied; this is exactly why §4 sequences migration-apply as a separate step before any DB-level test can run against them** |
| Historical backfill (`0042`) correctness | **Verified via read-only queries against live data during design (§9A/§10 counts), not via an automated test — there is no automated-test harness for a one-time data migration in this codebase's existing convention (0021-0036 didn't get one either)** |

## 15. Rollback

Every migration here is additive (new tables, new columns via `alter table
... add column`, new constraints on new/otherwise-untouched columns). None
drops or alters an existing column. Rollback = `drop table` the four new
tables (`credit_note_lines` first, for its FK to `invoice_lines`) and drop
the two `0037` unique constraints — the existing `invoices`/`bills`/etc.
rows and their `line_items` jsonb are completely unaffected either way, since
nothing ever became authoritative on the new tables (§3).

## 16. Review 9B-B QA fixes (for Review 9B-C)

Review 9B-B returned **NEEDS WORK** on three items. All three are addressed
on this branch; no new commit yet (Review 9B-C gate).

1. **Migration-contract coverage for 0037-0042** — new
   `src/repositories/normalizedLineMigrations.test.ts` (39 cases), same
   static-SQL approach as `inventoryMigrations.test.ts`. Proves: 0037-0042
   sort ascending after 0036; 0037 precedes every line table + the backfill;
   0038 precedes 0041 (FK target); all four line tables exist with the jsonb
   `id` as their own PK (no synthetic key), `product_id` nullable, the
   composite tenant-safe FKs (`(company_id, <fk>)` → header / products /
   warehouses / tax_rates), their own `unique (company_id, id)`, RLS enabled
   + the coarse `all_own_company` policy; `bill_lines.fixed_asset_details`
   (+ its mutual-exclusion CHECK); `credit_note_lines.original_invoice_line_id`
   (nullable, composite FK to `invoice_lines`); no migration 0037-0042 drops
   a table/column, retypes a column, truncates, or touches `line_items`;
   0042 preserves each jsonb line `id` verbatim (`(l->>'id')::uuid`, no
   `gen_random_uuid`), is idempotent (`on conflict (id) do nothing` ×4),
   preserves order (`with ordinality`), resolves every ref exactly-or-NULL,
   populates **and** raises a NOTICE for all four orphan counters, fabricates
   no historical WAC/cost/stock-movement data, never `UPDATE`/`DELETE`s a
   header table; the feature flag ships `false`.

2. **0042 orphan observability** — `v_orphaned_warehouses` and
   `v_orphaned_tax_rates` were declared but never populated or reported.
   Fixed: a single pre-backfill CTE (`all_lines` — exactly the `quantity > 0`
   lines the INSERTs consider) now `LEFT JOIN`s products / warehouses /
   tax_rates and assigns all three counters, raised together in a
   `normalized_line_backfill (pre): …` NOTICE. A post-backfill block then
   counts credit-note lines whose `originalInvoiceLineId` did not resolve to
   a just-created `invoice_lines` row (`v_orphaned_original_invoice_lines`)
   and raises a `normalized_line_backfill (post): …` NOTICE. Each non-zero
   counter also gets its own loud per-kind restatement. The exact-only
   policy is unchanged — an unresolved reference is still written `NULL`,
   never guessed; `jsonb_array_elements` is now `coalesce(…, '[]'::jsonb)`-
   guarded so a NULL `line_items` cannot abort the run.

3. **Dual-write parity checker** — new
   `src/repositories/DocumentLineParityChecker.ts` (+ 12-case test, +
   `documentLineParityCheckerInstance.ts`). Deterministic, **read-only**
   (only `select`; never insert/update/delete/rpc; never a service
   singleton; never mutates or repairs either side). Per document type it
   reports `documentCount` / `jsonbLineCount` / `normalizedLineCount` /
   `matchedLineCount`, the exact line-ID set diff, and per matched line
   compares `line_number`, `description`, `quantity`, `unit_price`,
   `tax_amount`, `line_total` (each rounded to its column scale),
   `product_id` / `warehouse_id` / `tax_rate_id`, plus
   `fixed_asset_details` (bill, structural) and `original_invoice_line_id`
   (credit note). Classification is exactly `MATCH` /
   `MISSING_NORMALIZED_LINE` / `EXTRA_NORMALIZED_LINE` / `FIELD_MISMATCH`;
   every finding carries both raw line objects + a per-field breakdown. A
   `quantity <= 0` jsonb line is excluded (matching 0042), surfaced in
   `excludedZeroQtyJsonbLineIds`. A set-in-jsonb / NULL-in-projection ref
   mismatch is tagged `possiblyExpectedBackfillNull` so a reviewer can tell
   an expected exact-only historical nulling from a projector defect. It
   cannot run against the DB until 0037-0042 are applied — it is the gate
   the future "enable the projection" review must pass first.

### Pre-apply read-only inspection (Office National, project `bcaffvpibpitpuqglszn`)

Every query below was a `SELECT` — no writes, no RPC, no service calls.
Migrations applied on the project stop at **0036** (0037-0042 not applied).
Only "Office National Demo (Pty) Ltd" holds data; the two "test" companies
are empty.

| Integrity check | Result |
|---|---|
| jsonb line elements total (invoice/bill/PO/credit-note) | 272 |
| line elements missing an `id` | **0** |
| duplicate line `id` within one document | **0** |
| line `id` colliding across documents/tables | **0** |
| orphaned `productId` refs | **0** (258/272 lines carry one) |
| orphaned `warehouseId` refs | **0** (0/272 carry one — all default-warehouse) |
| orphaned `taxRateId` refs | **0** (272/272 carry one) |
| orphaned `originalInvoiceLineId` refs | **0** (0/6 credit-note lines carry one → all backfill NULL) |
| lines with `quantity <= 0` | **0** |

| Expected normalized row count | Value |
|---|---|
| `invoice_lines` | **198** |
| `bill_lines` | **68** |
| `purchase_order_lines` | **0** |
| `credit_note_lines` | **6** |
| `bill_lines.fixed_asset_details` non-null | **0** |

| Accounting baseline | Value |
|---|---|
| `journal_entries` | 171 (all `posted`) |
| `journal_lines` | 705 |
| `stock_movements` | 284 |
| `inventory_transaction_log` | 0 |
| global debit total | 4 838 209.61 |
| global credit total | 4 838 209.61 |
| trial balance (debit − credit) | **0.00 — balanced** |
| GL 1200 (Inventory) | 1 569 743.20 |
| GL 1210 (Inventory in Transit) | 0.00 |
| inventory valuation (Σ stock_balances.qty × product WAC) | 1 569 743.20 |
| inventory valuation (Σ products.qty_on_hand × WAC) | 1 569 743.20 |
| `reconcileInventory` (GL 1200 vs valuation) | **balanced — difference 0.00** |

No STOP condition. 0042's exact backfill would resolve every reference and
null nothing on this data.

## 17. Review 9B-C — controlled apply of 0037-0042 (2026-09-01)

Review 9B-C authorized applying 0037-0042 (schema + backfill only — **not**
the runtime flag). Applied in order via the Supabase MCP against project
`bcaffvpibpitpuqglszn`. Pre-apply baseline re-read immediately before 0037
and matched §16 exactly.

| Migration | Result | Verification |
|---|---|---|
| 0037 prereq keys | applied | `invoices_company_id_id_key` + `credit_notes_company_id_id_key` UNIQUE (company_id, id) both present; DDL-only, no row change |
| 0038 invoice_lines | applied | table + RLS + `invoice_lines_all_own_company` policy; `product_id` nullable; 5 FKs (header cascade + products/warehouses/tax_rates composite); 8 indexes; empty |
| 0039 bill_lines | applied | as 0038 + `fixed_asset_details jsonb` + `check (fixed_asset_details is null or product_id is null)`; empty |
| 0040 purchase_order_lines | applied | as 0038; empty; expected pre-backfill count 0 |
| 0041 credit_note_lines | applied | as 0038 + `original_invoice_line_id uuid` nullable + composite FK → `invoice_lines(company_id, id)`; 6 FKs, 9 indexes; empty |
| 0042 exact backfill | applied | see below |

**0042 NOTICE / orphan counts** (reconstructed read-only — the backfill's own
counters): unresolved products **0**, warehouses **0**, tax rates **0**,
original invoice lines **0**. No per-kind restatement fired. Nothing nulled
for being unresolvable.

**Actual normalized row counts (expected = actual):** `invoice_lines`
**198** / `bill_lines` **68** / `purchase_order_lines` **0** /
`credit_note_lines` **6** / `bill_lines.fixed_asset_details` non-null **0**.

**Stable-ID:** every jsonb line `id` present verbatim in its table — 0
missing, 0 extra, 0 `line_number` vs jsonb-ordinal mismatch, across all
198 + 68 + 6 rows. No regenerated ids. `invoices.line_items` fingerprint
unchanged (`a01f7c25e0ab21bd7c9d74ab1a32c68c` before and after).

**Parity (DocumentLineParityChecker semantics, executed read-only as the
postgres role so RLS does not hide rows — the class's live run needs a
service-role client not configured in this environment; the class itself has
12 passing unit tests):**

| type | docs | jsonb lines | normalized | MATCH | MISSING | EXTRA | FIELD MISMATCH |
|---|---|---|---|---|---|---|---|
| invoice | 65 | 198 | 198 | 198 | 0 | 0 | 0 |
| bill | 31 | 68 | 68 | 68 | 0 | 0 | 0 |
| purchase_order | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| credit_note | 6 | 6 | 6 | 6 | 0 | 0 | 0 |

**Credit-note original line:** all 6 `credit_note_lines.original_invoice_line_id`
are NULL (historic credit notes carry no `originalInvoiceLineId`). Correct —
not inferred.

**Accounting non-impact (before → after, identical):** journal_entries
171→171, journal_lines 705→705, stock_movements 284→284,
inventory_transaction_log 0→0, GL 1200 R1 569 743.20 unchanged, GL 1210 R0.00
unchanged, inventory valuation R1 569 743.20 unchanged, global debit/credit
R4 838 209.61 unchanged, trial-balance diff R0.00, products fingerprint
(`quantity_on_hand`/`cost_price`) unchanged
(`a7c742e7ddf85c1b642ec6712361d1b2`).

**Advisors (after − before):** no new *security* category; the +4
`auth_allow_anonymous_sign_ins` are one per new table's `all_own_company`
policy — the same coarse-tenant policy shape every existing document table
already trips (project-wide design, not a 9B regression). Performance: +17
`unindexed_foreign_keys` (INFO — the composite `(company_id, <fk>)` FKs, same
INFO the 0029 inventory line tables produce) and +18 `unused_index` (INFO —
nothing queries these tables yet; flag OFF). No new WARN/ERROR. No
missing-RLS, no RLS-without-policy, no SECURITY DEFINER, no mutable
search_path (0042 is a `DO` block, not a function).

**Full app gate (re-run post-apply):** typecheck clean, lint
`--max-warnings 0` clean, tests **1895 / 1895** (260 files), build clean.

## 18. Phase 9B-E — repository hardening (2026-09-01, for Review 9B-E)

1. **Migration history filenames corrected.** `apply_migration` recorded
   the six under its own timestamps, not the repo files' placeholders. The
   six local files were `git mv`'d to the exact recorded versions — SQL
   semantics unchanged, no reapply, remote history untouched:

   | logical | local file (now) — matches `schema_migrations.version` |
   |---|---|
   | 0037 | `20260901152836__0037_prereq_company_id_id_keys.sql` |
   | 0038 | `20260901152855__0038_invoice_lines_table.sql` |
   | 0039 | `20260901152905__0039_bill_lines_table.sql` |
   | 0040 | `20260901152915__0040_purchase_order_lines_table.sql` |
   | 0041 | `20260901152928__0041_credit_note_lines_table.sql` |
   | 0042 | `20260901153040__0042_normalized_line_backfill.sql` |

   Local history now aligns exactly with remote — a future `supabase db
   push` sees all six as already applied and reruns none. Ordering
   preserved (all six `> 0036`'s `20260830221256`, strictly ascending).

2. **Projector non-positive-quantity behavior fixed.**
   `SupabaseDocumentLineProjector` now filters lines through
   `isProjectableLineQuantity()` — the same `quantity > 0` rule migration
   0042 uses and the tables enforce (`check (quantity > 0)`). A
   zero/negative/missing/non-numeric quantity line is omitted from the
   projection (never coerced; the authoritative jsonb keeps it untouched),
   so one bad legacy line can no longer fail the whole document's
   projection. `line_number` stays the line's ORIGINAL 1-based jsonb array
   position (not re-sequenced after a skip) — consistent with 0042's
   `with ordinality` and `DocumentLineParityChecker`. No DB CHECK was
   weakened. 8 new tests (positive / zero / negative / mixed valid+invalid
   with position preservation / non-authoritative contract intact / source
   jsonb table never touched / the pure predicate).

3. **Historical realised margin — unchanged and NOT manufactured.**
   Normalizing the lines does not create any historical COGS / WAC /
   realised-margin data. Per §11: realised margin remains **NOT AVAILABLE**
   for any sale whose `stock_movements` row pre-dates migration 0022 (no
   `unit_cost` / `source_document_line_id` recorded at the time). 0042
   touched no cost column. `invoice_lines` carries no cost column at all —
   it is a copy of the priced sales line, not a costing record. Forward
   sales posted through `post_inventory_transaction()` (0031+) still carry
   full realised-margin evidence on the movement, exactly as before.

### Final applied-migration result (recorded)

`invoice_lines` **198** · `bill_lines` **68** · `purchase_order_lines` **0**
· `credit_note_lines` **6** · `bill_lines.fixed_asset_details` non-null
**0**. Parity: **0 missing / 0 extra / 0 field mismatch** across all four
types. Accounting unchanged before→after: JE **171**, journal lines
**705**, stock movements **284**, GL 1200 **R1 569 743.20**, GL 1210
**R0.00**, inventory valuation **R1 569 743.20**, debit = credit
**R4 838 209.61**, trial-balance difference **R0.00**, products
`quantity_on_hand`/`cost_price` fingerprint unchanged.

## 19. STATUS

Migrations 0037-0042 **APPLIED** (schema + exact backfill); local filenames
now match remote history. `NORMALIZED_DOCUMENT_LINES_ENABLED` **stays
`false`** — runtime authority is still the jsonb `line_items`; the
normalized tables are an inert, verified projection. Full parity, zero
accounting impact, Office National uncontaminated. No Cloudflare deploy.
No new commit / push — stop for Review 9B-E.
