# SALES FULFILMENT — Partial Sales Order Delivery & Invoicing

# ═══════  PHASE 5B: COMPLETE + SHIPPED (NOT REOPENED)  ·  PHASE 5C-A: APPLIED + LIVE-VERIFIED  ═══════

**Phase 5C (Delivery Notes) design audit is done and approved — see `docs/DELIVERY_NOTES_DESIGN.md`
for the full 29-part design, journal examples, and the adopted HYBRID accounting model. CP-5C-A
(2026-09-04, three review cycles) authored the complete `0050`-`0055` changeset — a new
company-safe composite-key prerequisite, the enum value, `delivery_notes` table with ALL composite
FKs, `1220` account seed, atomic `post_delivery_note` RPC, and `0055` (a **Phase 5C compatibility
amendment** to `create_invoice_from_sales_order` — see this file's §13/§16 for exactly what stays
unchanged in Phase 5B) — **ALL SIX APPLIED to `bcaffvpibpitpuqglszn` 2026-09-04 and LIVE-VERIFIED**,
NOT committed to git yet. The scenario-F over-issue gap between Delivery Notes and the existing
invoice RPC is RESOLVED, proven both by `0055`'s contract (69 migration-contract tests, including
a formal 18-scenario quantity-matrix proof) AND by a live rollback-wrapped smoke test against the
real database — **Phase 5B itself is NOT reopened**, its worked example and invariants below are
unchanged and fully
preserved. No service/UI code exists yet. This file's §14 "Deferred" row for delivery notes is
superseded by the design doc, kept below only as a pointer.**

**CP-5B-0 design** (§§1–12) + **5B.1–5B.4 implementation** (§13) + **deferred work** (§14) · branch
`phase-9b-relationship-design-and-code` · **UNCOMMITTED (working tree).**
**Migrations 0048 + 0049 APPLIED to the live project; the 5B.1 relationship backfill RUN
(relationship-only, 9 links, all accounting fingerprints unchanged).**

Sales Fulfilment now supports the full workflow:
Quote → Sales Order → confirm → **stock committed** → one or more **partial draft invoices** →
post each → **stock issued + COGS + revenue + VAT + AR for that quantity only** + **remaining
commitment shrinks** → repeat → **Fulfilled**; OR, at any partly-invoiced point, **Close remaining**
→ the un-invoiced remainder is abandoned and its commitment released, with **zero** accounting
effect. Payment is always a separate event and never controls fulfilment.

Nothing further is planned inside "Phase 5B". Deferred items (§16) belong to Phase 5C / 5D / 6 / 7.

Complements `docs/ACCOUNTING_RELATIONSHIPS.md` (§ "Q6"), `docs/INVENTORY_ARCHITECTURE.md`
(§ "STOCK COMMITMENT"), `docs/PHASE_9B_DESIGN.md`.

---

## 1. Current-state audit

### 1.1 Entities & storage (verified in code, 2026-09-04)

| Entity | File | Line storage | Line-progress fields |
|---|---|---|---|
| `SalesOrder` | `src/types/salesOrder.ts` | `lineItems: DocumentLineItem[]` (jsonb `sales_orders.line_items`, single-row header+lines write) | **none** |
| `DocumentLineItem` | `src/types/common.ts` | — | `id · productId? · warehouseId? · description · quantity · unitPrice · taxRateId? · taxAmount · lineTotal · fixedAssetDetails?` — **no `deliveredQty` / `invoicedQty` / `fulfilledQty` / `salesOrderLineId`** |
| `Invoice` | `src/types/invoice.ts` | `lineItems: DocumentLineItem[]` (jsonb) | `salesOrderId?` (header only) · `journalEntryId?` |
| `StockMovement` | `src/types/stockMovement.ts` | append-only ledger | `sourceDocumentType · sourceDocumentId · sourceDocumentLineId · unitCost · totalCost · movementDate` |
| `DeliveryNote` | — | **does not exist** | — |

`sales_order_status` is a real Postgres enum (`migration 0006`):
`pending · confirmed · fulfilled · cancelled`. No `partially_*` value.
`invoice_status` enum: `draft · sent · partially_paid · paid · overdue · void`.

**There is no `sales_order_lines` normalized table.** Phase 9B normalized invoice / bill /
purchase-order / credit-note lines (migrations `0038`–`0041`, APPLIED, flag `OFF`) but **not** sales
orders. SO lines are jsonb-only, with no projector.

### 1.2 Relationships that exist today

```
Quote ──quoteId?──▶ SalesOrder ──salesOrderId?──▶ Invoice ──┬─ line.id ─▶ stock_movements.source_document_line_id
 (derived                (header FK,                         │            (source_document_type='invoice',
  "converted")            nullable, 1:1 enforced)            │             source_document_id=invoice.id)
                                                             └─ invoices.journal_entry_id ─▶ journal_entries
                                                                inventory_transaction_log(source_type,source_id) ─▶ journal_entry_id
```

- **Quote → SO:** `salesOrder.quoteId` forward FK. "Converted" is derived (an SO exists referencing
  the quote); there is no `converted` quote status.
- **SO → Invoice:** `invoice.salesOrderId` forward FK, nullable. **1:1 and hard-enforced** —
  `SalesOrderService.convertToInvoice()` throws if any invoice already has
  `salesOrderId === order.id` ("it was already converted to invoice …"). This is the single
  biggest blocker to multiple invoices from one SO.
- **SO line → Invoice line:** **none.** `convertToInvoice()` sets `lineItems: order.lineItems`,
  copying the array by reference — in code the invoice line *ids equal* the SO line ids, but nothing
  records or relies on that, and the September 2026 seed hand-authored **different** ids on each side
  (SO-2026-0001 lines `…210000000001-3` → INV-1068 lines `…31000000000f-11`). So no code path today
  can join an invoice line back to its SO line.
- **Invoice line → stock movement:** solid. `postInvoice()` passes `sourceDocumentLineId: line.id`;
  the RPC writes it onto every `sale` movement with `unit_cost` / `total_cost` = the WAC blended in
  the same atomic call (`docs/PHASE_9B_DESIGN.md` §5).
- **Stock movement → journal:** `inventory_transaction_log(source_type, source_id) → journal_entry_id`
  plus `invoices.journal_entry_id`. Reverse lookup exists for inventory postings.

### 1.3 `convertToInvoice()` — exact current behaviour

`src/features/sales/services/salesOrderService.ts` L94-142:

1. Guards: not `cancelled`, not `fulfilled`, **no existing invoice with `salesOrderId === order.id`**.
2. Creates a **draft** invoice, `invoice.salesOrderId = order.id`, `lineItems = order.lineItems`
   (every line, full quantity), totals copied verbatim.
3. Sets the order `status = 'fulfilled'`.
4. No GL, no stock, no VAT — the invoice is draft; `InvoiceService.postInvoice()` does the
   accounting later, unchanged.

There is no quantity selection, no "invoice the rest later", no re-entry.

### 1.4 `postInvoice()` — the accounting event (unchanged, engine untouched)

`src/services/invoiceService.ts` L249-342. One atomic `inventoryPostingEngine.applyInventoryTransaction()`
call, `postingKey = "invoice:<invoiceId>:post"`, producing ONE balanced journal entry:

```
DR  Accounts Receivable                 invoice.total
  CR  Sales Revenue (per resolved acct) bucketed to invoice.subtotal
  CR  VAT Output                         invoice.taxTotal            (only if > 0)
DR  Cost of Goods Sold (per product)    Σ WAC × qty  (engine-computed, inside the RPC)
  CR  Inventory (per product)           Σ WAC × qty
```

plus one `stock_movements` row per tracked line (`type='sale'`, `quantityDelta = -line.quantity`,
`costingMode='issue'`, valued at current WAC). Flips `draft → sent`, stamps `journalEntryId`.
Post-`draft`, `updateInvoice()` rejects any accounting-relevant field change; delete is draft-only.

### 1.5 Stock commitment (Phase 5A — just shipped, commit `4233dc2`)

`stock_balances.quantity_committed` stays **0 in storage**. Committed is **derived on read**:
`stockCommitmentService.getCommitmentMap()` = Σ **`confirmed`** Sales Order line quantities per
`(product, warehouse)`. `pending` / `fulfilled` / `cancelled` commit nothing. Editing a confirmed SO
excludes its own contribution at the `SalesOrderForm` layer only (`ownCommitmentMap`).
**Phase 5A commits the whole ordered quantity while `confirmed`** — it has no `deliveredQty` to net
out. This is the exact limitation Phase 5B removes.

### 1.6 Consumers of `salesOrder.status` (must stay correct through 5B)

| Consumer | Use |
|---|---|
| `SalesOrderService` | `confirmOrder` (`pending→confirmed`), `cancelOrder` (→`cancelled` unless `fulfilled`), `deleteSalesOrder` (`pending` only), `convertToInvoice` (blocks `cancelled`/`fulfilled`) |
| `stockCommitmentService` / `ownCommitmentMap` | **only `confirmed` commits stock** |
| `SalesOrderDetailPage` | `canConfirm` / `canCancel` / `canConvert` / `canDelete` gating |
| `SalesOrderList` | `StatusBadge`, status column sort + filter |
| `SalesOrdersPage` | post-conversion deep-link to `/sales/invoices?record=<id>` |
| `businessDocuments/adapters/salesOrderToBusinessDocument.ts` | document rendering |
| September 2026 seed | 3 SOs `fulfilled` (→ invoice), 1 (`SO-2026-0004`) `pending` |

### 1.7 Live data reality (Office National, project `bcaffvpibpitpuqglszn`)

- **4 sales orders.** `SO-2026-0001/0002/0003` = `fulfilled`, each 1:1 with a posted invoice
  (`INV-1068`, `INV-1072`, `INV-1074`), full-quantity, line quantities identical on both sides.
  `SO-2026-0004` = `pending`, one placeholder line (`productId: null`, qty 1, R0).
- **Zero `confirmed` sales orders** → Phase 5A commitment shows 0 everywhere on live data today.
- SO↔invoice line ids **differ** in the seed (see §1.2) — a backfill cannot assume id equality.
- Trial balance balanced; GL 1200 == inventory valuation (diff R0.00); normalized-line parity
  0/0/0; `NORMALIZED_DOCUMENT_LINES_ENABLED` OFF.

### 1.8 Gap summary

| # | Gap | Blocks |
|---|---|---|
| G1 | No SO-line ↔ invoice-line relationship | traceability, per-line progress, partial invoicing |
| G2 | `invoice.salesOrderId` is 1:1 hard-enforced | multiple invoices from one SO |
| G3 | No `orderedQty − invoicedQty` / `remainingToInvoice` anywhere | partial invoicing, backorders |
| G4 | No `deliveredQty` / delivery event distinct from invoicing | partial delivery, "invoice ≤ delivered" (5C) |
| G5 | `SalesOrderStatus` has no partial state; `fulfilled` is set on first convert | two-dimensional lifecycle |
| G6 | Phase 5A commitment can't net partial progress | over-stated commitment once partial invoicing exists |
| G7 | No way to abandon the un-invoiced remainder of an SO | closing short-shipped orders |

---

## 2. Proposed data model

### 2.1 Design decision — DERIVED progress, not stored counters

**`invoicedQty` and `deliveredQty` are DERIVED from immutable related records, never stored
counters.** Rationale:

- A **posted** invoice line is immutable (`updateInvoice()` blocks accounting-relevant edits past
  `draft`; delete is draft-only; corrections go through credit notes). `Σ` of posted-invoice-line
  quantities linked to an SO line is therefore stable, monotonic evidence — it cannot drift.
- A stored `invoicedQty` counter would need a reconciliation job against the actual invoices and
  would desync on every void / draft-delete / credit note / failed partial post. Phase 5A already
  chose derived commitment for exactly this reason; aging and realised margin are derived too.
- Draft invoices from an SO are mutable, so they are counted **separately** (`draftInvoicedQty`)
  and only gate the quantity picker — deleting a draft frees the quantity back up automatically,
  posting it moves the quantity into `invoicedQty` automatically. No counter to maintain.

**What IS stored** (the minimum):

| Field | Where | Type | Why it must be stored |
|---|---|---|---|
| `salesOrderLineId?` | each **invoice** `DocumentLineItem` (jsonb, authoritative) | `ID` | the G1 relationship — the immutable evidence everything else derives from. Set once at invoice-creation-from-SO, never edited. Invoice-lines only (same pattern as `fixedAssetDetails` = bill-lines only). |
| `orderedQty` | SO line `quantity` (**already exists**) | `number` | the fixed baseline; immutable once the SO is `confirmed`. |
| commercial `status` | `sales_orders.status` (**already exists**) | enum | user-driven lifecycle only — see §2.3. |

Everything else (`invoicedQty`, `remainingToInvoice`, `deliveredQty`, `remainingToDeliver`,
`invoicingStatus`, `fulfilmentStatus`, `openCommitment`) is computed by a selector /
`salesOrderFulfilmentService`, never persisted.

### 2.2 The SO-line ↔ invoice-line relationship

**Authoritative (ships in 5B, zero migration):** `DocumentLineItem.salesOrderLineId?: ID` on
invoice lines, stored in the jsonb `invoices.line_items` — consistent with how this table already
works (migration 0006 comment: "no FK enforcement on a line's productId … each document is a
single-row write"). `createInvoiceFromSalesOrder()` stamps it; nothing ever mutates it.

**Durable projection (optional 5B follow-on, matches Phase 9B):** a `sales_order_lines` table
(mirrors `invoice_lines`, migration 0038) + `invoice_lines.sales_order_line_id uuid` with a composite
`(company_id, sales_order_line_id) → sales_order_lines(company_id, id)` FK. Written only when
`NORMALIZED_DOCUMENT_LINES_ENABLED` flips true — same inert-until-flagged position as every other
normalized line table. Not required for 5B to function.

### 2.3 Status — two derived dimensions + one stored lifecycle

Per the CURRENT_TASKS 5B preference, but with the two progress dimensions **derived**:

```
commercialStatus   (STORED  — sales_orders.status)   pending · confirmed · closed · cancelled
fulfilmentStatus   (DERIVED — selector)              not_delivered · partially_delivered · delivered
invoicingStatus    (DERIVED — selector)              not_invoiced · partially_invoiced · invoiced
```

- `pending → confirmed`: unchanged (`confirmOrder`). Only `confirmed` commits stock.
- **`closed`** (NEW enum value — the one small migration, `ALTER TYPE … ADD VALUE`): "no more
  invoicing — abandon whatever is not yet invoiced". Releases the remaining commitment. Replaces
  today's habit of flipping to `fulfilled` on first convert.
- `cancelled`: unchanged; blocked once anything is invoiced (use `closed` instead).
- **`fulfilled` is retained** as a legacy-tolerated value meaning "confirmed + `invoicingStatus =
  invoiced`". Existing `fulfilled` rows are left as-is (see §7). New orders never get set to
  `fulfilled` by code; a fully-invoiced order simply derives `invoicingStatus = invoiced` and the UI
  may show a "Fulfilled" badge from that.

`fulfilmentStatus` pre-5C tracks `invoicingStatus` exactly (invoice = the only fulfilment event).
5C's delivery notes give it an independent source.

### 2.4 Quantity formulas (per SO line)

```
orderedQty          = soLine.quantity                                   (stored, immutable after confirm)

invoicedQty         = Σ  q(il)  for every il in invoice_lines
                         where il.salesOrderLineId == soLine.id
                         AND   il.invoice.status ∈ {sent, partially_paid, paid, overdue}   (POSTED)

draftInvoicedQty    = same Σ but il.invoice.status == 'draft'           (transient; gates the picker only)

deliveredQty        = Σ  q(dnl) for every dnl in delivery_note_lines linked to soLine.id   (0 until 5C)

remainingToInvoice  = max(0, orderedQty − invoicedQty − draftInvoicedQty)      when commercialStatus ∈ {confirmed}
                    = 0                                                        when commercialStatus ∈ {closed, cancelled}

remainingToDeliver  = max(0, orderedQty − deliveredQty)                        (pre-5C: == remainingToInvoice-with-drafts-ignored)

openCommitment      = max(0, orderedQty − deliveredQty)                        when commercialStatus == 'confirmed'
                    = 0                                                        otherwise
                      (pre-5C deliveredQty == posted invoicedQty, so a fully-invoiced confirmed line commits 0)
```

Order-level rollups:

```
invoicingStatus  = not_invoiced      if Σ invoicedQty == 0
                 = invoiced          if Σ invoicedQty == Σ orderedQty  (net of closed remainder)
                 = partially_invoiced otherwise
fulfilmentStatus = analogous over deliveredQty
```

Credit notes do **not** reduce `invoicedQty` in 5B — a return against an SO-derived invoice is a
post-fulfilment event; the SO stays invoiced. (Flagged §11 / candidate 5D.)

---

## 3. State-transition diagram

```
                          ┌─────────────────────────────────────────────────────┐
                          │  commercialStatus  (stored, user/robot-driven)      │
                          └─────────────────────────────────────────────────────┘

   create            confirmOrder                    (all remaining invoiced)
  ────────▶ pending ──────────────▶ confirmed ───────────────────────────────▶ (fulfilled badge, still 'confirmed'
              │                        │                                         or optionally auto-set 'fulfilled')
              │ delete (pending only)  │
              ▼                        │ closeRemaining()          cancelOrder (only if invoicedQty == 0)
           (gone)                      ├────────────▶ closed        ├────────────▶ cancelled
                                       │              (remaining    │
                                       │               commitment   ▼
                                       │               released)  (gone from commitment)
                                       │
                                       │  createInvoiceFromSalesOrder(soId, [{soLineId, qty}], ...)
                                       │  ── draft Invoice #1 (partial) ──▶ postInvoice ──▶ stock+GL for qty1
                                       │  ── draft Invoice #2 (partial) ──▶ postInvoice ──▶ stock+GL for qty2
                                       ▼
              ┌───────────────────────────────────────────────────────────────────┐
              │  invoicingStatus (derived)   not_invoiced ─▶ partially_invoiced ─▶ invoiced      │
              │  fulfilmentStatus (derived)  not_delivered ─▶ partially_delivered ─▶ delivered   │
              └───────────────────────────────────────────────────────────────────┘

   Per-invoice (unchanged):  draft ──postInvoice──▶ sent ──recordPayment──▶ partially_paid ──▶ paid
                             draft ──deleteInvoice──▶ (gone, frees remainingToInvoice)
```

Invariants:
- A `pending` SO commits nothing (Phase 5A rule — **preserved**).
- A `confirmed` SO commits `Σ openCommitment` = remaining un-delivered quantity (5A's "whole
  ordered qty" is the special case where nothing is invoiced yet).
- Only `postInvoice()` moves stock / posts COGS / posts revenue-VAT-AR — never SO confirmation,
  never delivery-note creation pre-5C, never payment.
- `closed` / `cancelled` / `fulfilled` release all remaining commitment.

---

## 4. Accounting-event matrix

| Event | Stock committed (derived, no GL) | `stock_movements` | COGS (DR COGS / CR Inventory @ WAC) | Revenue / VAT / AR (DR AR / CR Rev / CR VAT) | Cash | Notes |
|---|---|---|---|---|---|---|
| Quote sent | — | — | — | — | — | never posts |
| SO `confirmed` | **+ Σ (orderedQty − deliveredQty)** per (product, wh) | — | — | — | — | pure reservation, 0 ledger effect |
| SO line edited while `pending` | recompute | — | — | — | — | allowed |
| SO `confirmed` → `closed` / `cancelled` | **− remaining commitment** | — | — | — | — | abandons remainder |
| `createInvoiceFromSalesOrder` → **draft** invoice (partial) | unchanged (draft doesn't release) | — | — | — | — | picker capped at `remainingToInvoice` |
| `postInvoice()` (partial or full) | **− invoiced qty** (delivered ⇒ no longer committed) | **one `sale` row per line, qty = that invoice's line qty, − delta, @ WAC** | **yes, for that invoice's quantities only** | **yes, for that invoice's subtotal / VAT / total** | — | ONE atomic entry, engine untouched; `postingKey = invoice:<id>:post` (per-invoice, so N invoices = N keys, no collision) |
| Customer receipt / partial payment | **no effect** | — | — | — | **DR Cash / CR AR** (full receipt); allocations bump `invoice.amountPaid` | **payment NEVER gates fulfilment or stock** |
| Customer deposit before invoice (4A) | **no effect** | — | — | — | DR Cash / **CR 2600 Customer Deposits** (unallocated) | applied later `DR 2600 / CR AR`; still stock-independent |
| Credit note against an SO-derived invoice | no effect in 5B | `sales_return` row(s) | reverses COGS for returned qty | DR Rev / DR VAT / CR AR | — | does **not** re-open `remainingToInvoice` in 5B (§11) |

**Precise answers to the CP-5B-0 questions:**

- **Stock is merely _Committed_** while `commercialStatus == 'confirmed'` and the quantity is not
  yet delivered/invoiced. Derived, zero GL, zero `stock_movements`.
- **Physical stock moves** at `postInvoice()` — for that invoice's line quantities only. (5C moves
  this trigger to delivery-note issue.)
- **COGS is recognized** at the same instant as the stock movement — atomically, inside the same
  RPC, at the product's current WAC.
- **Revenue / VAT / AR are posted** at the same instant — all five legs are one balanced entry.
- **Partial customer payment** only ever posts `DR Cash / CR AR` and updates `invoice.amountPaid` /
  invoice status. It does **not** touch commitment, `stock_movements`, COGS, `invoicingStatus`, or
  `fulfilmentStatus`. A wholly-unpaid posted invoice still counts fully towards `invoicedQty`.
  **Payment status must not, and does not, control stock fulfilment.**

---

## 5. Database relationship diagram (target, 5B)

```
                                   products ◀──────────────┐
                                       ▲                   │ product_id
                          product_id   │                   │
   quotes ──quote_id?──▶ sales_orders  │        invoices ───┤
                              │        │           │ sales_order_id?  (FK kept, UNIQUENESS DROPPED — G2)
                     line_items jsonb  │      line_items jsonb
                     [ { id, productId, warehouseId, qty, ... } ]
                              │        │           │
                              │        │      [ { id, productId, warehouseId, qty,
                              │        │          salesOrderLineId?  ◀── NEW jsonb field, authoritative (G1) } ]
                              │        │           │
        (optional projection, flag-gated, Phase-9B style:)
                              ▼        │           ▼
                  sales_order_lines ───┘     invoice_lines  (migration 0038, APPLIED)
                  (NEW table, mirrors             │  + sales_order_line_id uuid  ◀── NEW column
                   invoice_lines)  ◀──────────────┘     composite FK (company_id, sales_order_line_id)
                                                              → sales_order_lines(company_id, id)

   invoice_lines.id  ─────────────▶ stock_movements.source_document_line_id   (unchanged, already correct)
   stock_movements  via inventory_transaction_log(source_type,source_id) ─▶ journal_entries.id
   invoices.journal_entry_id ─────────────────────────────────────────────▶ journal_entries.id
```

Full traceability chain (each hop is a real stored reference, none fabricated):

```
product.id
  → sales_order line (jsonb id  |  sales_order_lines.id)                       [SO line]
  → invoice line .salesOrderLineId (jsonb  |  invoice_lines.sales_order_line_id) [which SO line this fulfils]
  → invoice line .id                                                            [the priced sale line]
  → stock_movements.source_document_line_id (= invoice line id)                  [the physical issue @ WAC]
  → inventory_transaction_log(source_type='invoice', source_id=invoice.id).journal_entry_id
  → journal_entries / journal_lines                                             [DR COGS / CR Inventory, DR AR / CR Rev / CR VAT]
```

---

## 6. Existing-data / backfill analysis

**Do not fabricate relationships that cannot be proven.** What can and cannot be established for the
4 live SOs:

| SO | Status | Invoice | Provable line link? | Backfill action |
|---|---|---|---|---|
| `SO-2026-0001` | fulfilled | `INV-1068` (posted, paid) | **Yes** — 1:1 conversion, 3 lines, identical `(productId, quantity, unitPrice)` in order | set each `INV-1068` jsonb line `.salesOrderLineId` = the positionally- and product-matched `SO-2026-0001` line id |
| `SO-2026-0002` | fulfilled | `INV-1072` (posted, paid) | **Yes** — same, 3 lines | same |
| `SO-2026-0003` | fulfilled | `INV-1074` (posted, paid) | **Yes** — same, 3 lines | same |
| `SO-2026-0004` | pending | — | n/a | nothing to link; placeholder line only |

- Match key for the backfill: **document link is already certain** (`invoice.sales_order_id`); the
  **line** match is `(product_id, quantity, unit_price)` within that pair, then position as a
  tie-breaker. All 3 pairs are exact full-quantity conversions, so every invoice line maps to
  exactly one SO line with no ambiguity. Verify 9/9 lines match before writing; if any pair is not
  exact, **leave that pair's `salesOrderLineId` null** and report it — never guess.
- After backfill, derived `invoicedQty == orderedQty` for all 9 lines → `invoicingStatus =
  invoiced` for the 3 SOs, consistent with their current `fulfilled` status. No status change
  needed.
- **`deliveredQty`**: no delivery evidence exists pre-5C. Backfill sets nothing; `deliveredQty`
  derives as `= posted invoicedQty` under the pre-5C rule, so the 3 SOs read as fully delivered —
  which is correct (goods were issued when the invoices posted; the `stock_movements` prove it).
- **Commitment impact**: zero. All 3 are `fulfilled` (commit nothing under 5A) and would commit
  nothing under 5B's netted formula either (`orderedQty − deliveredQty = 0`). `SO-2026-0004` is
  `pending` (commits nothing). **Inventory reconciliation is unaffected** (GL 1200 == valuation,
  diff R0.00, before and after — nothing is posted).
- **Normalized tables**: if the optional `sales_order_lines` projection is built, its backfill
  mirrors migration `0042` exactly (preserve jsonb line `id`, `with ordinality`, resolve refs
  exactly-or-NULL, `quantity > 0` filter, idempotent `on conflict do nothing`). 4 SOs → ~10 line
  rows. `SO-2026-0004`'s placeholder line has `productId null` + `quantity 1` → 1 row,
  `product_id NULL`.
- **September 2026 data compatibility**: the seed's differing SO/invoice line ids are the reason
  the backfill matches on `(product_id, quantity, unit_price)` + position, **not** id equality.
  Documented so a re-seed or a fresh environment (where `convertToInvoice` *does* copy ids) both
  work — the matcher tolerates both.

---

## 7. Migration proposal

**Guiding rule: the authoritative model ships with ZERO schema migration.** The invoice↔SO line
link is a jsonb field; all progress is derived. Migrations below are additive and optional /
deferrable, each its own review.

| # | Change | Type | Required for 5B? | Notes |
|---|---|---|---|---|
| M1 | `DocumentLineItem.salesOrderLineId?: ID` (TS type + adapters + `SupabaseInvoiceRepository` passthrough — jsonb already stores arbitrary keys) | **code only, no DB** | **yes** | authoritative relationship |
| M2 | Data backfill: stamp `salesOrderLineId` on the 9 `INV-1068/1072/1074` jsonb lines (§6) | **one-time data script** (read-only verify → single `UPDATE` per invoice, guarded, idempotent, logged) | yes | not a schema migration; run as a reviewed `docs/db-changes/` script like `0045b` |
| M3 | `ALTER TYPE public.sales_order_status ADD VALUE 'closed'` | **migration, additive** | yes (for "abandon remainder") | `ADD VALUE` is non-transactional in PG — its own migration file, nothing else in it |
| M4 | Drop the app-level 1:1 guard in `convertToInvoice`; **no DB change** (`invoices.sales_order_id` was never `UNIQUE`) | code only | yes | verified: no unique index on `sales_order_id` |
| M5 | `sales_order_lines` table (mirror `invoice_lines` / migration 0038) + `invoice_lines.sales_order_line_id uuid` + composite FK | **migration, additive** | **no** — optional projection | authored-not-applied, flag-gated write, own review — Phase 9B pattern |
| M6 | `sales_order_lines` backfill (mirror migration 0042) | migration | no | only with M5 |

**Minimum safe set for 5B = M1 + M2 + M3 + M4.** One tiny enum migration, one guarded data script,
the rest is TypeScript. M5/M6 are the "do it properly later" projection and are explicitly not on
the 5B critical path.

No change to `journal_entries` / `journal_lines` / `stock_movements` / the posting engine / the
inventory RPC / any reconciliation. `NORMALIZED_DOCUMENT_LINES_ENABLED` stays OFF.

---

## 8. UI implications

| Surface | Change |
|---|---|
| `SalesOrderDetailPage` | per-line grid **Ordered / Invoiced / Remaining** (+ Delivered once 5C); order-level `invoicingStatus` + `fulfilmentStatus` badges alongside the commercial status; "Create invoice" opens a **quantity picker** (default = remaining, cap = `remainingToInvoice`); "Close remaining" action when `partially_invoiced`; existing "Convert to invoice" becomes "Invoice all remaining" |
| `SalesOrderList` | badge shows commercial status + a compact invoicing indicator (e.g. "3 of 5 invoiced"); filter by `invoicingStatus` |
| `SalesOrdersPage` | post-conversion notice handles N invoices — link to the newest / a list |
| `InvoiceDetailPage` | when `salesOrderId` set, show "From SO-xxxx" and, per line, "SO line: ordered N, this invoice M"; deep-link back to the SO |
| `InvoiceForm` (create-from-SO path) | line rows show remaining-to-invoice; block a line qty > remaining (this is a hard block — unlike the SO over-commitment warning — because over-invoicing an SO is a data error, not a business choice) |
| `SalesLineItemsEditor` | Phase 5A caption text updates: committed figure now nets invoiced progress |
| `businessDocuments` SO adapter | optionally surface Ordered/Invoiced columns on the SO document; invoice documents unchanged |
| `StatusBadge` | learn `closed`, `partially_invoiced`, `partially_delivered`, `not_invoiced`, … |

No change to the invoice print/PDF layout, the receipt flow, or the deposit UI.

---

## 9. Required tests

**Derived selectors (`salesOrderFulfilmentService` / pure functions):**
- ordered 10, no invoices → `remainingToInvoice 10`, `not_invoiced`, `openCommitment 10` (confirmed)
- ordered 10 → draft invoice 4 → `remainingToInvoice 6`, still `not_invoiced` (draft not counted as progress), `draftInvoicedQty 4`
- post that invoice → `invoicedQty 4`, `partially_invoiced`, `remainingToInvoice 6`, `openCommitment 6`
- second invoice 3, posted → `invoicedQty 7`, `remainingToInvoice 3`
- third invoice 3, posted → `invoiced`, `remainingToInvoice 0`, `openCommitment 0`
- delete a draft partial → `remainingToInvoice` opens back up
- `closeRemaining()` at invoiced 7/10 → `remainingToInvoice 0`, commitment released, order `closed`
- cancelled/closed SO → `remainingToInvoice 0` regardless of orderedQty
- multi-line SO, different products, independent progress per line
- warehouse-scoped: SO line at WH-A partially invoiced from WH-A only; commitment nets per (product, WH)
- line with `productId null` (service line) → no commitment, invoicing still tracked

**`createInvoiceFromSalesOrder(soId, [{soLineId, qty}], ...)`:**
- picks a subset of lines / partial quantities; stamps `salesOrderLineId` on every created invoice line
- rejects qty > `remainingToInvoice` for a line (hard error)
- rejects a `cancelled` / `closed` SO, a non-existent SO line, a duplicate SO line in one call
- N successive partial invoices from one SO all succeed (G2 removed); each has its own `postingKey`
- the legacy `convertToInvoice` still works = "invoice all remaining once"
- engine call is byte-for-byte the same shape as today for the quantities in that invoice
  (revenue / COGS / VAT identical per invoice; Σ across partial invoices == single-invoice total)

**Commitment (Phase 5A regression + evolution):**
- `pending` SO commits nothing (**5A rule preserved**)
- `confirmed` SO, nothing invoiced → commits full orderedQty (5A parity)
- `confirmed` SO, partially invoiced → commits `orderedQty − invoicedQty`
- fully-invoiced `confirmed`/`fulfilled`/`closed` SO → commits 0
- inventory reconciliation (GL 1200 ↔ valuation) unchanged by any of the above

**Accounting invariants:**
- partial invoice posts a balanced entry; Σ of 3 partial invoices' journals == the single-shot journal
- payment / partial payment / deposit application never changes any fulfilment or commitment figure
- credit note against a partial invoice behaves as today (documented boundary)

**Migration / backfill:**
- M2 script: 9/9 lines match on `(product_id, quantity, unit_price)`+position; idempotent; leaves
  a non-matching pair null and reports it; no accounting rows touched
- M3: `closed` accepted by the enum; existing rows unaffected
- (M5/M6 if built) contract test mirroring `normalizedLineMigrations.test.ts`

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Flipping the commitment formula silently changes a live "Available" figure | Med | live data has 0 `confirmed` SOs → no visible change on prod today; ship behind tests; the formula reduces to 5A's when nothing is invoiced |
| `salesOrderLineId` in shared `DocumentLineItem` leaks onto quote/PO/bill lines | Low | optional field, doc-commented "invoice lines only" (same as `fixedAssetDetails` = bill only); adapters ignore it elsewhere |
| Backfill mis-links a line if a future SO→invoice conversion is *not* full-quantity | Low | 5B backfill only runs against the 3 known-exact pairs; matcher verifies exact before writing, else null + report |
| `ALTER TYPE … ADD VALUE` cannot run in a transaction / cannot be rolled back | Low | isolate in its own migration file; `closed` is purely additive, no backfill |
| Multiple invoices per SO breaks a consumer assuming 1:1 (`SalesOrdersPage` deep-link, dashboards) | Med | audit every `invoice.salesOrderId` reader in 5B.1; the deep-link becomes "most recent" or a list |
| Draft invoice quantity double-spends `remainingToInvoice` across two concurrent pickers | Low | picker reads live remaining at open; server re-validates `qty ≤ remaining` at create; last writer that exceeds is rejected |
| `postInvoice` `postingKey` collision if a partial invoice is split/retried | Low | key is `invoice:<invoiceId>:post` — per **invoice**, not per SO; each partial invoice is a distinct row → distinct key (already correct) |
| Phase 9B flag flipped later expects `sales_order_lines` to exist | Low | M5 authored alongside so the projector covers SO lines when/if the flag flips |
| Credit-note interaction with `remainingToInvoice` left undefined | Med | explicitly out of 5B scope, documented §11, tracked for 5D |

---

## 11. Known issues / open questions (to settle at CP-5B or defer)

1. **Credit notes vs SO progress** — a credit note against an SO-derived invoice does not re-open
   `remainingToInvoice` in 5B. If the business wants "credited qty becomes re-invoiceable", that is
   a 5D decision needing the credit-note-line ↔ invoice-line ↔ SO-line chain (the first hop exists:
   `originalInvoiceLineId`, Phase 9B).
2. **Per-line partial cancellation** — 5B only offers document-level `closed` ("abandon all
   remainder"). Cancelling *some* of one line's remainder while keeping the rest open needs a stored
   `cancelledQty` per SO line — deferred; `closed` covers the common case.
3. **Auto-`fulfilled`** — should a `confirmed` SO auto-transition its stored status to `fulfilled`
   when `invoicingStatus` derives to `invoiced`, or stay `confirmed` with only the derived badge
   changing? Recommendation: **stay `confirmed`**, derive the badge — fewer writes, no trigger.
   Decide at CP-5B.
4. **Delivered ≠ invoiced ordering** — 5B allows invoicing before delivery (no delivery concept
   yet). 5C must decide whether to retro-enforce "invoice ≤ delivered".
5. **`SalesLineItemsEditor` two known-issue carry-overs from 5A** (company-wide on-hand vs
   warehouse-scoped committed; "other orders" wording) — fold the fix into the 5B editor rework
   (already logged in `docs/KNOWN_ISSUES.md`).
6. **`invoice.salesOrderId` has no DB FK-level uniqueness today** — confirmed; dropping the app
   guard needs no migration, but 5B.1 should add a comment on the column so a future dev doesn't
   "restore" a unique index.

---

## 12. Recommended implementation increments

Each is design → author → **its own checkpoint** → gate green → approval. No DB write, no migration
apply, no merge, no deploy without explicit sign-off.

| Inc | Scope | Migration | Status |
|---|---|---|---|
| **5B.1** | `salesOrderLineId?` on invoice lines; `salesOrderFulfilment.ts` derived selectors; every `invoice.salesOrderId` consumer audited; read-only SO-detail UI. | none | ✅ DONE |
| **5B.2** | `createInvoiceFromSalesOrder(soId, selections[])`; `PartialInvoicePicker` large modal; service-enforced cap at `remainingToInvoiceQty`; `convertToInvoice` = "invoice all remaining"; status flip → POST time. | none | ✅ DONE |
| **5B.3** | Commitment formula = `max(0, orderedQty − postedFulfilledQty)`; draft/void release nothing; reduces to the 5A rule; inventory reconciliation unchanged. | none | ✅ DONE |
| **5B.4** | Atomic `create_invoice_from_sales_order` RPC (**0049 APPLIED**); `closed` commercial status (**0048 APPLIED**) + "Close remaining"; `cancelOrder` tightened; the 5B.1 relationship backfill **RUN** (9 links, relationship-only). ⚠️ **CP-5C-A (2026-09-04) found 0049's "remaining" check does not (and, being a Phase-5B-only RPC, could not) account for Delivery Notes — see `docs/DELIVERY_NOTES_DESIGN.md` § "CP-5C-A HARDENING" scenario F. Not a Phase 5B defect (Delivery Notes didn't exist yet). RESOLVED via `0055`, a Phase 5C compatibility amendment (`create or replace function`, same name/signature) — gate-proven AND applied live 2026-09-04. This is explicitly NOT a Phase 5B reopening: `0055` is proven byte-identical to `0049`'s original behaviour whenever no Delivery Note exists (see "CP-5C-A APPLIED + LIVE-VERIFIED").** | 0048 + 0049 **applied**, `0055` upgrade **applied** 2026-09-04 · backfill **run** | ✅ DONE (5B + 0055 upgrade) |
| **5B.5** | `sales_order_lines` normalized table + `invoice_lines.sales_order_line_id` (flag-gated Phase-9B-style projection). | not authored | **DEFERRED → Phase 6/7** (not needed for the runtime workflow; jsonb is authoritative) |
| **5B.6** | Full test matrix + docs. | none | ✅ DONE (§14, this doc, `ACCOUNTING_RELATIONSHIPS.md` Q6, `INVENTORY_ARCHITECTURE.md`, `KNOWN_ISSUES.md`) |

**PHASE 5B IS COMPLETE.** `sales_order_lines` normalization (old "5B.5"), delivery notes (5C) and
credit-note/partial-invoicing polish (5D) are separate future phases — see §16 and
`docs/CURRENT_TASKS.md`.

---

## 13. IMPLEMENTATION STATUS

### 5B FINAL — atomic RPC + `closed` status + backfill (2026-09-04, uncommitted; migrations APPLIED)

**Concurrency — the atomic RPC (migration `0049`, APPLIED).**
`public.create_invoice_from_sales_order(p_sales_order_id uuid, p_selections jsonb, p_created_by text,
p_issue_date timestamptz) returns jsonb`. Signature mirrors `apply_customer_deposit`:
- `SECURITY INVOKER`, `set search_path to 'public'`, `revoke ... from public, anon`, `grant execute
  ... to authenticated`. `v_company := get_my_company_id()` — the client never supplies a company id.
- **`select ... from sales_orders ... for update`** — locks the SO row, serialising every concurrent
  create-invoice for that order. Two callers racing the same line can no longer both pass the check.
- Remaining is re-computed **inside the transaction**: `taken = Σ non-void (draft + posted) linked
  invoice-line qty` for that SO line; `remaining = ordered − taken`; `quantity > remaining` → reject.
- Every invoice-line field (`productId` / `warehouseId` / `taxRateId` / `unitPrice` / `description` /
  totals) comes from the **authoritative SO line jsonb**. The request carries only
  `{ salesOrderLineId, quantity }` — `v_sel->>'productId'` / `->>'unitPrice'` are never read.
- Each line gets a fresh `gen_random_uuid()` id + `salesOrderLineId`. Whole-line billing preserves
  the SO line's exact `lineTotal` / `taxAmount`; a partial recomputes at the SO line's effective rate.
- Creates a **`draft`** invoice. **No journal, no `journal_lines`, no `stock_movements`, no
  `create_journal_entry_with_lines`, no `post_inventory_transaction`.** Does **not** touch
  `sales_orders.status` (a draft never flips commercial status). Writes one `audit_log_entries` row.
- Invoice-number retry loop (`INV-<year>-NNNN`, `max+1`, on `unique_violation` bump and retry ×25).
- Not idempotent on a client key — a lost-response retry can create a second draft, but the
  remaining cap (which counts existing drafts) rejects it once it exceeds the ordered quantity. A
  request-id log is a future nicety.
- Applied + rollback-wrapped smoke-tested against `SO-2026-0004`: created a draft, linked the line,
  rejected an over-invoice inside the same transaction, nothing persisted.

**TS wiring** — `SalesOrderDraftInvoiceWriter` interface + two impls
(`src/features/sales/services/salesOrderDraftInvoiceWriter.ts`):
- `RpcSalesOrderDraftInvoiceWriter` (production, `src/features/sales/services/index.ts`) — calls the
  RPC, then re-reads the created invoice through the shared invoice repository.
- `LocalSalesOrderDraftInvoiceWriter` (tests / mock repos) — assembles the already-validated `built`
  result and writes it through the repository.
`SalesOrderService.createInvoiceFromSalesOrder` still runs `buildInvoiceFromSelections` for
fail-fast UX validation, then delegates the write. `InvoiceService.postInvoice` /
`inventoryPostingEngine*` are **byte-unchanged**.

**`closed` commercial status (migration `0048`, APPLIED — `ALTER TYPE sales_order_status ADD VALUE
IF NOT EXISTS 'closed'`).**
- `SalesOrderStatus = 'pending' | 'confirmed' | 'fulfilled' | 'closed' | 'cancelled'`.
- **`fulfilled`** = every ordered quantity actually supplied (posted invoices). **`closed`** = the
  business abandoned the un-invoiced remainder — short-shipped on purpose. Different meanings, never
  conflated.
- `SalesOrderService.closeRemaining(id)` — allowed only for a `confirmed` order with **POSTED**
  invoicing progress (`postedFulfilledQty > 0`) **and** an un-invoiced remainder (`canCloseRemaining`).
  *Posted*, not merely drafted: closing means "we won't supply the rest", so a supplied part must
  exist — an order still entirely in draft has the draft posted (then closed) or deleted (then
  `cancelOrder`d). Sets `status = 'closed'`, writes a `sales_order_closed` audit row. **No journal,
  no stock movement, no COGS, no revenue, no VAT, no AR, no invoice, no credit note.** The
  already-invoiced lines and their postings are untouched.
- Defensive: if a still-open draft *is* posted after a close and now completes every line,
  `syncSalesOrderStatusAfterPost` promotes `closed → fulfilled` (the truthful state).
- `StockCommitmentService` (which only reserves for `confirmed`) stops committing the remainder —
  the reserved stock is released purely by re-derivation, no DB write.
- `cancelOrder` **tightened**: rejects once any non-void invoice is linked ("close the remaining
  quantity instead") and rejects `fulfilled` / `closed` / `cancelled`. A pending or an
  un-invoiced-confirmed order is still cancelled.
- Consumers updated: `SalesOrderList` status filter, `SalesOrderDetailPage` gating + "Close
  remaining" action + a confirmation dialog stating the abandoned quantity/value, `StatusBadge`
  (`closed` → neutral "Closed", already present). `stockCommitmentService` / `ownCommitmentMap`
  needed no change (they already gate on `=== 'confirmed'`).

**5B.1 relationship backfill — RUN (2026-09-04).** `docs/db-changes/5b1_backfill_sales_order_line_links.sql`
logic, executed via the Supabase MCP against Office National with a fresh read-only audit first
(9/9 lines matched **exactly one** SO line on `(productId, quantity, unitPrice)` + array position;
0 ambiguous, 0 unmatched, 0 cross-company). Result: `invoice_lines_with_link` 0 → **9** across
`INV-1068` / `INV-1072` / `INV-1074`. **Relationship-only** — the invoice financial fingerprint,
sales-order fingerprint, trial balance, GL 1200, inventory valuation, JE / journal-line / stock-
movement counts were **byte-identical before and after**. `SO-2026-0004` (pending, placeholder line)
had nothing to link.

**Migration / DB:** `0048` + `0049` **APPLIED** (recorded `20260904115109` / `20260904115239`;
local files renamed to match). Backfill **RUN** (relationship-only). `audit_log_entries.action`
gains the free-text value `sales_order_closed` (no schema change — `action` is `text`). Security
advisors: **0 ERROR**; no new WARN attributable to `0048`/`0049`.
`NORMALIZED_DOCUMENT_LINES_ENABLED` still `false`; runtime authority still jsonb.

**Gate:** tsc ✅ · eslint `--max-warnings 0` ✅ · **2348 tests / 310 files** ✅ (from 2312 / 308 —
**+36 tests / +2 files** `salesFulfilmentMigrations.test.ts` + `salesOrderDraftInvoiceWriter.test.ts`)
· `vite build` ✅.

---

## 14. Deferred — future phases (NOT part of Phase 5B)

| Item | Where it belongs | Why deferred |
|---|---|---|
| `sales_order_lines` normalized table + `invoice_lines.sales_order_line_id` (the old "5B.5") | Phase 6/7, alongside the Phase 9B projection-flag review | jsonb `line_items` is the runtime authority; `salesOrderLineId` in jsonb fully serves 5B. Normalizing SO lines is a Phase-9B expansion, not a fulfilment need. |
| **Delivery / dispatch notes (Phase 5C)** — split "goods issued" from "invoiced"; `deliveredQty` from real delivery evidence; a "goods delivered not invoiced" clearing account; move the stock-movement/COGS trigger to delivery | Phase 5C | **CP-5C-0 design APPROVED, CP-5C-A schema APPLIED + LIVE-VERIFIED 2026-09-04 — see `docs/DELIVERY_NOTES_DESIGN.md`.** Model: HYBRID (clearing account `1220`, mirrors GRNI), live on `bcaffvpibpitpuqglszn`. **Scenario F RESOLVED: `create_invoice_from_sales_order` (this file's own §13 RPC, below) is upgraded by `0055` (a Phase 5C compatibility amendment, NOT a Phase 5B reopening) to subtract posted-delivery quantity from its own remaining-check — proven via 18 formally-tested scenarios AND a live database smoke test**, see the design doc's "CP-5C-A APPLIED + LIVE-VERIFIED" §. 5C-B (service/accounting) / 5C-C (UI/document) / 5C-D (QA/release) not started. The field is already named `fulfilledQty` not `deliveredQty` so this lands cleanly. |
| Credit-note ↔ `remainingToInvoiceQty` interaction (does a credited quantity become re-invoiceable?) | Phase 5D | needs the credit-note-line → invoice-line → SO-line chain; a business-rule decision, out of 5B scope. |
| Per-line partial cancellation (cancel *some* of one SO line's remainder, keep the rest open) | Phase 5D / 6 | `closed` (whole-order remainder) covers the common case; per-line needs a stored `cancelledQty`. |
| `InvoiceDetailPage` per-line "SO line: ordered N, this invoice M" | Phase 7 polish | the link exists in data (`salesOrderLineId`); the header "Source sales order" already shows the relationship. |
| Product-detail movement ledger → originating **Sales Order** hop | Phase 7 polish | the data path exists (`stock_movements.source_document_line_id` → invoice line → `salesOrderLineId` → SO); surfacing it in the large `InventoryItemDetail` component is a focused follow-up. |
| A request-id idempotency log on `create_invoice_from_sales_order` | Phase 7 hardening | the SO row lock + remaining-cap already give the concurrency guarantee; a lost-response retry is caught by the cap. A stable key would also de-dup a genuine double-submit. |
| Single shared `Supabase{SalesOrder,Invoice}Repository` instance | Phase 7 hardening | multiple stateless instances over the shared client — no correctness impact. |
| Per-warehouse on-hand in the `PartialInvoicePicker` stock hint | Phase 7 polish | advisory only in a draft-creating modal; final availability is checked at post time. |

## 15. STATUS — PHASE 5B: COMPLETE + SHIPPED

Design (§§1–12) + 5B.1 + 5B.2 + 5B.3 + 5B.4 all implemented; migrations `0048` + `0049` **APPLIED**;
the 5B.1 relationship backfill **RUN** (relationship-only, accounting fingerprints unchanged).

**Shipped 2026-09-04 (user instruction):** committed `9db70ce` on
`phase-9b-relationship-design-and-code` → pushed → **merged to `main` `b19dc47`** → pushed to GitHub
→ **Cloudflare Pages production deploy triggered** (`https://vertex-accounting.pages.dev`). Gate
re-run on merged `main` = green (**2348 tests / 310 files**, tsc, eslint, build).
`NORMALIZED_DOCUMENT_LINES_ENABLED` still `false`.

**Human browser QA (2026-09-04):** the user checked the deployed prod directly and **confirmed the
Quote → Sales Order → Invoice flow — "like it very much"**, including the Phase 5B partial-fulfilment
path. **Still outstanding:** the `PartialInvoicePicker` modal itself (desktop/laptop/mobile) and the
"Close remaining" flow specifically — no browser tooling in the build environment for this agent to
verify those directly.

---

### CP-5B.2 — PARTIAL-INVOICE PICKER — IMPLEMENTED (2026-09-04, uncommitted)

**5B.4 / 5B.5 / 5B.6 / 5C / 5D NOT started.**

**Service contract**
```
SalesOrderService.createInvoiceFromSalesOrder(
  salesOrderId: string,
  selections: readonly { salesOrderLineId: ID; quantity: number }[],
): Promise<Invoice>   // a DRAFT invoice
```
The request carries **only** `salesOrderLineId` + `quantity`. Every other field — `productId`,
`warehouseId`, `taxRateId`, `unitPrice`, `description`, line totals, VAT — is DERIVED from the
authoritative Sales Order line inside `buildInvoiceFromSelections` (`salesOrderFulfilment.ts`). The
caller's product / price / description are never read.

**Validation (service-side, `buildInvoiceFromSelections`)** — SO exists & not cancelled; not a
legacy full conversion; not a legacy `fulfilled` with no line evidence; each `salesOrderLineId`
belongs to the order; no duplicate line in the request; each quantity finite, `> 0`, ≤ 3 dp
(`numeric(14,3)` — over-precision rejected, never rounded); each quantity ≤ that line's **current**
`remainingToInvoiceQty`, re-derived from the freshly-fetched invoice list. `convertToInvoice`
delegates to `createInvoiceFromSalesOrder` with `fullRemainingSelections(...)`.

**Quantity model — the four numbers (per SO line)**
```
orderedQty            = SO line quantity (stored)
postedFulfilledQty    = Σ POSTED (status ∉ {draft, void}) linked invoice-line qty   → drives fulfilment + commitment
draftInvoicedQty      = Σ DRAFT linked invoice-line qty                             → drives NOTHING accounting; picker only
remainingToFulfilQty  = max(0, orderedQty − postedFulfilledQty)                     → the physical shortfall = the stock commitment (5B.3)
remainingToInvoiceQty = max(0, orderedQty − postedFulfilledQty − draftInvoicedQty)  → "available to add to a NEW draft" = the picker cap
```
`remainingToInvoiceQty` already excludes quantities sitting in an existing DRAFT, so two drafts can
never be built that together exceed the ordered quantity (a later double-post would otherwise
over-invoice the SO). No separate `availableToAddToNewDraft` field — that IS `remainingToInvoiceQty`.

**Stale-data / concurrency** — the service re-fetches every invoice and re-derives every line's
`remainingToInvoiceQty` immediately before building the invoice, so a stale browser selection
(another user invoiced part of the same line in the meantime) is **rejected** with
`"only N remain to invoice"`. This is NOT a row-locked atomic check — a genuinely concurrent
create-create race has a small window. Documented in `docs/KNOWN_ISSUES.md`; the proper fix is a
`create_invoice_from_sales_order` Postgres RPC (same pattern as `apply_customer_deposit`), a 5B.4 /
7F item. Client-side validation is convenience only and never clamps silently.

**Draft-vs-posted / stored status** — a DRAFT invoice never flips `sales_orders.status`. The stored
`confirmed → fulfilled` flip now happens **only when every line is fully POSTED-invoiced**
(`isFullyPostedInvoiced`), wired via a new best-effort `onInvoicePosted` callback on `InvoiceService`
(composition root `src/services/index.ts` → `syncSalesOrderStatusAfterPost`, a read-only
`SupabaseSalesOrderRepository`). Consequence: deleting or editing a draft can no longer strand the
SO at a stale `fulfilled`. Fulfilment / invoicing **badges** stay fully derived
(`computeSalesOrderFulfilment`), independent of the stored status.

**Totals / VAT** — `quantity × SO-line unitPrice → lineTotal → lineTotal × effectiveRate → taxAmount`,
where `effectiveRate = SOline.taxAmount / SOline.lineTotal` (the rate the order was quoted at —
matches `convertToInvoice`; user edits the draft if VAT changed). Billing the **whole** line
preserves the SO line's exact `lineTotal` / `taxAmount` (no ratio drift). Rounding tested with
fractional-cent inputs. No second VAT implementation — `round2` from `salesOrderFulfilment.ts`.

**UI — `PartialInvoicePicker`** (`src/features/sales/components/PartialInvoicePicker.tsx`) — a large
modal (`sm:max-w-5xl lg:max-w-6xl`, self-scrolling body, sticky header + footer, no page-level
horizontal scroll — the line table scrolls inside its own `overflow-x-auto` container). Header:
SO number · customer · order total · previously invoiced · remaining value. Line table: Include
checkbox · Product / description (+ SKU + On hand / Committed / Available for product lines) ·
Warehouse (multi-warehouse only) · Ordered · Invoiced · In draft · Remaining · **Invoice now**
(number input, defaults to remaining, per-line inline validation) · Unit price · VAT · Line total.
Actions: "Invoice all remaining", "Clear all", "Cancel", "Create draft invoice" (disabled until ≥ 1
valid selection). Fully-invoiced lines show "Fully invoiced" and are un-selectable. A draft
disclaimer is always visible. On success the modal closes and `SalesOrderDetailPage` shows an inline
success banner with the new invoice number + **View invoice** (in-page `RelatedRecordPreview`
overlay) and **Open full invoice** (navigate) — the invoice is **never auto-posted**.
`StatusBadge` unchanged from 5B.1. Primary SO action: "Create invoice" / "Invoice remaining".

**Accounting-event matrix (unchanged from 5B.1 — restated for the partial path)**

| Event | On hand | Committed | Stock movements | Inventory / COGS | Revenue / VAT / AR | Cash |
|---|---|---|---|---|---|---|
| Draft partial invoice created | — | — | — | — | — | — |
| Draft partial invoice POSTED | − that invoice's qty | − that invoice's qty | one `sale` per line (that qty, @ WAC) | for that qty only | for that invoice's subtotal / VAT / total | — |
| 2nd / final partial invoice POSTED | − its qty | − its qty | its rows | its cost | its revenue/VAT/AR | — |
| Partial customer payment | — | — | — | — | — | DR Cash / CR AR |

Each posted invoice is its own atomic entry, `postingKey = invoice:<id>:post` — N partial invoices =
N distinct keys, N distinct sets of fresh line ids. No double COGS / revenue / VAT / AR / movement.

**Schema / DB:** migrations authored NONE · applied NONE · columns NONE · DB writes NONE · backfill
NOT run · `NORMALIZED_DOCUMENT_LINES_ENABLED` `false` · runtime authority jsonb.

**Gate:** tsc ✅ · eslint `--max-warnings 0` ✅ · **2312 tests / 308 files** ✅ (from 2261 / 307 —
**+51 tests / +1 file** `PartialInvoicePicker.test.tsx`, 0 skipped, 0 failures) · `vite build` ✅.
Independent QA (`general-purpose` subagent) reviewed all 18 checklist points; verdict **APPROVE WITH
NITS**, one fix applied (added 3 tests for the new `onInvoicePosted` callback in
`invoiceService.test.ts`).

**Deferred (5B.4+):** `closed` commercial status + "Close remaining"; the guarded 5B.1 backfill run;
`sales_order_lines` normalized projection; a `create_invoice_from_sales_order` atomic RPC (concurrency
hardening); `InvoiceDetailPage` per-line "SO line: ordered N, this invoice M"; Product-detail → SO
hop in the movement ledger; a shared repository instead of the double `Supabase*Repository`.

### CP-5B.1 + CP-5B.3 — IMPLEMENTED (2026-09-04) — *historical checkpoint record; superseded by "5B FINAL" above*

**Increments 5B.1 (line-level SO↔invoice relationship + derived quantities) and 5B.3 (remaining
stock commitment) — code-complete.** (5B.2 and 5B.4 landed after this; Phase 5B is now COMPLETE.)

| Area | What shipped |
|---|---|
| Type | `DocumentLineItem.salesOrderLineId?: ID` (`src/types/common.ts`) — invoice lines only, jsonb-authoritative, **no migration**. |
| Derived selectors | `src/features/sales/utils/salesOrderFulfilment.ts` — `computeSalesOrderFulfilment(order, invoices)` → per-line `orderedQty / postedFulfilledQty / draftInvoicedQty / remainingToFulfilQty / remainingToInvoiceQty` + order-level `fulfilmentStatus` / `invoicingStatus` (both **derived**, never stored), `hasLineLevelEvidence` / `legacyLinkedInvoiceIds` for legacy tolerance. Plus `invoiceableSalesOrderLines`, `isFullyInvoiced`, `sumInvoicedBySalesOrderLine`, `isPostedInvoiceStatus`. `fulfilledQty` naming — NOT `deliveredQty` (no independent delivery evidence yet; 5C boundary). |
| `convertToInvoice` | Now bills only the **remaining-to-invoice** quantity, stamps `salesOrderLineId` + a fresh `id` on every created invoice line, and supports being called **repeatedly** (multiple invoices per SO). The old 1:1 `invoice.salesOrderId` guard is gone; a legacy (pre-5B.1) full conversion is still detected and blocked. (5B.2: delegates to `createInvoiceFromSalesOrder(fullRemainingSelections(...))`; the stored-status flip moved to POST time — see §"Draft-vs-posted".) Engine (`postInvoice`) **untouched**. |
| Commitment (5B.3) | `StockCommitmentService` gains a read-only `IInvoiceRepository`; `getCommitmentMap()` nets each confirmed SO line to `max(0, orderedQty − Σ posted invoice-line qty linked via salesOrderLineId)`. **DRAFT and VOID invoices release nothing.** With no linked posted invoice this is byte-identical to the Phase 5A rule. `ownCommitmentMap` takes the same `fulfilledByLine` map so the `SalesOrderForm` self-exclusion stays consistent. No `stock_movement`, no schema change, no Supabase write. |
| UI | `SalesOrderDetailPage`: per-line **Ordered / Invoiced / Remaining** columns, **Invoicing** + **Fulfilment** derived badges, a **Quantity** summary ("4 of 10 invoiced · 6 remaining"), a **Related invoices** table (all non-void linked invoices — number, date, status, total, outstanding), each opening the existing `InvoiceDetailPage` in a `RelatedRecordPreview` overlay (page stays mounted underneath). Primary action reads "Invoice remaining" when partly invoiced, hidden when fully invoiced. `StatusBadge` learns `not_invoiced` / `partially_invoiced` / `fully_invoiced` / `not_fulfilled` / `partially_fulfilled`. |
| Phase 5A cosmetic fixes | `SalesLineItemsEditor` now takes `onHandFor(productId, warehouseId?)` so on-hand and committed are at the **same warehouse scope** when a line targets a warehouse (`SalesOrderForm` wires it from `useStockBalances`). Shortage caption splits "committed to other confirmed orders" from "to other lines on this order". |
| Backfill | `docs/db-changes/5b1_backfill_sales_order_line_links.sql` — **authored, NOT executed.** Deterministic, idempotent, company-scoped, matches on `(product_id, quantity, unit_price)` + position, refuses to guess, pre/post NOTICEs. Targets the 3 known September pairs (9 lines). |

**Schema / DB:** migrations authored NONE · migrations applied NONE · columns changed NONE ·
backfills run NONE · `NORMALIZED_DOCUMENT_LINES_ENABLED` unchanged (`false`).

**Gate:** tsc ✅ · eslint `--max-warnings 0` ✅ · **2261 tests / 307 files** ✅ (from 2231 / 306 at
Phase 5A — **+30 tests / +1 file**, 0 skipped, 0 failures) · `vite build` ✅. Independent QA
(`general-purpose` subagent) reviewed all 17 checklist points and applied one display-only fix
(order-level `remainingToFulfilQty` now sums per-line clamped values — `salesOrderFulfilment.ts`);
verdict **APPROVE WITH NITS**.

**Deferred (still 5B.2+):** the per-line quantity picker + `createInvoiceFromSalesOrder(soId, lines[])`;
document-level `closed` status (`ALTER TYPE`); `sales_order_lines` normalized projection table (M5/M6);
`InvoiceDetailPage` per-line "SO line: ordered N, this invoice M"; Product-detail → Sales Order hop
in the movement ledger (data path exists via `salesOrderLineId`; surfacing it in `InventoryItemDetail`
is a focused follow-up).

### CP-5B-0 — DESIGN (2026-09-04)

Design authored and approved as the starting point for the above. See §§1–12.
