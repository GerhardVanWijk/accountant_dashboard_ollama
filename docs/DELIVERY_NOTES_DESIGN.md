# DELIVERY NOTES / DISPATCH — CP-5C-0 DESIGN AUDIT

**Phase 5C** · authored 2026-09-04 · branch `phase-9b-relationship-design-and-code` ·
**CP-5C-0: DESIGN COMPLETE, APPROVED 2026-09-04.**
**CP-5C-A: SCHEMA + DB SAFETY APPLIED + LIVE-VERIFIED 2026-09-04 — migrations `0050`-`0055` are
now live on project `bcaffvpibpitpuqglszn`. See the "CP-5C-A FINAL" section for the exact DDL/RPC
delivered, the N:M resolution adopted, and the live rollback-wrapped smoke-test evidence.**

Phase 5A (stock commitment) and Phase 5B (partial Sales Order fulfilment + invoicing) are
**COMPLETE and shipped to `main`** (`b19dc47`). This document does not reopen either. Everything
below is additive on top of the Phase 5B model in `docs/SALES_FULFILMENT.md`.

**Objective of this checkpoint**: prove the correct accounting relationship between
`ORDER → COMMITMENT → PHYSICAL DELIVERY → INVENTORY COST → COGS/CLEARING → INVOICE → REVENUE → VAT
→ AR → PAYMENT` before the inventory posting engine is touched. Not to design a delivery-note
screen.

---

## PART 1 — Repository audit (current engine, verified in code 2026-09-04)

| Concern | Current implementation | File |
|---|---|---|
| Sales Order | `pending\|confirmed\|fulfilled\|closed\|cancelled`. Confirmed = commits stock (derived). No GL ever. | `src/types/salesOrder.ts`, `salesOrderService.ts` |
| Invoice | `draft\|sent\|partially_paid\|paid\|overdue\|void`. `postInvoice()` = the ONE atomic accounting event. | `src/services/invoiceService.ts` |
| Invoice line ↔ SO line | `DocumentLineItem.salesOrderLineId?` (jsonb, authoritative, Phase 5B.1). | `src/types/common.ts` |
| Multiple invoices per SO | Yes (5B.2/5B.4) via `createInvoiceFromSalesOrder` → atomic RPC `create_invoice_from_sales_order` (migration 0049, live). | `salesOrderDraftInvoiceWriter.ts`, migration `0049` |
| Stock commitment | Derived: confirmed-SO-line `orderedQty − Σ posted invoice-line qty` (5B.3). `stock_balances.quantity_committed` stays 0 in storage. | `stockCommitmentService.ts` |
| Close Remaining | `closeRemaining()` — `confirmed` + posted progress + remainder → `closed`. Zero accounting effect. Migration `0048`, live. | `salesOrderService.ts` |
| Credit Notes | `issueCreditNote()` reverses revenue/VAT/AR always; reverses COGS/Inventory **only when `reason === 'return'`**, at product's **CURRENT** WAC (not historical) — an existing, accepted simplification. Stock restored only after the entry posts. | `creditNoteService.ts` |
| Customer Receipts / Deposits | `recordReceipt()` splits `DR Cash / CR AR (applied) / CR 2600 Customer Deposits (unapplied)`. `allocateToInvoice` is the atomic `apply_customer_deposit` RPC (0046). **Never touches stock.** | `customerReceiptService.ts` |
| Inventory posting engine | ONE atomic RPC `post_inventory_transaction` (migration `0031`). Takes `costingMode` (`receipt\|opening\|issue\|return_in\|transfer_out\|transfer_in`) per line + caller-supplied `inventoryAccountId`/`contraAccountId`/`movementType`. **Branches only on `costing_mode`, never on `movement_type`** — `movement_type` is a pure label cast into the `stock_movement_type` enum for the `stock_movements.type` column (verified: migration `0031` line ~159, `v_mv_type := (v_line->>'movement_type')::public.stock_movement_type`). | `inventoryPostingEngine.ts/.real.ts`, migration `0031` |
| `unitCostOverride` | Already exists on `InventoryTransactionLine` — "value this movement at THIS cost instead of current WAC… a stock take's snapshot, an adjustment's entered cost." **Precedent for freezing historical cost.** | `inventoryPostingEngine.ts` |
| Stock movement evidence | Append-only. `unitCost`/`totalCost`/`movementDate`/`sourceDocumentType`/`sourceDocumentId`/`sourceDocumentLineId` frozen at posting time (migration 0022+). | `src/types/stockMovement.ts` |
| GRNI precedent (purchase side) | `recordReceipt()`: tracked PO line → `DR Inventory / CR GRNI` at PO unit price, stock moves, WAC blends, `journalEntryId` stamped on the PO. `postBill()`: if `linkedPO.journalEntryId` set (`grniAlreadyRecognized`) → **NO new engine line** — just `DR GRNI / CR AP` in `extraJournal` at the **PO's own line value** (not re-derived); else a fresh `receipt` line. **This is the exact structural precedent Phase 5C mirrors on the sales side.** | `purchaseOrderService.ts` L173-224, `billService.ts` L227-326 |
| VAT | Recognised **only** at `postInvoice()` (`VAT_OUTPUT`, code `2100`) and reversed at `issueCreditNote()`. Never at Quote, SO, receipt, or deposit. | `invoiceService.ts`, `creditNoteService.ts` |
| Account mapping | `AccountMappingKey` (`accountMappingService.ts`) — fixed code convention, resolved by key, never hardcoded ids. `GRNI` → `2050`, `INVENTORY` → `1200`, `INVENTORY_IN_TRANSIT` → `1210`. | `accountMappingService.ts` |
| Normalized lines | `invoice_lines`/`bill_lines`/`purchase_order_lines`/`credit_note_lines` exist (migrations 0038-0041, applied). **No `sales_order_lines` table.** `NORMALIZED_DOCUMENT_LINES_ENABLED = false` — jsonb is runtime authority. | `docs/PHASE_9B_DESIGN.md` |
| Permissions | `(feature, action)` catalog + `usePermission()` hook exist (`inventory:adjust` etc. seeded in migration `0030`) but **`usePermission()` is not called anywhere in Sales/Purchases/Inventory feature UI today** — it is scaffolding, not wired. RLS stays coarse company-tenant everywhere. | `usePermission.ts`, migration `0030` |
| Print/export | Two separate systems: (1) `src/features/export/` `ExportMenu`/`PrintableReport` — CSV/XLSX + browser-print for **list pages**. (2) `src/features/businessDocuments/` — branded A4 `BusinessDocument` + adapters + `useBusinessDocument` + `BusinessDocumentPreviewModal` — for **document print/PDF** (Quote/SO/Invoice/CreditNote/PO today). A Delivery Note document reuses (2). | `docs/BUSINESS_DOCUMENTS.md` |
| Product-detail traceability | `InventoryItemDetail`'s `MovementLedger` already resolves a movement's source document to a human number + opens `RelatedRecordPreview` (modal-over-page) instead of navigating away. | `InventoryItemDetail.tsx` |
| Audit trail | `AuditLogService.log({userId, action, module, recordType, recordId, reason, previousValue?, newValue?})` — `action` and every other column are **free text** in Supabase (`text`, not enum/FK) specifically so new event names never need a migration. | `auditLogService.ts` |

### Traced path (today, unchanged by this document)

```
SalesOrder (confirmed)               — commits stock (derived), NO GL
  → Invoice (draft, via 5B.2 picker or convertToInvoice)   — NO GL, NO stock
    → Invoice.postInvoice()          — ONE atomic RPC call:
        stock_movements  (type='sale', qty<0, @ current WAC, frozen on the row)
        DR COGS / CR Inventory        (engine-computed from WAC)
        DR AR / CR Revenue / CR VAT Output   (caller-built extraJournal)
      → journal_entries + journal_lines (ONE balanced entry)
      → inventory_transaction_log(source_type='invoice', source_id) → journal_entry_id
```

**The gap Phase 5C addresses**: the *only* physical-fulfilment signal in the system today is
`postInvoice()`. There is no way to say "4 of these 10 left the warehouse on 29 September" if the
invoice for them isn't raised until 3 October — and no way to show `deliveredQty` distinct from
`invoicedQty` anywhere (`SalesOrderDetailPage`'s "Remaining to fulfil" is currently a synonym for
"remaining to invoice").

---

## PART 2 — Delivery Note domain

### `DeliveryNote` (header)

| Field | REQUIRED NOW | Reason |
|---|---|---|
| `id` | ✅ | |
| `companyId` | ✅ | tenant isolation, same as every other document |
| `deliveryNoteNumber` | ✅ | human document number (`DN-2026-0001`), same generator pattern as every other document |
| `salesOrderId` | ✅ | the SO this delivery fulfils — a DN always originates from a confirmed SO (no standalone DN) |
| `customerId` | ✅ | denormalized from the SO, matches every other document's pattern (Invoice carries its own `customerId` too, not just via SO) |
| `warehouseId` | ✅ | **one warehouse per DN** (a dispatch is physically from one location); multi-warehouse orders need multiple DNs — matches how `DocumentLineItem.warehouseId` already works per-line, but a DN is itself a physical dispatch event so header-level is correct |
| `deliveryDate` | ✅ | the business date the movement posts against (mirrors `issueDate` on every other document) |
| `status` | ✅ | see Part 3 |
| `lineItems` | ✅ | jsonb, same authority pattern as every other document (Phase 9B) |
| `notes` | ✅ | free text, same as every document |
| `createdAt`/`updatedAt` | ✅ | `BaseEntity` |
| `journalEntryId` | ✅ | set once the delivery posts (mirrors `PurchaseOrder.journalEntryId` for `recordReceipt`) — **also the idempotency/double-post guard**, same role it plays on the PO |
| `dispatchDate` (separate from `deliveryDate`) | OPTIONAL LATER | only meaningful if "dispatched" and "delivered" become separate GL events — Part 3 recommends they are **not** |
| `deliveryAddress` | OPTIONAL LATER | cosmetic on the printed document; `Customer.billingAddress`/shipping fields already partially cover this — a dedicated ship-to field is a Phase 4B-style document-polish item, not an accounting need |
| `customerReference` (customer PO number) | OPTIONAL LATER | printable-document field, no accounting role |
| `createdBy` | OPTIONAL LATER | every other document in this codebase uses the audit log for actor tracking, not a header column (`SYSTEM_USER_ID` pattern) — no reason to diverge |
| `cancelledAt` | DERIVED — DO NOT STORE | `status === 'cancelled'` + the audit log already gives the timestamp |

### `DeliveryNoteLine`

| Field | REQUIRED NOW | Reason |
|---|---|---|
| `id` | ✅ | fresh id, never the SO line id — same rule 5B.1/5B.2 established for invoice lines |
| `salesOrderLineId` | ✅ | the authoritative link — **exact same pattern as `DocumentLineItem.salesOrderLineId`**, so all the Phase 5B derivation machinery generalizes instead of forking |
| `productId` | ✅ | from the SO line (a service/non-inventory SO line is never delivered — see Part 8) |
| `warehouseId` | OPTIONAL LATER — derive from the DN header | a DN is one warehouse; per-line warehouse would only matter for a multi-warehouse single dispatch, which isn't how a physical delivery works |
| `quantity` | ✅ | the quantity being dispatched now |
| `description`/`unitPrice`/`taxRateId`/`taxAmount`/`lineTotal` | REQUIRED NOW, copied from the SO line | needed to print a coherent document and to compute the frozen clearing-account value at delivery (Part 5/7) — **selling price is suppressed on the printed document by default**, see Part 18; storing it does not mean showing it |
| `unitCostSnapshot` | DERIVED — DO NOT STORE on the line itself; **DO** freeze it on the resulting `stock_movements` row | `stock_movements.unit_cost`/`total_cost` is already the established, tested, immutable evidence mechanism (Phase 2, migration 0022) — duplicating it onto `DeliveryNoteLine` would be exactly the "mutable duplicate total" Phase 5B's design explicitly avoided. The DN line is the *instruction*; the movement is the *evidence*. |
| `createdAt` | ✅ | |

**Not proposed**: `deliveryNoteLine.invoiceLineId`. The relationship is the other way — an **invoice
line** will carry `deliveryNoteLineId?` (mirroring `salesOrderLineId?`), because one invoice line
can be built from *several* delivery notes' worth of a SO line (many-to-many, Part 9), so the FK
belongs on the "many" side that's created later and references the earlier evidence — same
direction Phase 9B already chose for `CreditNoteLineItem.originalInvoiceLineId`.

---

## PART 3 — Status model

**Recommendation: `draft → posted → cancelled`. No separate `dispatched`/`delivered` split.**

Rationale — this is the load-bearing decision the rest of the document depends on, so it is proven,
not assumed:

- The only question the accounting engine needs answered is **"has this quantity physically left
  the warehouse, yes or no"** — a binary, not a 3-state courier-tracking workflow. `recordReceipt()`
  (the exact mirror on the purchase side) has no "in transit" state either — `sent → received`, one
  posting event.
- "Courier collected" vs "customer signed" is **operational/logistics** tracking, not an accounting
  event — SA GAAP/IFRS recognise the transfer of risk/control at dispatch from the seller's
  premises for most goods sales (Incoterms-dependent, but Vertex has no Incoterms model and this is
  a straightforward furniture/office-supplies wholesaler per the Office National fixture) — the
  business already has this right in spirit: today's `postInvoice()` treats "invoiced" as
  "delivered" with no courier-signature step either.
- **`draft`**: being built, freely editable, no GL/stock effect. Mirrors every other document's
  `draft`.
- **`posted`**: `deliveryNoteService.postDelivery()` runs — ONE atomic engine call (mirrors
  `recordReceipt()`), stock moves, `journalEntryId` stamped, **immutable from here** (same
  immutability rule as a posted Invoice/Bill/JE — SA_ACCOUNTING_MASTER_SPEC §14/§36/§72/§79).
  Renders as "Delivered" in the UI (the label the user sees; `posted` is the technical/DB state,
  matching how `Invoice.status = 'sent'` is displayed as "Sent"/posted, not literally "sent").
- **`cancelled`**: only from `draft` (delete-equivalent, mirrors every other document's delete-only-
  from-draft rule). A **posted** DN can never be silently cancelled — goods have physically moved;
  correcting it needs a **Return Note** (Part 15, deferred to 5D) or a manual compensating
  adjustment, exactly like a posted Invoice needs a Credit Note, never a delete/void.
- Can a `draft` DN be edited? Yes, freely (same as any draft document).
- Can a `posted` DN be edited? **No** — same rule as a posted Invoice (`updateInvoice`'s
  `ACCOUNTING_RELEVANT_FIELDS` guard). Only non-accounting fields (`notes`) if any.
- Partial delivery of "only some of the DN"? Doesn't arise — a DN's own line quantities ARE the
  partial amount; if less than planned actually leaves, the DN is edited **before** posting (still
  `draft`) to reflect reality, then posted for the true quantity. There is no "partially posted DN."
- Goods returned after a DN posts → Part 15 (Return Note, deferred).

---

## PART 4 — Two candidate models (as posed)

**MODEL A — delivery posts COGS directly**
```
AT DELIVERY:  DR COGS / CR Inventory                              (@ current WAC)
AT INVOICE:   DR AR / CR Revenue / CR VAT Output                  (no inventory leg at all)
```

**MODEL B — delivery is evidence only**
```
AT DELIVERY:  (nothing — quantities recorded, no GL, no stock_movement)
AT INVOICE:   DR COGS / CR Inventory  +  DR AR / CR Revenue / CR VAT Output   (unchanged from today)
```

Neither is adopted as-is — see Part 5.

---

## PART 5 — Investigating Model A properly (the period-matching problem)

**Model A as literally stated is wrong**, and it is provably wrong, not just "less correct":

> Delivered 29 September, invoiced 3 October. Model A posts `DR COGS / CR Inventory` on 29
> September. COGS is an **expense** — it hits the September Income Statement. Revenue for the same
> sale posts on 3 October — it hits the **October** Income Statement. September now shows an
> expense with no matching revenue (understates September profit); October shows revenue with no
> matching cost (overstates October profit / gross margin). This is a direct violation of the
> matching principle and would misstate gross profit in **both** periods, every month, for every
> order that straddles a period boundary — which, for a business invoicing days or weeks after
> dispatch, is not an edge case, it is the normal case.

**Model B avoids the P&L problem but doesn't solve the problem 5C exists to solve**: the balance
sheet still shows the full 10 printers as "on hand" in Inventory (1200) on 29 September even though
4 physically left the building — `GL 1200 ↔ inventory valuation` would still reconcile (nothing
moved), but a warehouse stock count on 30 September would show 6, not 10, and nothing in the ledger
explains the difference. Model B also gives up the "prove goods left" signal entirely — it's pure
UI/paperwork, the exact "Delivery Note is a rubber stamp" outcome the brief is explicit about
avoiding.

### The correct third option (already hinted at in the brief, now proven)

```
AT DELIVERY:  DR Goods Delivered Not Invoiced (clearing ASSET)  /  CR Inventory     — @ current WAC, frozen on the movement row
              (an asset-to-asset reclassification — NOT a P&L event, no COGS, no Revenue, no VAT, no AR)

AT INVOICE:   DR COGS / CR Goods Delivered Not Invoiced          — @ the FROZEN delivery cost (Part 7)
              DR AR   / CR Revenue / CR VAT Output                — unchanged, exactly today's postInvoice()
              (both legs post together, atomically, in the SAME journal entry — matching is restored)
```

This is **exactly** the purchase side's GRNI pattern, mirrored:

| | Purchase side (exists, proven) | Sales side (proposed) |
|---|---|---|
| Goods move | `recordReceipt()`: `DR Inventory / CR GRNI` | `postDelivery()`: `DR Goods Delivered Not Invoiced / CR Inventory` |
| Clearing account nature | Liability (we owe for what arrived) | Asset (cost of what left, not yet expensed) |
| Later document clears it | `postBill()`: `DR GRNI / CR AP` (no re-receive) | `postInvoice()`: `DR COGS / CR Goods Delivered Not Invoiced` (no re-issue) |
| Guard against double-posting | `linkedPO.journalEntryId` set → skip the engine line | `linkedDeliveryLine` present → skip the engine line |
| VAT | never at receipt, only at bill | never at delivery, only at invoice (Part 6) |

**This is the HYBRID recommended in Part 28.** "Model A" is only correct with the clearing account;
"Model B" is only correct if the business doesn't need physical-delivery evidence in the GL at all
(it does — that's this phase's stated purpose). Comparing the four options the brief asks for:

| Option | P&L matching | Balance sheet accuracy | Verdict |
|---|---|---|---|
| 1. Direct COGS at delivery (literal Model A) | **Broken** — proven above | Correct (Inventory reduces when goods leave) | Rejected |
| 2. Clearing account at delivery, COGS at invoice (**HYBRID**) | **Preserved** — COGS and Revenue always post together | Correct — Inventory reduces at delivery, clearing account tells the true story in between | **Recommended** |
| 3. COGS stays at invoice, no delivery GL effect (literal Model B) | Preserved | Wrong while goods are in transit — books don't reflect reality | Rejected (defeats the phase's purpose) |
| 4. Evidence-only, no GL, no stock movement at all | Preserved | Wrong, and no `stock_movements` trail either — worse than 3 | Rejected |

---

## PART 6 — VAT timing (South African, SA_ACCOUNTING_MASTER_SPEC-consistent)

**A Delivery Note must NEVER trigger Output VAT.** Verified against Vertex's existing model:

| Event | VAT today | VAT under HYBRID |
|---|---|---|
| Quote | none | unchanged — none |
| Sales Order confirmed | none | unchanged — none |
| **Delivery Note posted** | *(doesn't exist yet)* | **NONE.** The delivery entry is `DR clearing / CR Inventory` — no VAT account is touched, no `VAT_OUTPUT` line, full stop. |
| Invoice posted | `CR VAT Output` for `invoice.taxTotal` | **unchanged** — VAT is still recognised exactly once, at `postInvoice()`, on exactly the invoiced value |
| Customer payment | none | unchanged |
| Customer deposit | none (posts to `2600`, a liability, not VAT) | unchanged |

This matches SA VAT law: the time of supply for goods is generally the earlier of invoice date or
payment date (or, for instalment/rental, delivery) — Vertex's existing model already ties VAT to
invoicing, and a Delivery Note is explicitly **not** an invoice and must not be allowed to become
one by accident. No VAT behaviour changes in this phase; this section is documentation-only, per
the brief.

---

## PART 7 — WAC / historical cost immutability

**The authoritative cost evidence is `stock_movements.unit_cost`/`total_cost`, frozen at the moment
of the movement — never recomputed from "current" WAC afterward.** This is not a new mechanism;
it's the exact contract `stock_movements` has enforced since migration 0022, and the engine's
existing `unitCostOverride` param already proves the codebase freezes cost deliberately elsewhere
(stock takes, adjustments).

Worked example (the brief's own numbers):
```
SO confirmed: 10 units, product WAC = R3,000
DN-1001 posts 4 units  → engine costingMode='issue' → current WAC R3,000 blended (issue never changes WAC)
                        → stock_movements row: quantityDelta=-4, unitCost=3000, totalCost=12000, type='delivery'
                        → DR "Goods Delivered Not Invoiced" R12,000 / CR Inventory R12,000

[supplier receipt happens — WAC moves to R3,100 — the PRODUCT's current WAC is now 3,100]

Invoice posts tomorrow for those same 4 units:
  postInvoice() finds this invoice line traces to a DELIVERED SO-line quantity (via salesOrderLineId
  → deliveryNoteLineId → its stock_movements row's totalCost = R12,000, NOT 4 × current-WAC-3,100 = R12,400).
  → DR COGS R12,000 / CR "Goods Delivered Not Invoiced" R12,000    (clears EXACTLY what delivery moved)
  → DR AR / CR Revenue / CR VAT Output                              (unchanged, at the invoice's own price)
```
The 4 already-delivered units **never** touch the R3,100 WAC — exactly the same discipline
`billService.postBill()`'s `grniAlreadyRecognized` branch already applies (it clears GRNI at the
bill's own line value, never re-derives from a "current" cost). `DeliveryNoteLine` does **not**
need its own `unitCostSnapshot` column (Part 2) — `stock_movements` already is that column, and is
already tested, immutable, and queried by `sourceDocumentLineId`.

**If an invoice line was never delivered** (Part 13, invoice-before-delivery path): today's
behaviour is exactly preserved — `postInvoice()` issues stock itself at **current** WAC, exactly as
it does today. Nothing changes for that path.

---

## PART 8 — Quantity model (formulas)

Extending — never replacing — Phase 5B's derived-quantity philosophy
(`docs/SALES_FULFILMENT.md` §13). **Nothing here is a stored counter.**

```
orderedQty              = SO line .quantity                                              [STORED]

deliveredQty            = Σ  DeliveryNoteLine.quantity
                             where salesOrderLineId == line.id
                               AND deliveryNote.status == 'posted'                        [DERIVED]

directlyInvoicedQty     = Σ  q(il)  where il.salesOrderLineId == line.id
                             AND il.invoice.status ∉ {draft, void}
                             AND il.deliveryNoteLineId IS NULL                            [DERIVED]
                          (posted invoice quantity that bypassed a delivery note —
                           the "invoice before delivery" path, Part 13)

physicallyIssuedQty     = deliveredQty + directlyInvoicedQty                              [DERIVED]
                          (quantity that has left the warehouse by EITHER route — never
                           double-counted: once delivered, an invoice line built against it
                           carries deliveryNoteLineId, so it is NOT also directly-invoiced)

remainingToDeliver      = max(0, orderedQty − deliveredQty − directlyInvoicedQty)         [DERIVED]
                          (what still needs a Delivery Note OR a direct-issue invoice)

postedFulfilledQty      = Σ q(il) where il.salesOrderLineId == line.id
                             AND il.invoice.status ∉ {draft, void}                        [DERIVED — UNCHANGED from 5B]
draftInvoicedQty        = same, draft only                                                [DERIVED — UNCHANGED from 5B]
remainingToInvoiceQty   = max(0, orderedQty − postedFulfilledQty − draftInvoicedQty)       [DERIVED — UNCHANGED from 5B]

commitmentQty           = max(0, orderedQty − physicallyIssuedQty)   while status=='confirmed'   [DERIVED — REPLACES 5B.3's formula]
                          = max(0, orderedQty − deliveredQty − directlyInvoicedQty)
```

**Proof of the commitment formula** (the brief's own worked example — ordered 10, delivered 7,
invoiced 4): committed = **10 − 7 = 3**, *not* `10 − 4 = 6`. Once 7 units physically left the
warehouse (via DN), they are gone regardless of whether all 7 have been billed yet — a second
customer's confirmed order for the same product must NOT be told 6 are still available; only the 3
still sitting in the warehouse (`remainingToDeliver`) are real inventory to reserve against. This is
the entire point of separating delivery from invoicing.

**Backward compatibility proof**: with `deliveredQty ≡ 0` for every SO line (no delivery notes ever
used — true for every SO created before this phase, and true for any company that never adopts
delivery notes), `directlyInvoicedQty ≡ postedFulfilledQty` (every invoice line bypasses delivery by
definition) and `physicallyIssuedQty ≡ postedFulfilledQty` — so `commitmentQty` reduces **exactly**
to Phase 5B.3's `max(0, orderedQty − postedFulfilledQty)`. **Zero behaviour change for any SO/invoice
that predates or never adopts Delivery Notes.** This is proven, not assumed — it is why the formula
is `deliveredQty + directlyInvoicedQty`, not simply `deliveredQty`.

**Other quantities**:
- `availableQty` (product/warehouse level, unchanged) = `onHand − Σ commitmentQty (this formula) + onOrder`.
- `returnedQty` — out of scope for 5C (Part 15); when built (5D), derived from Return-Note lines
  the same way `deliveredQty` is derived from DN lines.
- `cancelledRemainingQty` — already exists conceptually as `remainingToFulfilQty` at the moment
  `closeRemaining()` runs (Phase 5B.4); a DN-aware `closeRemaining()` would abandon
  `remainingToDeliver`, not `remainingToInvoiceQty` — see Part 13/29.

---

## PART 9 — Relationship model

```
Quote ──quoteId?──▶ SalesOrder ──┬─ salesOrderId ──▶ DeliveryNote (N per SO)
                                 │                      └─ DeliveryNoteLine ──salesOrderLineId──▶ SalesOrderLine
                                 │                              ▲
                                 │                              │ deliveryNoteLineId? (NEW, optional — set when this
                                 │                              │   invoice line was built FROM delivered evidence)
                                 └─ salesOrderId ──▶ Invoice (N per SO, unchanged 5B)
                                                        └─ InvoiceLine ──salesOrderLineId──▶ SalesOrderLine
                                                              │
                                                              ├─ (delivered path)  no NEW stock_movement — clears the
                                                              │                    clearing account at the linked DN
                                                              │                    line's stock_movements.total_cost
                                                              └─ (direct path)     stock_movements.source_document_line_id
                                                                                   = invoice line id  (UNCHANGED, today's behaviour)

DeliveryNoteLine.id ──source_document_line_id──▶ stock_movements  (type='delivery', @ WAC frozen at delivery)
                                                        └─ inventory_transaction_log(source_type='delivery_note', source_id) → journal_entry_id
InvoiceLine (direct path) ──source_document_line_id──▶ stock_movements (type='sale', unchanged)
Invoice.journalEntryId / DeliveryNote.journalEntryId ──▶ journal_entries / journal_lines
Invoice ──▶ CustomerReceipt (unchanged, 4A) ──▶ payment, independent of all of the above (Part 16)
```

**Cardinalities** (all many-to-many where the business process is many-to-many — never forced 1:1):
- `SalesOrder ↔ DeliveryNote`: **1:N**. One SO, many partial DNs (`DN-1001` 4 units, `DN-1002` 3
  units).
- `SalesOrder ↔ Invoice`: **1:N** (unchanged, Phase 5B).
- `DeliveryNoteLine ↔ InvoiceLine`: **N:M**. One DN's 4 units can be split across two invoices (2 +
  2); one invoice can cover units from two DNs (DN-1001's 4 + DN-1002's 3 = one 7-unit invoice line).
  This is why the link lives as `InvoiceLine.deliveryNoteLineId?` is **not enough on its own** for
  the N:M case — see the schema note below.
- `SalesOrderLine ↔ DeliveryNoteLine`: **1:N** (one SO line, several partial DNs) — mirrors
  `SalesOrderLine ↔ InvoiceLine` exactly (5B.1's own precedent).

**Schema implication of the N:M invoice↔delivery case**: a single `InvoiceLine.deliveryNoteLineId?`
scalar (mirroring `salesOrderLineId?`) is sufficient **only** when one invoice line is built from
exactly one delivery note line's remaining quantity. When an invoice line spans **multiple** DN
lines (the "7 units across DN-1001 + DN-1002" case), a scalar FK cannot represent it. Two honest
options, **neither implemented in CP-5C-0**:
  (i) **Constrain the picker** so one invoice line = one DN-line-derived-quantity (the picker may
      offer multiple invoice LINES for the same product, one per contributing DN, rather than
      merging them) — keeps the scalar FK, zero new schema beyond the FK itself;
  (ii) a proper `invoice_line_delivery_allocations` join table (`invoiceLineId, deliveryNoteLineId,
      quantity`) for the general N:M case.

  **DECIDED at CP-5C-A (2026-09-04): option (i).** One invoice-line allocation per Delivery Note
  line — the 5C-B picker will offer one invoice line per contributing DN when an SO line's
  remaining quantity spans more than one delivery, rather than merging them into one invoice line.
  `InvoiceLine.deliveryNoteLineId?` stays a plain scalar FK-like field (jsonb), mirroring
  `salesOrderLineId?` exactly — no join table. This is DB-schema-relevant (it is *why* 0051's
  `delivery_notes` table needs no `delivery_note_lines` normalized child and 0053's RPC design
  needs no allocation-splitting logic) so it is recorded here, not only as a future suggestion.
  Option (ii) remains documented as the correct general solution, OPTIONAL LATER, if genuine
  invoice-spans-multiple-deliveries volume ever appears (`docs/KNOWN_ISSUES.md`).

---

## PART 10 — Accounting-event matrix

| Event | Inventory qty | Committed qty | Stock movement | Inventory GL (1200) | Clearing GL (1220) | COGS | Revenue | VAT | AR | JE? | Audit? | Doc status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Quote created | — | — | — | — | — | — | — | — | — | No | Yes | `draft` |
| Quote accepted | — | — | — | — | — | — | — | — | — | No | Yes | `accepted` |
| SO created | — | — | — | — | — | — | — | — | — | No | Yes | `pending` |
| SO confirmed | — | **+ remainingToDeliver** (derived) | — | — | — | — | — | — | — | No | Yes | `confirmed` |
| DN draft | — | — | — | — | — | — | — | — | — | No | Yes | `draft` |
| DN posted ("dispatched"/"delivered" — one event, Part 3) | **− qty (on hand)** | **− qty** | **YES** — `type='delivery'`, @ frozen WAC | **CR** (decrease) | **DR** (increase) | No | No | **No** | No | **Yes** (delivery JE) | Yes | `posted` |
| Invoice draft | — | — | — | — | — | — | — | — | — | No | Yes | `draft` |
| Invoice posted — **delivered** portion | — (already moved at DN) | **− qty** (was already down since DN) | No new movement | — | **CR** (clears) | **DR** | **CR** | **CR** | **DR** | **Yes** (invoice JE) | Yes | `sent` |
| Invoice posted — **direct** portion (no prior DN) | **− qty** | **− qty** | **YES** — `type='sale'` (unchanged) | **CR** | — | **DR** | **CR** | **CR** | **DR** | Yes (same JE) | Yes | `sent` |
| Customer deposit received | — | — | — | — | — | — | — | No | No (`CR 2600` instead) | Yes | Yes | n/a |
| Partial payment | — | — | — | — | — | — | — | — | **CR** (settles) | Yes | Yes | `partially_paid` |
| Final payment | — | — | — | — | — | — | — | — | **CR** (settles) | Yes | Yes | `paid` |
| Delivery cancelled (draft only, Part 3) | — | — | — | — | — | — | — | — | — | No | Yes | `cancelled` |
| SO remainder closed | — | **→ 0** for the closed remainder | — | — | — | — | — | — | — | No | Yes | `closed` |
| Credit Note (financial only) | — | — | — | — | — | — | — | **DR** (reversal) | **CR** (reversal) | Yes | Yes | `issued` |
| Credit Note (`reason='return'`) | **+ qty** | *(order already fulfilled — n/a)* | **YES** — `sales_return`, @ **current** WAC (existing simplification, Part 15) | **DR** | — | **CR** (reversal) | **DR** (reversal) | **DR** (reversal) | **CR** (reversal) | Yes | Yes | `issued` |
| Goods returned (physical, no invoice yet — DN-level) | *(out of scope 5C — Part 15/5D)* | | | | | | | | | | | |

---

## PART 11 — Journal examples (worked, 10 printers, R5,750 excl VAT, WAC R3,200, VAT 15%)

`DN-1001` = 4, `DN-1002` = 3 (remaining to deliver = 3). `INV-1` = 4 (against DN-1001), `INV-2` = 2
(against DN-1002; 1 unit of DN-1002 delivered-but-uninvoiced at month end).

**Delivery 1 — DN-1001, 4 units, @ WAC 3,200**
```
DR  1220 Goods Delivered Not Invoiced     12,800.00
    CR  1200 Inventory                              12,800.00
```
No VAT, no AR, no revenue. `stock_movements`: qty −4, unit_cost 3,200, total_cost 12,800, type='delivery'.

**Invoice 1 — same day or later, 4 units delivered via DN-1001, @ R5,750**
```
DR  1100 Accounts Receivable    26,450.00
    CR  4000 Sales Revenue                 23,000.00     (4 × 5,750)
    CR  2100 VAT Output                     3,450.00     (15%)
DR  5000 Cost of Goods Sold      12,800.00
    CR  1220 Goods Delivered Not Invoiced   12,800.00     (clears exactly the DN-1001 amount, frozen)
```
One balanced entry, both legs together — revenue and COGS in the SAME period, SAME journal.

**Delivery 2 — DN-1002, 3 units, WAC has now moved to 3,300 (a receipt happened between DN-1001 and DN-1002)**
```
DR  1220 Goods Delivered Not Invoiced      9,900.00     (3 × current WAC 3,300 — WAC unchanged by 'issue')
    CR  1200 Inventory                               9,900.00
```

**Invoice 2 — 2 of the 3 DN-1002 units invoiced (1 remains delivered-but-uninvoiced)**
```
DR  1100 Accounts Receivable    13,225.00
    CR  4000 Sales Revenue                 11,500.00     (2 × 5,750)
    CR  2100 VAT Output                     1,725.00
DR  5000 Cost of Goods Sold       6,600.00               (2/3 of DN-1002's frozen 9,900 = 6,600 — the
    CR  1220 Goods Delivered Not Invoiced     6,600.00    invoice line splits the DN line proportionally
                                                            when it doesn't consume the whole DN quantity)
```
GL `1220` balance after Invoice 2: `12,800 − 12,800 (cleared) + 9,900 − 6,600 (cleared) = 3,300`
— exactly 1 unit's frozen cost, sitting in "Goods Delivered Not Invoiced" at month end. **This IS
the "Delivered Not Invoiced" exposure report figure (Part 23)**, straight off the trial balance,
with zero extra computation.

**Month-end (30 September, before Invoice 2's October posting) — see Part 12 for the full period
analysis.**

**Invoice spanning multiple DNs** (a single invoice line for all 7 delivered units, both DNs) —
handled as **two invoice lines** per the Part 9 recommendation (one per contributing DN), each
clearing its own DN's frozen amount — the customer sees one invoice, Vertex's internal lines stay
per-DN for cost-clearing correctness; the printable document can still merge same-product lines for
display if desired (a rendering concern, not an accounting one).

**Invoice before delivery** (no DN at all for a line) — **unchanged from today**:
```
DR 1100 AR / CR 4000 Revenue / CR 2100 VAT      (as today)
DR 5000 COGS / CR 1200 Inventory  @ CURRENT WAC  (as today — a normal 'issue' movement, type='sale')
```

**Delivered but never invoiced, SO closed** (`closeRemaining()`, DN-aware — Part 13/29): the
delivered-not-invoiced clearing balance is **left exactly as-is** — closing an SO does not write off
delivered inventory; the goods physically left, the clearing account correctly still shows Vertex is
owed for them until either invoiced (normal path) or a Return Note brings them back (Part 15). This
is an important invariant: **`closeRemaining()` never touches GL 1220** — it only stops new
commitment on the *undelivered* remainder.

**Credit Note after delivery, goods return**: reverses revenue/VAT/AR as today; the inventory-return
leg (`DR Inventory / CR COGS`, existing `reason='return'` behaviour) is **unchanged** — it already
assumes the goods were expensed to COGS (i.e., already invoiced), so it is orthogonal to whether a
DN existed. If a return happens **after delivery but before invoicing** (goods delivered, customer
sends them back before being billed) — this is a **Return Note** against the DN, not a Credit Note
(there is no invoice yet to credit) — explicitly Part 15 / deferred to 5D.

**Cancelled Delivery Note**: only possible while `draft` — no journal exists to reverse (Part 3).

**Customer pays only part of the invoice / a deposit exists before delivery**: no interaction with
any of the above — see Part 16.

---

## PART 12 — Period-end consequences

**29 September dispatch (DN, HYBRID model) → 3 October invoice:**

| | 29 Sep (Balance Sheet) | Sep Income Statement | Sep VAT | 3 Oct (Balance Sheet) | Oct Income Statement | Oct VAT |
|---|---|---|---|---|---|---|
| Inventory (1200) | **− R12,800** | — | — | unchanged | — | — |
| Goods Delivered Not Invoiced (1220) | **+ R12,800** | — | — | **− R12,800** (cleared) | — | — |
| COGS (5000) | — | **NOT recognised** | — | — | **+ R12,800** | — |
| Revenue (4000) | — | not recognised | — | — | **+ R23,000** | — |
| AR (1100) | — | — | — | **+ R26,450** | — | — |
| VAT Output (2100) | — | — | **R0** | — | — | **+ R3,450** |

**Under literal Model A** (rejected, Part 5): September Income Statement would show `−R12,800` COGS
with zero matching revenue (a September loss purely from timing); October would show `+R23,000`
revenue with zero matching COGS (an inflated October gross margin). **Under HYBRID**: September's
Income Statement is untouched by the delivery (correct — no sale has been recognised yet); the
Balance Sheet correctly shows less Inventory and a new asset class holding the cost; October
recognises COGS and Revenue together, as a normal sale. **Under literal Model B**: September's
Balance Sheet still shows the goods as Inventory even though they're not in the warehouse — wrong,
but not a P&L distortion.

**Mechanism required: a "Goods Delivered Not Invoiced" account — confirmed necessary.** Proposed
as a **new asset account, `1220`**, in the `1200`/`1210` (Inventory) family — not a liability (it
holds an asset cost, not an obligation), not a "contract asset" in the IFRS 15 revenue-recognition
sense (that concept is about unbilled *revenue*, not unbilled *cost*; conflating the two would be
importing a concept Vertex's existing revenue model doesn't use anywhere else). Design only — not
created in CP-5C-0 (Part 24/25).

---

## PART 13 — Invoice-before-delivery

**Recommendation: Option B — allow it, unrestricted, exactly as today.** A confirmed SO line keeps
committing stock (`remainingToDeliver`, Part 8) until either a DN or a direct invoice consumes it;
`postInvoice()` for a line with no prior DN issues stock itself at current WAC, precisely as it
does today (Part 7, Part 11). This is the only option that guarantees **zero behaviour change** for
every existing and future invoice that never uses a Delivery Note — critical, because Phase 5B
shipped to production with exactly this "invoice whenever" freedom and nothing may quietly break it.

- **Option A (block invoice qty > delivered)** — rejected as the default: it would retroactively
  constrain a workflow that is live in production today (invoicing without a prior DN) and would
  need a company-level opt-in to avoid breaking existing customers on day one.
- **Option C (explicit "invoice before delivery" workflow/approval)** — real businesses do this
  routinely (pro-forma-style "pay before we ship") and a mandatory approval gate is unwarranted
  complexity for CP-5C-0's scope; if a specific customer wants Option A's discipline, it is a
  **per-company policy toggle**, not a universal rule — flagged as a 5D/6 candidate, not built now.
- **Option D**: none identified that isn't a variant of A/B/C.

---

## PART 14 — Existing data / backward compatibility (read-only, verified 2026-09-04)

Live project `bcaffvpibpitpuqglszn` ("Office National"), read-only `SELECT`s only:

| Metric | Value |
|---|---|
| Sales Orders | **5** (was 4 at Phase 5B FINAL — the user exercised the picker live, per their own confirmation this session) |
| — `confirmed` | 1 |
| — `closed` | 0 |
| Invoices | **84** (was 83 — one new draft/posted invoice created via the live picker) |
| — linked to a Sales Order | **4** (was 3) |
| — posted (`status ∉ {draft, void}`) | 80 |
| `stock_movements` with `source_document_type = 'invoice'` | 40 |
| `stock_movements` with `source_document_type IS NULL` (pre-migration-0022 legacy) | 284 |
| Warehouses in use | 2 of 2 |
| Delivery-related tables already present | **0** |
| `stock_movement_type` enum values | `goods_received, sale, sales_return, transfer_in, transfer_out, adjustment, opening, purchase_return, write_off, stock_gain, stock_take, correction` — **no delivery-flavoured value exists yet** |

**No historical invoice has any delivery-note evidence, by definition — Delivery Notes didn't
exist.** Three backfill options, per the brief:

1. **Historical invoices remain legacy fulfilment evidence.** ✅ **RECOMMENDED.** Every invoice
   posted before Phase 5C's `postDelivery()` ships is, and remains, its own complete fulfilment
   record — exactly the same "legacy, not touched" treatment the September/August data and the
   Phase-9B backfill already established. `deliveredQty` for these lines derives to `0`
   (no DN exists) and `directlyInvoicedQty` correctly picks up the full historical `postedFulfilledQty`
   — the Part 8 formula proof already shows this reduces to today's numbers exactly. **Nothing to
   migrate, nothing to write.**
2. **Generate synthetic historical Delivery Notes.** ❌ **Rejected — explicitly prohibited by the
   brief** ("do NOT fabricate historical Delivery Notes"), and there is no reliable dispatch-date
   evidence to fabricate them from (the 284 legacy movements have no `movementDate` distinct from
   `createdAt` reliability, and even the 40 invoice-sourced movements only prove "stock moved when
   the invoice posted," not a separate dispatch date).
3. **Delivery Notes apply prospectively only.** This is the natural **consequence** of option 1,
   not a separate mechanism — no flag or cutover needed. The `directlyInvoicedQty` term already
   makes "no DN ever existed for this SO" the derived default.

**Recommended: Option 1 (⇒ Option 3 falls out for free). No backfill script, no historical data
touched, no fabrication.**

---

## PART 15 — Credit Notes vs. Returns

**A Credit Note is a financial correction (revenue/VAT/AR); it does not, by itself, prove goods
physically returned** — the existing `reason` field already separates `return` from
`pricing_error`/`discount`/`other`, and even `reason === 'return'` today restores stock at
**current** WAC as an accepted simplification (Part 1). This distinction is **preserved unchanged**
by Phase 5C — nothing here touches `creditNoteService.ts`.

**Physical returns of *delivered-but-not-yet-invoiced* goods** are a genuinely new case Phase 5C's
model makes possible for the first time (goods can now be "out" without being "sold" yet) and
**cannot** be handled by a Credit Note (there is no invoice to credit). This needs a **Return Note**
— `DR Inventory / CR Goods Delivered Not Invoiced`, the exact mirror-image of a Delivery Note.

**Decision: Return Notes are NOT built in Phase 5C.** They belong to **Phase 5D**, once Delivery
Notes are live and real return volume can be assessed. Phase 5C's model does not foreclose this —
the clearing-account design (Part 5) is symmetric by construction; a Return Note is simply a
negative-direction Delivery Note against the same clearing account, requiring no redesign later.

---

## PART 16 — Payments / deposits (reconfirmed, unchanged)

- **Payments never move inventory.** `customerReceiptService.recordReceipt()` and
  `InvoiceService.recordPayment()` touch only `Cash`, `AR`, `2600 Customer Deposits`, and the
  invoice's own `amountPaid`/status — never a stock table, never `stockCommitmentService`.
- **Deposits never fulfil a Sales Order.** A deposit is a liability (`2600`) until allocated to an
  invoice (`apply_customer_deposit` RPC, 4A) — it has no relationship to `deliveredQty`,
  `invoicedQty`, or commitment.
- **Partial payment never releases committed stock.** Commitment (Part 8) is a function of
  `deliveredQty`/`directlyInvoicedQty` only — `amountPaid` does not appear anywhere in the formula.
- Relationship diagram:
```
Delivery status  ─┐
Invoicing status  ─┼──  ALL INDEPENDENT of  ──▶  Payment status
Fulfilment status ─┘         (amountPaid / receipt / deposit)
```
This was already true after Phase 5B and remains true — Phase 5C adds a dimension (delivery)
strictly parallel to, never dependent on, payment.

---

## PART 17 — UI design (proposed, not built)

**Sales Order full page — Summary** (extends the existing Phase 5B block,
`docs/SALES_FULFILMENT.md` §"UI implications"):

```
Ordered · Committed · Delivered · Remaining to deliver · Invoiced (posted) · Remaining to invoice · Paid · Outstanding
```

**Related documents**: Quotes · **Delivery Notes** (new) · Invoices · Credit Notes · Payments — same
`RelatedRecordsSection` pattern already used.

**Delivery tab / section** (new, alongside the existing "Related invoices" table pattern from 5B):

| DN | Date | Warehouse | Qty | Status | Invoice status |
|---|---|---|---|---|---|

Each row's number opens the existing `RelatedRecordPreview` overlay (never navigates away), exactly
like the 5B "Related invoices" table.

**Actions by state** (mirrors the Phase 5B action-bar precedent — never expose an action merely
because the route exists; service guards remain authoritative):

| SO state | Available |
|---|---|
| `confirmed`, `remainingToDeliver > 0` | **Create Delivery Note** |
| DN `draft` | Edit, **Post** (dispatch/deliver — one action, Part 3), Cancel |
| DN `posted` | Print, Export — **no** Edit, **no** Cancel |
| `confirmed`, some delivered, remainder undelivered | **Close remaining** (delivery-aware — abandons `remainingToDeliver`, not `remainingToInvoiceQty`) |
| any state | **Create invoice** / **Invoice remaining** — **unchanged from 5B**, still available regardless of delivery status (Part 13) |

---

## PART 18 — Delivery Note printable document

Reuses the **existing** `src/features/businessDocuments/` A4 system (Phase 4B) — a new
`deliveryNoteToBusinessDocument` adapter, no new print engine, no new PDF library.

Contents: company logo/branding (existing `Company` document profile, migration 0047) · customer ·
delivery address · DN number · SO number · customer PO/reference · delivery date · warehouse ·
product code/description · quantity · delivered-by/received-by + signature area · notes.

**Selling price / line total: NOT shown by default.** A delivery note is proof of goods movement,
not a sales document — showing price on paperwork that travels with physical goods (sometimes via a
courier, sometimes left at a loading dock) is a common real-world data-leak/business risk that
Vertex's own `businessDocuments` privacy discipline (the `noInternalIds` test suite, Phase 4B) is
already built to catch for IDs; the same instinct applies to price here. `unitPrice`/`lineTotal` stay
in the DN line's stored data (needed for the clearing-account posting) but are **excluded from the
print template** — an explicit design decision, not an oversight, worth its own regression test in
5C-C.

---

## PART 19 — Product-detail traceability

The `InventoryItemDetail` `MovementLedger` (Increment 3, already shipped) gains one more
`sourceDocumentType`: `'delivery_note'`. Its existing `resolveSource`/`RelatedRecordPreview`
machinery already generalizes — no new UX pattern needed, just:

```
Stock Movement → Delivery Note (human DN number, opens RelatedRecordPreview) → Sales Order → Customer
Stock Movement → Invoice (unchanged) → journal
```

Clicking a Delivery Note or Sales Order reference from Product detail opens the existing modal
overlay (never navigates away), exactly as the Invoice reference already does — the same pattern
5B.1/5B.2 established for the Sales Order ↔ Invoice relationship.

---

## PART 20 — Audit trail

New free-text `AuditAction` values (no schema change — `audit_log_entries.action` is `text`,
exactly how `sales_order_closed` was added in Phase 5B.4 with zero migration):

```
delivery_note_created
delivery_note_updated
delivery_note_posted        (the single dispatch/delivery event, Part 3)
delivery_note_cancelled
delivery_note_printed
```

Recorded per event: `userId`, `timestamp` (`createdAt`), `company` (via RLS/`companyId`, not stored
redundantly on the row), `document` (`recordType: 'DeliveryNote'`, `recordId`), `previousValue`/
`newValue` = the status transition + quantities (not the full line-item payload — mirrors how
`closeRemaining()`'s audit row stores `{status, orderedQty, invoicedQty, abandonedQty}`, a compact
summary, not a raw document dump), `reason` (free text where relevant), and implicitly the source SO
via `newValue.salesOrderId` / the DN's own `salesOrderId` column. No raw line-item payload, no
pricing, in the audit row — consistent with "no sensitive/raw document payloads."

---

## PART 21 — Concurrency

**Same requirement, same proven pattern as Phase 5B.4's `create_invoice_from_sales_order` RPC.** A
`postDelivery()` (or `createAndPostDeliveryNote()`) atomic RPC must:
1. Lock the `sales_orders` row `FOR UPDATE` (identical lock target to migration `0049` — the SO is
   already the single serialization point for both invoicing and delivery, so the two operations
   naturally queue behind the same lock without needing a *new* lock hierarchy).
2. Re-derive `remainingToDeliver` for every requested line **inside the transaction**, from current
   `delivery_note_lines` + `invoice_lines` (the `directlyInvoicedQty` term), exactly mirroring how
   `0049` re-derives `remainingToInvoiceQty` from `invoices`.
3. Reject any line exceeding the re-derived remaining.
4. `SECURITY INVOKER`, `get_my_company_id()`, revoked from `public`/`anon`, granted to
   `authenticated` — the same security posture as `0046`/`0049`, no exceptions.

Two concurrent `DN-A = 4` / `DN-B = 4` against `remainingToDeliver = 5`: the SO-row lock serialises
them; the second re-derivation sees the first's committed line and correctly rejects. **Not
implemented in CP-5C-0** — proposal only, per the brief.

---

## PART 22 — Permissions

Vertex's permission catalog is `(feature, action)` rows (`permissions` table) + role grants
(`role_permissions`) + the client-side `usePermission(feature, action?)` hook — **verified**: no
existing Sales/Purchases/Inventory document type calls `usePermission()` today (it is seeded for
`inventory:*` sub-actions in migration `0030` but not wired into any UI); RLS everywhere stays the
coarse company-tenant policy. Phase 5C should **not** invent a parallel system, and should be honest
that wiring `usePermission()` into an actual document flow would be a **first**, not a continuation
of an established pattern.

Proposed catalog rows, same shape as the inventory precedent:
```
delivery_note:view · delivery_note:create · delivery_note:edit · delivery_note:post ·
delivery_note:cancel · delivery_note:print · delivery_note:export
```
Grant defaults (mirroring migration `0030`'s reasoning): `accountant` and `stock_controller` get
all seven; every other system role gets none until reviewed. **Not authored or applied in CP-5C-0.**

---

## PART 23 — Reporting consequences

| Report | Unlocked by | Phase |
|---|---|---|
| Delivered not invoiced (GL `1220` balance, drills to lines) | the clearing account itself — Part 11 shows this is a **trial-balance read**, not new logic | **5C** (comes essentially free with the schema) |
| Sales Orders awaiting delivery | `remainingToDeliver > 0` filter on the derived selector | 5C or 6 |
| Partial deliveries | DN count per SO > 1 | 6 |
| Delivery history / performance | DN list + date deltas | 6 |
| Customer fulfilment history | DN + Invoice join by customer | 6 |
| Warehouse dispatch history | DN filtered by warehouse | 6 |
| Product delivery history | DN lines filtered by product | 6 |
| Delivered vs invoiced (per product/customer/period) | `deliveredQty` vs `postedFulfilledQty` derived selectors | 6/7 |
| Month-end delivered-not-invoiced **exposure value** | same GL `1220` balance, as-of a period-end date | 7 (ties into Phase 13's accounting-invariant CI gate) |

Nothing in this table is built in 5C beyond what "comes free" from the schema/GL existing.

---

## PART 24 — Schema proposal (minimum safe, NOT authored as SQL yet)

### New tables

**`delivery_notes`** (header) — company-scoped, RLS `all_own_company` (the established coarse
policy every document table uses), composite `(company_id, id)` unique key (Phase 9B precedent, so
a future `delivery_note_lines`-style normalized child, if ever built, can FK it safely).

| Column | Type | Nullability | Notes |
|---|---|---|---|
| `id` | uuid PK | not null | |
| `company_id` | uuid FK → companies | not null | |
| `delivery_note_number` | text | not null, `unique(company_id, delivery_note_number)` | |
| `sales_order_id` | uuid FK → sales_orders (company-composite) | not null | |
| `customer_id` | uuid FK → customers (company-composite) | not null | |
| `warehouse_id` | uuid FK → warehouses (company-composite) | not null | |
| `delivery_date` | timestamptz | not null | |
| `status` | new enum `delivery_note_status` (`draft, posted, cancelled`) | not null default `draft` | |
| `line_items` | jsonb | not null default `'[]'` | authoritative, same pattern as every other document |
| `notes` | text | nullable | |
| `journal_entry_id` | uuid FK → journal_entries | nullable | set on post; **also the idempotency guard** |
| `created_at`/`updated_at` | timestamptz | not null | |

### Modified tables

| Table | Change | Classification |
|---|---|---|
| `invoices.line_items` (jsonb element) | new optional key `deliveryNoteLineId` | REQUIRED NOW (jsonb, no DDL) |
| `stock_movement_type` (enum) | `ADD VALUE 'delivery'` | REQUIRED NOW |
| `stock_movements` | no column change — `source_document_type` (TS union, no DB enum today per the current schema) gains `'delivery_note'` | REQUIRED NOW (TS only) |
| `accounts` (seed) | one new row, code `1220`, "Goods Delivered Not Invoiced", asset, debit-normal — mirrors how `2600 Customer Deposits` was seeded (migration `0045`) | REQUIRED NOW |
| `accountMappingService.ts` | new `AccountMappingKey` = `GOODS_DELIVERED_NOT_INVOICED` → `'1220'` | REQUIRED NOW (TS only) |
| `sales_order_status` | **no change** — `closeRemaining()` becomes delivery-aware in TS only (Part 13/29), no new enum value needed |
| `delivery_note_lines` (normalized child table) | OPTIONAL LATER — 5C ships jsonb-only, exactly like `sales_orders` today (no `sales_order_lines` table exists either, per Part 1) |
| `invoice_line_delivery_allocations` | OPTIONAL LATER — only if the N:M invoice-spans-multiple-DNs case (Part 9) needs it |

### DERIVED — never stored anywhere
`deliveredQty`, `directlyInvoicedQty`, `physicallyIssuedQty`, `remainingToDeliver`, `commitmentQty`
(Part 8) — computed selectors only, mirroring `salesOrderFulfilment.ts`'s existing discipline.

### Explicitly NOT proposed
- `dispatchDate` distinct from `deliveryDate` (Part 2/3 — one event).
- `DeliveryNoteLine.unitCostSnapshot` (Part 2/7 — `stock_movements` already is this).
- A new `InventoryCostingMode` or engine RPC change (Part 1/7 — `costingMode: 'issue'` +
  `contraAccountId` already do the job).

---

## PART 25 — Migration plan (proposal only, NOT authored)

| # | Purpose | Tables affected | Backfill | Rollback | Accounting risk | Data risk | Order |
|---|---|---|---|---|---|---|---|
| `0050` | `stock_movement_type ADD VALUE 'delivery'` | enum only | none | none — additive, non-transactional like `0048` | none — inert until code uses it | none | 1st |
| `0051` | `delivery_note_status` enum + `delivery_notes` table + RLS + indexes | new table | none | `drop table` | none — no existing row references it | none | 2nd, after `0050` |
| `0052` | seed `1220 Goods Delivered Not Invoiced` account per company | `accounts` (data insert, mirrors `0045`'s pattern — abort if a conflicting non-conforming `1220` already exists, never mutate a user-created account) | none — additive seed row | `delete from accounts where code='1220' and <company has never posted against it>` | none until posted against | none | 3rd |
| `0053` | atomic `post_delivery_note` RPC (Part 21) | function only | none | `drop function` | the RPC itself must be reviewed line-by-line exactly as `0049` was, before apply | none | 4th, after `0051`/`0052` |

**Delivery Notes must never mutate historical journals** — every migration above is additive
(`create table`, `add value`, `insert` new rows, `create function`); none alters or drops an
existing column, table, or posted journal row. No migration in this list is authored as executable
SQL in this checkpoint.

---

## PART 26 — Required test plan (counts are estimates for scoping, not a target to hit exactly)

| Category | Coverage | Est. |
|---|---|---|
| **Unit** | `deliveredQty`/`directlyInvoicedQty`/`physicallyIssuedQty`/`remainingToDeliver`/`commitmentQty` derivation; status transitions; WAC-snapshot read-back from `stock_movements`; delivery↔invoice line relationship helpers | ~25 |
| **Service** | create DN, post DN, partial DN, cancel draft DN, multiple DNs per SO, over-delivery rejected, DN↔invoice interaction (both paths: delivered and direct) | ~20 |
| **DB/RPC** | concurrent dispatch protection (SO lock), company isolation/RLS, idempotency (`journal_entry_id` guard), duplicate posting key, rollback on failure, FK integrity, migration-contract static-SQL tests (mirrors `salesFulfilmentMigrations.test.ts`) | ~20 |
| **Accounting** | inventory reduction at delivery; clearing-account debit/credit balance; invoice-time clearing vs direct-issue split; VAT untouched by delivery; AR untouched by delivery; payment independence (regression); month-end crossover (Part 12's worked numbers as literal assertions) | ~20 |
| **Integration** | SO→DN→invoice; SO→multiple DN→multiple invoice; invoice before delivery; delivery before invoice; partial payment against a delivered-and-invoiced order; credit note after delivery; return-compatibility (schema doesn't block Part 15's future Return Note) | ~15 |
| **Regression** | Phase 5A commitment (`ordered − postedFulfilledQty` reduces correctly when `deliveredQty=0`); Phase 5B partial invoicing untouched; `stockCommitmentService` formula backward-compat proof (Part 8); inventory reconciliation (GL 1200 ↔ valuation); WAC; COGS; VAT; AR; customer deposits (4A); September dataset integrity; normalized-line parity unaffected (`NORMALIZED_DOCUMENT_LINES_ENABLED` stays false) | ~25 |
| **UI** | full-page SO delivery section; DN actions gated by status; print (price suppressed, Part 18); export; deep links; `RelatedRecordPreview` modal for DN references; responsive layout; permission-gate presence (inert, Part 22) | ~20 |

**Total estimate: ~145 new tests** across 5C-A through 5C-D (Part 29) — comparable in scale to
Phase 5B's actual ~117 net new tests across 5B.1-5B.4.

---

## PART 27 — Accounting invariants (must never be violated by 5C implementation)

1. Every posted journal balances (`Σdebit = Σcredit`) — no exception, ever.
2. Trial balance remains balanced after every operation, including delivery posting.
3. GL `1200` (Inventory) reconciles to inventory valuation **at every point** — delivery reduces
   both together, atomically, in the same RPC call (exactly like every existing `issue`/`receipt`).
4. GL `1220` (new) reconciles to `Σ` un-cleared delivery amounts — itself a reconciliation check to
   add alongside the existing `reconcileInventory()`.
5. No duplicate inventory issue for the same quantity (delivered-then-invoiced must clear, never
   re-issue — the `deliveryNoteLineId` presence check, mirroring `grniAlreadyRecognized`).
6. No duplicate COGS, no duplicate revenue, no duplicate VAT, no duplicate AR.
7. A quantity cannot be delivered twice (RPC-enforced remaining check, Part 21).
8. A quantity cannot be invoiced beyond whatever policy is active (today: unrestricted, Part 13).
9. Historical WAC is immutable — `stock_movements.unit_cost`/`total_cost` frozen at posting,
   never recomputed from "current" WAC afterward (Part 7).
10. Customer payment never moves stock, never changes delivery/fulfilment status (Part 16).
11. Draft documents (DN or Invoice) never post accounting.
12. Cancelled documents cannot silently erase posted accounting — a **posted** DN cannot be
    cancelled at all (Part 3); correction is a Return Note (Part 15, future) or a manual
    compensating journal, never a delete/void of the posted entry.
13. Company isolation always applies (RLS + explicit `company_id` filters in every RPC, per the
    `0046`/`0049` precedent).
14. Every physical stock movement has traceable source evidence
    (`sourceDocumentType`/`sourceDocumentId`/`sourceDocumentLineId`) — a delivery movement is no
    exception.
15. **New for 5C**: a Delivery Note never posts VAT, revenue, or AR under any circumstance (Part 6).
16. **New for 5C**: `closeRemaining()` never touches GL `1220` — closing an SO's undelivered
    remainder does not write off already-delivered, not-yet-invoiced cost (Part 11).

---

## PART 28 — RECOMMENDATION

# **HYBRID.**

**Precise definition**: Delivery Note posting reclassifies cost from `1200 Inventory` to a new
asset-family clearing account, `1220 Goods Delivered Not Invoiced`, at the product's **current WAC,
frozen on the `stock_movements` row** — a pure balance-sheet reclassification, zero P&L, zero VAT,
zero AR, zero revenue. Invoice posting is **unchanged in shape** (still one atomic entry, still
`DR AR / CR Revenue / CR VAT`) but its COGS leg now branches per line: if the line traces to a prior
Delivery Note, `DR COGS / CR 1220` at the **frozen** delivery amount (no new stock movement, no
WAC re-lookup); if not, `DR COGS / CR 1200` at current WAC exactly as today (an ordinary `'issue'`).
This is architecturally identical to the existing, proven, live GRNI pattern
(`recordReceipt()`/`postBill()`) mirrored onto the sales side.

| Criterion | Assessment |
|---|---|
| **Accounting correctness** | Only HYBRID preserves the matching principle (Part 5/12, proven with numbers) while also reflecting physical reality on the balance sheet in real time — literal Model A fails matching; literal Model B fails to reflect reality. |
| **Inventory correctness** | GL `1200` always equals the actual physical warehouse content the instant a DN posts — closing the exact gap Phase 5C exists to close. |
| **VAT implications** | Zero change — VAT stays exactly where it is today, at invoice only (Part 6). Lowest possible VAT risk. |
| **Period-end implications** | Solved by construction — GL `1220`'s balance *is* the "delivered not invoiced" exposure figure, straight off the trial balance (Part 11/23), no extra computation. |
| **Implementation complexity** | **Lower than it looks.** The inventory posting engine / RPC needs **zero logic change** — verified: `post_inventory_transaction` branches only on `costing_mode`, never `movement_type` (Part 1). `costingMode: 'issue'` + a caller-supplied `contraAccountId` already does exactly what delivery needs. The real complexity is entirely in the **service layer** (a new `deliveryNoteService`, and `invoiceService.postInvoice()`'s new per-line branch) and the **N:M delivery↔invoice line relationship** (Part 9) — genuine but bounded, well-precedented work, not an engine rewrite. |
| **Migration impact** | 2 additive enum values, 1 new table, 1 new seeded account row, 1 new RPC — comparable in size to Phase 5B.4's `0048`+`0049`, not to Phase 9B's four-table normalization effort. |
| **Existing-data compatibility** | **Proven zero-impact** (Part 8's backward-compatibility proof; Part 14's "legacy evidence, no backfill" recommendation) — every SO/invoice that predates or never uses Delivery Notes behaves byte-identically to today. |
| **Risk** | Medium — the risk is concentrated entirely in `postInvoice()`'s new branch (must never double-post COGS/stock for a delivered line) and the RPC's concurrency guard (Part 21) — both directly modelled on code already live in production (`postBill()`'s `grniAlreadyRecognized`, `0049`'s SO-lock pattern). |
| **Future extensibility** | Symmetric design — a future Return Note (Part 15/5D) is a mirror-image posting against the same clearing account, no redesign. The N:M schema note (Part 9) is documented so 5C-B doesn't box in 5D. |

---

## PART 29 — Implementation plan (finite — 4 checkpoints, not open-ended)

| Checkpoint | Scope | Migrations | Gate |
|---|---|---|---|
| **5C-A — Schema + DB safety** | Author (not apply) `0050`-`0053` (Part 25); the `post_delivery_note` atomic RPC (Part 21) with full concurrency/security hardening, mirroring `0049`'s review depth; migration-contract static-SQL tests; `1220` account key wiring (`AccountMappingKey`). **No service/UI code yet.** | Authored, **not applied** | CP-5C-A: schema + RPC design reviewed line-by-line, exactly as `0049` was |
| **5C-B — Service + accounting integration** | `deliveryNoteService` (create/post/cancel, mirrors `purchaseOrderService.recordReceipt()`'s shape); `salesOrderFulfilment.ts` gains `deliveredQty`/`directlyInvoicedQty`/`remainingToDeliver`; `stockCommitmentService` formula updated (Part 8, proven backward-compatible); `invoiceService.postInvoice()` gains the delivered/direct branch (Part 5/7/11); `closeRemaining()` becomes delivery-aware (abandons `remainingToDeliver`, never touches GL `1220`, Part 27 invariant 16). **No migration applied yet — all against Mock/Fake repos + the engine's Fake executor.** | none applied | CP-5C-B: full accounting-safety test suite green (Part 26/27), engine untouched proof re-verified |
| **5C-C — UI, document, traceability** | Sales Order delivery tab/summary (Part 17); Delivery Note printable document via `businessDocuments` (Part 18, price suppressed); Product-detail `MovementLedger` gains the `delivery_note` source type + `RelatedRecordPreview` (Part 19); audit events (Part 20); permission catalog rows authored (Part 22, inert). | none | CP-5C-C: UI + a11y + responsive + print-privacy tests green |
| **5C-D — QA, backfill decision, release** | Apply `0050`-`0053` to the live project (separate explicit approval); independent QA pass (subagent, mirroring the 5B pattern — live-DB verification, security advisors, accounting-invariant re-proof); confirm Part 14's "no backfill" decision still holds against live data at that time; full gate; commit/push/merge/deploy decision left to the user, same as every prior checkpoint. | **0050-0053 applied** (after CP-5C-D approval, not before) | CP-5C: final review, STOP for deploy approval |

No 5C.5/5C.6/5C.7... — this is the finite structure. Anything discovered beyond these four that
isn't a genuine blocker goes to `docs/KNOWN_ISSUES.md` or a later phase, not a new 5C sub-checkpoint.

---

# CP-5C-A — SCHEMA + DB SAFETY (AUTHORED, NOT APPLIED, 2026-09-04)

CP-5C-0 was approved with three explicit instructions: adopt HYBRID, resolve the N:M
Delivery-Note↔Invoice question by **enforcing one invoice-line allocation per Delivery Note line**
(no join table — see Part 9's decision above), and author (never apply) migrations 0050-0053 plus
the `post_delivery_note` database contract. This section is the exact record of what was authored.

## Files authored

| File | Purpose |
|---|---|
| `supabase/migrations/20260904150010__0050_stock_movement_type_delivery.sql` | `ALTER TYPE stock_movement_type ADD VALUE 'delivery'` |
| `supabase/migrations/20260904150020__0051_delivery_notes_table.sql` | `delivery_note_status` enum + `delivery_notes` table + indexes + RLS |
| `supabase/migrations/20260904150030__0052_goods_delivered_not_invoiced_account.sql` | seeds `1220 Goods Delivered Not Invoiced` per company, with the same ABORT-on-conflict guard as `0045` |
| `supabase/migrations/20260904150040__0053_post_delivery_note_rpc.sql` | the atomic `post_delivery_note(...)` RPC |
| `src/repositories/deliveryNotesMigrations.test.ts` | 29 static-SQL contract tests on the four files above, mirroring `salesFulfilmentMigrations.test.ts` |

**None of these four `.sql` files have been applied to any Supabase project.** No `mcp__supabase__apply_migration` call was made in CP-5C-A. `git status` at the end of CP-5C-A shows only new/modified files — no database was touched.

## 0050 — exact DDL

```sql
alter type public.stock_movement_type add value if not exists 'delivery';
```

One statement, its own migration (the same `ALTER TYPE` restriction 0021/0048 already documented — cannot share a transaction with anything that then uses the new value). In practice not load-bearing here: `'delivery'` never appears as a literal enum cast inside 0053's own SQL text, only as plain jsonb text later cast at *runtime* inside the pre-existing `post_inventory_transaction` (0031) — but the ordering is kept for documentation clarity and to match the CP-5C-0 migration plan.

## 0051 — exact DDL

```sql
create type public.delivery_note_status as enum ('draft', 'posted', 'cancelled');

create table public.delivery_notes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  delivery_note_number  text not null,
  sales_order_id        uuid not null references public.sales_orders(id),
  customer_id           uuid not null references public.customers(id),
  warehouse_id          uuid not null,
  delivery_date         timestamptz not null,
  status                public.delivery_note_status not null default 'draft',
  line_items            jsonb not null default '[]'::jsonb,
  notes                 text,
  journal_entry_id      uuid references public.journal_entries(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, delivery_note_number),
  unique (company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)
);
-- + 5 indexes (company_id, sales_order_id, customer_id, warehouse_id, status)
-- + RLS enabled, one all_own_company policy (identical shape to every other document table)
```

**Column set matches Part 2's REQUIRED-NOW list exactly** — no `subtotal`/`tax_total`/`total`
header columns (a Delivery Note posts no price-based total; its GL effect is computed by
`post_delivery_note` at posting-time WAC, per Part 5/7). `line_items` jsonb carries the full
`DocumentLineItem`-shaped line (`id`, `salesOrderLineId`, `productId`, `description`, `quantity`,
`unitPrice`, `taxRateId?`, `taxAmount`, `lineTotal`) — camelCase keys, matching 0049's own jsonb
convention exactly so the eventual TS `DeliveryNoteLine` type serializes without translation.

**FK decisions, explicit and justified (also in the migration's own header comment):**
- `sales_order_id` / `customer_id` → **plain** FKs to `sales_orders(id)` / `customers(id)` — matches
  the ORIGINAL document-header convention those two tables already use for each other
  (`sales_orders.customer_id`/`quote_id`, migration 0006, both plain). Neither `sales_orders` nor
  `customers` has a `(company_id, id)` composite candidate key today; adding one is a genuine
  separate prerequisite (0037's own precedent) and was kept OUT of 5C-A to stay additive-only and
  scoped to Delivery Notes. Flagged as a SUGGESTION below, not solved here.
- `warehouse_id` → **composite** FK to `warehouses(company_id, id)` — the established, exception-free
  convention for every inventory-effecting table (`stock_adjustments`, `stock_transfers`,
  `stock_takes`, `invoice_lines`, `bill_lines`, `purchase_order_lines`, `credit_note_lines` all do
  this, migrations 0027-0029/0038-0041) — followed here without deviation.
- `unique (company_id, id)` added on `delivery_notes` itself even though nothing needs it in 5C-A —
  it is the exact prerequisite a future normalized `delivery_note_lines` table (Part 24, OPTIONAL
  LATER) would need without a later retrofit migration; cheap to add now, following 0027/0037's
  own precedent for every other document/inventory table.
- **No DB-level trigger** blocking edits to a `posted` row. Every existing document table in this
  codebase enforces "posted is immutable" at the APPLICATION layer only (`updateInvoice`'s
  `ACCOUNTING_RELEVANT_FIELDS` guard etc.) — `delivery_notes` follows that same, already-established
  boundary rather than introducing a new, inconsistent DB-level mechanism for this one table alone.

## 0052 — exact DDL (abbreviated; full file has the complete comment)

Identical ABORT-on-conflict structure to `0045`'s `2600 Customer Deposits` seed, reproduced for
code `1220`, `asset`/`debit` instead of `liability`/`credit`:

```sql
do $$
declare v_bad record;
begin
  for v_bad in
    select a.company_id, a.name, a.type::text as type, a.normal_balance::text as nb, a.is_active
    from public.accounts a
    where a.code = '1220'
      and not (a.type = 'asset' and a.normal_balance = 'debit' and a.is_active)
  loop
    raise exception 'Migration 0052 ABORT: ... will not mutate a user-created account.', ...;
  end loop;
end $$;

insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, '1220', 'Goods Delivered Not Invoiced', 'asset', 'debit', true,
       'Cost of goods physically dispatched via a posted Delivery Note but not yet invoiced — ...'
from public.companies c
where not exists (select 1 from public.accounts a where a.company_id = c.id and a.code = '1220');
```

Confirmed free (`grep` of `accountMappingService.ts` + `src/mock-data/accounts.ts`, 2026-09-04 — no
existing use of code `1220`). The `AccountMappingKey.GOODS_DELIVERED_NOT_INVOICED` TypeScript
constant is deliberately **NOT** added by this migration or by any code in CP-5C-A — that is 5C-B
service-layer work, out of this checkpoint's scope ("do not implement services yet").

## 0053 — `post_delivery_note` contract

### Signature

```sql
post_delivery_note(
  p_delivery_note_id  uuid,
  p_contra_account_id uuid,                -- resolved 1220 account id (5C-B TS work supplies this)
  p_line_accounts     jsonb,                -- [{ "deliveryNoteLineId": uuid-text, "inventoryAccountId": uuid-text }, ...]
  p_posted_by         text default null,
  p_posting_date      date default null
) returns jsonb
language plpgsql security invoker set search_path to 'public'
```

### What draft creation is — and why it's NOT this RPC

Draft creation/editing of a `delivery_notes` row is a **plain INSERT/UPDATE** through the app
repository layer (5C-B, not built yet) — no RPC needed there, unlike invoices. This is a deliberate
divergence from `create_invoice_from_sales_order` (0049), justified precisely:

- A **draft invoice** already counts toward `remainingToInvoiceQty` in 0049's own "taken" query
  (draft **and** posted both count) — so two concurrent draft-invoice creations racing the same
  remaining quantity is a real, immediate risk that 0049 must guard against AT CREATION.
- A **draft Delivery Note**, per this design's own Part 8 formula, does **not** reduce
  `remainingToDeliver` at all — only a `posted` one does (`deliveredQty` sums posted lines only).
  So two concurrent draft-DN creations are harmless: nothing commits until one of them actually
  posts. The atomic guard therefore belongs at **posting**, not at draft creation — the reverse of
  where 0049 put it, for a reason specific to this document's own derived-quantity design.

### Transaction / locking behaviour (in order)

1. Resolve `v_company := get_my_company_id()` — the client never supplies `company_id`.
2. **`select ... from delivery_notes where id = p_delivery_note_id and company_id = v_company for update`.**
   Not found → exception. `status <> 'draft'` → exception ("only a draft can be posted") — this is
   the double-post / concurrent-post-of-the-SAME-document guard: a second concurrent call for the
   same DN blocks on this row lock, then (after the first commits) sees `'posted'` and is rejected.
3. Verify `p_contra_account_id` belongs to `v_company` (defensive — "never trust client data").
4. **`select ... from sales_orders where id = v_dn.sales_order_id and company_id = v_company for update`.**
   Not found → exception. `status = 'cancelled'` or `'closed'` → exception. This is the SAME lock
   target 0049 uses, so a `post_delivery_note` call and a `create_invoice_from_sales_order` call
   against the same order naturally serialize behind one another — no new lock hierarchy needed.
5. For every line in `v_dn.line_items` (the DN's own STORED data — never re-supplied by the caller,
   mirroring 0049's "caller supplies only what it must" principle): validate no duplicate line ids,
   a real `productId`, quantity `> 0` and `≤ 3dp`, and that the referenced SO line still exists.
6. **Re-derive `remainingToDeliver` inside the transaction** = `orderedQty − deliveredElsewhere − directlyInvoicedQty`:
   - `deliveredElsewhere` = Σ line quantity from every **other** `delivery_notes` row with
     `status = 'posted'` against the same SO line (`dn.id <> v_dn.id`).
   - `directlyInvoicedQty` = Σ line quantity from every `invoices` row with `status not in
     ('draft','void')` against the same SO line, **where the invoice line carries no
     `deliveryNoteLineId`** (the invoice-before-delivery bypass path — deliberately unconstrained;
     this RPC never blocks or even looks at that path beyond counting it, per Part 13).
   - Reject if this DN's own line quantity exceeds that remaining.
7. Resolve and validate each line's `inventoryAccountId` from the caller-supplied `p_line_accounts`
   map (must be present, must belong to `v_company`).
8. Build one `post_inventory_transaction` line per DN line: `costing_mode: 'issue'`,
   `movement_type: 'delivery'`, `quantity_delta: -qty`, `warehouse_id` from the DN header,
   `inventory_account_id` / `contra_account_id` as resolved, `source_document_line_id` = the DN
   line id, `non_stock: false`.
9. **Call `public.post_inventory_transaction(...)` directly from within this function** — the
   EXISTING, byte-unchanged engine (0031), with `p_extra_journal := '[]'::jsonb` (no VAT/AR/revenue
   leg — a pure `DR contra / CR inventory` reclassification, built entirely by the engine's own
   inventory-leg logic) and `p_audit` carrying `action: 'delivery_note_posted'`. Posting key:
   `'delivery_note:' || v_dn.id || ':post'` — the established `<sourceType>:<sourceId>:<verb>`
   convention.
10. `update delivery_notes set status = 'posted', journal_entry_id = <from the engine's result>,
    updated_at = now() where id = v_dn.id`. `sales_orders.status` is **never** touched (mirrors
    0049 — commercial status transitions live at a separate, later layer).
11. Return `{ delivery_note_id, delivery_note_number, journal_entry_id, movement_ids, idempotent }`.

### Why this RPC calls another RPC directly (SQL calling SQL — new to this codebase)

`post_inventory_transaction` is itself `SECURITY INVOKER` with no `SECURITY DEFINER` anywhere in
its definition (0031's own header comment confirms this deliberately). Calling it from within
`post_delivery_note` — ALSO `SECURITY INVOKER`, same session, same transaction — executes it with
the exact same caller identity and RLS as a direct RPC call from TypeScript would. There is no
privilege escalation and no new grant needed beyond what `authenticated` already holds on
`post_inventory_transaction`. This gets TRUE atomicity (the `sales_orders` row lock is held across
the ENTIRE remaining-check AND the engine write, in one transaction) that the two-network-call
TypeScript pattern used for invoices (create draft via one RPC call, post later via a completely
separate later call) cannot offer — a genuine improvement specific to this RPC's design, made
possible because Delivery Notes never need the "create now, post much later" gap invoices do.
**This is flagged explicitly as a deliberate, reviewed decision** — the first such composition in
the codebase — not an accident of copy-paste.

### Journal examples (identical to Part 11's worked numbers — now the exact call shape)

**Posting `DN-1001` (4 units, product WAC currently R3,200):**
```
post_delivery_note(
  p_delivery_note_id  := '<dn-1001-uuid>',
  p_contra_account_id := '<1220-account-uuid>',
  p_line_accounts     := '[{"deliveryNoteLineId":"<line-uuid>","inventoryAccountId":"<1200-account-uuid>"}]'
)
```
produces, via the unchanged engine, exactly:
```
DR  1220 Goods Delivered Not Invoiced     12,800.00
    CR  1200 Inventory                              12,800.00
```
one `stock_movements` row (`type='delivery'`, `quantity_delta=-4`, `unit_cost=3200`,
`total_cost=12800`, `source_document_type='delivery_note'`), one `journal_entries` row (balanced,
2 lines), `delivery_notes.status → 'posted'`, `journal_entry_id` stamped. No VAT, no AR, no revenue
— confirmed structurally by the contract test asserting `p_extra_journal => '[]'::jsonb`.

### Rollback / failure behaviour

Every `raise exception` inside the function body aborts the ENTIRE transaction — the row locks are
released, `delivery_notes.status` stays `'draft'` (the `update` at step 10 never runs), no
`stock_movements`/`journal_entries` rows are written (they live inside the same transaction as the
`post_inventory_transaction` call this function makes), and the DN can be corrected and re-submitted.
This is the same all-or-nothing guarantee 0049 and 0031 already provide — `post_delivery_note` adds
no new failure mode, it composes two already-atomic primitives (its own SO/DN validation, then the
existing engine) inside one PL/pgSQL function body, which Postgres treats as a single transaction
by default when called via `supabase.rpc(...)` (no explicit `BEGIN`/`COMMIT` needed or used, matching
0031/0049's own style).

### Accounting invariants this RPC specifically enforces

From Part 27's list — the ones this RPC is the actual enforcement point for:
- **#3/#4** (GL 1200/1220 reconcile atomically) — both legs post in the SAME `post_inventory_transaction` call.
- **#5** (no duplicate issue) — the `status <> 'draft'` guard at step 2 makes a second post of the
  same DN structurally impossible; a delivered-then-invoiced line clears via 5C-B's `postInvoice()`
  branch (not built here), never re-issues.
- **#7** (a quantity cannot be delivered twice) — step 6's re-derivation, inside the SO row lock.
- **#9** (historical WAC immutable) — unchanged, inherited entirely from `post_inventory_transaction`'s own `costing_mode: 'issue'` behaviour; this RPC adds nothing new here and could not weaken it even if it tried (it never touches `products.cost_price`).
- **#13** (company isolation) — every table this RPC reads or writes is filtered by `company_id = v_company` explicitly, on top of RLS.
- **#15** (a Delivery Note never posts VAT/revenue/AR) — structurally impossible: `p_extra_journal` is hard-coded `'[]'::jsonb`, and the engine's own inventory-leg logic only ever touches the two accounts it's given.

## Known issues discovered in CP-5C-A

| Severity | Issue | Recommended action | Phase |
|---|---|---|---|
| LOW | `sales_orders` and `customers` have no `(company_id, id)` composite candidate key, so `delivery_notes.sales_order_id`/`customer_id` are plain (non-composite) FKs — RLS already makes a cross-company row unreachable to read/write through the normal client path, so this is a narrow, defense-in-depth gap, not a live tenant-isolation hole. | A genuine, separate prerequisite migration (mirroring 0037's `invoices`/`credit_notes` precedent) — add `unique (company_id, id)` to both tables, then upgrade the two FKs to composite. | Phase 7 hardening, or folded into 5C-B if convenient |
| INFO | `post_inventory_transaction` itself (0031, unchanged, out of scope to modify here) does not verify `inventory_account_id`/`contra_account_id` belong to the calling company before writing `journal_lines` — `post_delivery_note` adds a company-ownership check on both accounts specifically because it's new, narrow, and cheap to add here, but the underlying engine's own gap is pre-existing and unfixed. | Note only — not a 5C-A defect, since 5C-A does not touch or reopen the engine. Worth a future audit of every OTHER caller of `post_inventory_transaction` (postInvoice, recordReceipt, issueCreditNote, stock adjustments/transfers/takes) for the same class of gap. | Phase 7 hardening |

## Suggestions

| Classification | Suggestion |
|---|---|
| RECOMMENDED LATER | The `sales_orders`/`customers` composite-key prerequisite above, once a second consumer needs it (not urgent for Delivery Notes alone, since RLS already covers the practical risk). |
| RECOMMENDED LATER | Audit every existing `post_inventory_transaction` caller for the same account-company-ownership gap `post_delivery_note` closes for itself. |
| OPTIONAL | A DB-level trigger blocking edits to a `posted` `delivery_notes` row's `line_items`/`status` — deliberately not added in 5C-A to stay consistent with how every other document table in this codebase enforces that rule at the application layer only; worth reconsidering only if a real incident ever shows the app-layer guard insufficient. |

## Gate at CP-5C-A (original)

tsc ✅ · eslint `--max-warnings 0` ✅ · **2377 tests / 311 files** ✅ (was 2348/310 — **+29 tests /
+1 file**, `deliveryNotesMigrations.test.ts`, zero regressions) · `vite build` ✅.

**Database writes: NONE. Migrations applied: NONE (0050-0053 authored only). Accounting logic
changed: NO (the engine, `post_inventory_transaction`, is byte-unchanged). Services/UI: NOT
implemented. Commits/pushes/deploys: NONE.**

**Superseded by the CP-5C-A HARDENING pass below — the migration numbering changed (0050-0053 →
0050-0054) and the schema/RPC content was hardened before any apply.**

---

# CP-5C-A HARDENING (2026-09-04) — HOLD BEFORE APPLY

CP-5C-A's review result was "HOLD BEFORE APPLY" with the overall HYBRID architecture approved and
six specific hardening items required before any migration is applied. This section is the exact
record of that pass. **Migrations were renumbered**: `0050` is now a NEW prerequisite migration
(composite keys on `sales_orders`/`customers`); the original `0050`-`0053` shifted to `0051`-`0054`.
The original four files were deleted and re-authored under new filenames — no file with the old
numbering remains.

## 1. Company-safe foreign keys — UPGRADED

**Read-only investigation (live project `bcaffvpibpitpuqglszn`, 2026-09-04):**
```sql
select
  (select count(*) from public.sales_orders where company_id is null) as so_null_company,   -- 0
  (select count(*) from public.customers where company_id is null) as cust_null_company,    -- 0
  (select count(*) from public.sales_orders) as so_count,                                    -- 5
  (select count(distinct id) from public.sales_orders) as so_distinct_ids,                   -- 5
  (select count(*) from public.customers) as cust_count,                                     -- 20
  (select count(distinct id) from public.customers) as cust_distinct_ids,                    -- 20
  (select count(*) from pg_constraint where conname = 'sales_orders_company_id_id_key'),      -- 0
  (select count(*) from pg_constraint where conname = 'customers_company_id_id_key'),         -- 0
  (select count(*) from public.accounts where code = '1220'),                                 -- 0
  (select ... 'delivery' = any(enum_range(null::public.stock_movement_type)::text[]));        -- false
```
No NULL `company_id`, `id` count equals distinct-`id` count on both tables (trivially guaranteed —
`id` is already `uuid primary key`, globally unique on its own; `unique (company_id, id)` is a
strict superset-uniqueness of an already-unique column and can **never** conflict with existing
data, on any table, regardless of row count — this is a structural, not merely empirical, safety
guarantee), no pre-existing conflicting constraint name, `1220` still free, `'delivery'` enum value
not already present.

**Decision: UPGRADE.** New migration `0050` adds `sales_orders_company_id_id_key` and
`customers_company_id_id_key` (mirroring `0037`'s own precedent for `invoices`/`credit_notes`, and
`0027`/`0029` for `products`/`warehouses`/`accounts`/`suppliers`/`bills`/`purchase_orders`/
`tax_rates`). `0052` (the `delivery_notes` table, renumbered from `0051`) now declares
`sales_order_id`/`customer_id` as **composite** FKs to `sales_orders(company_id, id)` /
`customers(company_id, id)` — the exact same shape as `warehouse_id`'s FK, which was already
composite from the original authoring. **No plain FK remains anywhere in the `delivery_notes`
table.** A cross-company `sales_order_id`/`customer_id` on a `delivery_notes` row is now
**structurally impossible**, not merely improbable under RLS.

## 2. `post_inventory_transaction` account-ownership — FULL CALLER AUDIT

**Read-only code audit (no RPC change made — see verdict below).** Every caller resolves account
ids through one of two paths, both ultimately backed by an RLS-scoped fetch:
- `AccountMappingService.getAccountId(key)` → `accountService.getAccounts()` → RLS-scoped
  `SELECT` on `accounts` (`company_id = get_my_company_id()`, enforced at the DB) — **always**
  same-company under normal app usage, no exception.
- `InventoryAccountResolverService.resolveForProduct(product, role)` — a 3-tier resolver: (1) the
  product's own override column (`products.inventory_account_id` etc.), (2) its category's
  override column (`product_categories.inventory_account_id` etc.), (3) the generic key via
  `AccountMappingService` above. **Tiers 1 and 2 are PLAIN `uuid references public.accounts(id)`
  columns (migrations 0019/0024/0025) — no composite FK, no company-match check at the DB level.**
  Under normal app usage (`ProductForm`'s account picker is itself RLS-scoped) these are always
  same-company too, but this is a UI convention, not a schema guarantee.

| Caller (service) | Accounts supplied | company_id established via | Account IDs originate via | Same-company guaranteed (normal use)? | Cross-company ID could theoretically reach the RPC? | Severity | Recommended fix |
|---|---|---|---|---|---|---|---|
| `invoiceService.postInvoice()` | AR, SALES_REVENUE (generic+per-product), VAT_OUTPUT, inventory/COGS (per-product) | RPC's own `get_my_company_id()` for the row; TS pre-resolves account ids | `resolveKey` + `resolveForProduct` | Yes | Yes — (a) hand-crafted direct RPC call bypassing the UI, (b) a product/category override column set via a hand-crafted direct table UPDATE | LOW | composite-FK `journal_lines.account_id`, `products.*_account_id`, `product_categories.*_account_id` → `accounts(company_id,id)` |
| `billService.postBill()` | GRNI, inventory (per-product), AP | same | same | Yes | Yes (same two paths) | LOW | same |
| `purchaseOrderService.recordReceipt()` | inventory (per-product), GRNI | same | same | Yes | Yes | LOW | same |
| `creditNoteService.issueCreditNote()` | revenue/inventory/COGS (per-product), AR/VAT | same | same | Yes | Yes | LOW | same |
| `stockAdjustmentService` | inventory/adjustment (per-product) | same | same | Yes | Yes | LOW | same |
| `stockTransferService` | INVENTORY_IN_TRANSIT, inventory (per-product) | same | same | Yes | Yes | LOW | same |
| `stockTakeService` | inventory/adjustment (per-product) | same | same | Yes | Yes | LOW | same |
| `supplierReturnService` | settlement/PPV, inventory (per-product), EXPENSE/VAT_INPUT | same | same | Yes | Yes | LOW | same |
| `openingStockBatchService` | INVENTORY/OPENING_BALANCE_EQUITY, inventory (per-product) | same | same | Yes | Yes | LOW | same |
| `post_delivery_note` (0054 — new, not yet called by any TS code) | contra (1220) + per-line inventory, both OPAQUE RPC params (5C-B will resolve them the same way) | RPC's own `get_my_company_id()` | 5C-B (not built) will use the same resolvers | Yes, once built | Yes, same two upstream paths — **BUT** this RPC additionally re-validates both supplied account ids belong to `v_company` via an explicit `exists(...)` check inside the function itself, closing the "hand-crafted direct RPC call" path for THIS RPC specifically (it cannot close the upstream product/category override gap, which lives outside any RPC) | **LOW (strictest of the group)** | none needed beyond what's already added |

**Root cause, precisely identified (not present in the original CP-5C-A report):** the terminal
write path for every one of these callers is `journal_lines.account_id uuid not null references
public.accounts(id)` — a **plain** FK, from the very first ledger migration (`0004`). This is the
one place a composite fix would close the gap for every caller at once, rather than adding a
per-RPC check like `post_delivery_note` did for itself. **Precedent that this fix is safe and
already proven in this exact codebase**: `opening_stock_batches.offset_account_id` (migration
`0029`) is ALREADY a composite FK to `accounts(company_id, id)` — `accounts` has carried a
`unique (company_id, id)` candidate key since `0029` — so the SAME pattern already exists and
already works for one table; it was simply never extended to `journal_lines`,
`products.*_account_id`, or `product_categories.*_account_id`.

**Verdict: NOT changed in this checkpoint.** Per the instruction ("do not change the underlying
RPC... unless absolutely necessary to make the proposed Delivery Note migration safe") — `post_
inventory_transaction` and `journal_lines` are pre-existing, unchanged by 0050-0054, and closing
this gap for every caller is a genuinely separate, larger migration (verify no bad existing rows,
then swap 3 FK definitions across 2 tables) that does not gate the safety of the Delivery Note
migration set itself (see CROSS-COMPANY ACCOUNT RISK below).

### CROSS-COMPANY ACCOUNT RISK: **LOW — not a blocker**

Exploiting this requires an attacker to **already** (a) hold valid authenticated credentials in
SOME company, AND (b) already know a real, foreign `accounts.id` UUID — not enumerable (RLS blocks
reading another company's `accounts` rows through any normal client path) and not practically
guessable (122-bit random `uuid v4`). Even if achieved, `journal_lines_insert_own_company`'s RLS
`with check` still correctly restricts the inserted row's `company_id` to the attacker's own
company — no row is ever written into another company's ledger, and no other company's amounts
become readable. The blast radius is confined to (i) corrupting the **attacker's own** company's
trial balance/reports with a reference to a foreign account row, and (ii) a minor disclosure of
that foreign account's `name`/`code` label (not amounts, not any other financial data) if a report
ever joins `accounts` without its own company filter. This is real, pre-existing (since migrations
0019/0024/0025, unrelated to and not worsened by 5C), and worth the Phase 7 fix above — but it does
not meet the bar of "a genuine cross-company accounting vulnerability" in the sense of one company
being able to read or alter another company's actual financial records. **`post_delivery_note`
(0054) is the single strictest caller of `post_inventory_transaction` in the entire codebase today**
— it is the only one that re-validates account ownership at all.

## 3. Delivery/invoice concurrency contract — PROVEN, scenario by scenario

Formulas (design doc Part 8, as implemented in `0054`):
```
deliveredQty            = Σ posted DeliveryNoteLine.quantity for the SO line
directlyInvoicedQty     = Σ posted InvoiceLine.quantity for the SO line WHERE NO deliveryNoteLineId
deliveredAndInvoicedQty = Σ posted InvoiceLine.quantity for the SO line WHERE deliveryNoteLineId IS SET  (display only)
physicallyIssuedQty     = deliveredQty + directlyInvoicedQty          (NEVER + deliveredAndInvoicedQty — that would double-count)
remainingToDeliver      = committed = max(0, ordered − deliveredQty − directlyInvoicedQty)
postedFulfilledQty      = Σ posted InvoiceLine.quantity for the SO line, REGARDLESS of deliveryNoteLineId  (5B, unchanged)
remainingToInvoice      = max(0, ordered − postedFulfilledQty − draftInvoicedQty)                          (5B, unchanged)
```
All scenarios below use `ordered = 10`.

| # | Scenario | ordered | directInv | delivered | delivered&Inv | remainToDeliver | committed | remainToInvoice | Result |
|---|---|---|---|---|---|---|---|---|---|
| A | direct invoice 4 → DN 6 | 10 | 4 | 0 | 0 | 6 | 6 | 6 | DN 6 **ALLOW** (=remaining exactly) |
| B | DN 4 → invoice-from-DN 4 → DN 6 | 10 | 0 | 4 | 4 | 6 (unchanged by the invoice) | 6 | 6 (after the invoice posts) | DN 6 **ALLOW**; the invoice-from-DN step does **NOT** move remainToDeliver — proves no double subtraction |
| C | DN 4 → direct invoice 3 → DN ? | 10 | 3 | 4 | 0 | 3 | 3 | 3 | DN max = **3** (DN 4 would be **REJECT** — "only 3 remain") |
| D | DN 4 → DN 3 | 10 | 0 | 7 | 0 | 3 | 3 | 10 | DN 3 **ALLOW**; matches "remaining 3" exactly |
| E | concurrent DN 6 + DN 6 | 10 | 0 | 0→6 | 0 | 10→4 | 10→4 | 10 | Exactly ONE post succeeds (SO-row lock serializes); the second sees remaining=4, **REJECT** ("only 4 remain") — no over-delivery possible |
| F | concurrent direct invoice 6 + DN 6 | 10 | — | — | — | — | — | — | **See CRITICAL FINDING below — NOT safe as-is** |
| G | legacy invoice, no `deliveryNoteLineId` (pre-5C data) | 10 | 4 | 0 | 0 | 6 | 6 | 6 | Identical to A — proves pre-5C invoices need no backfill/migration to behave correctly under the new formula |
| H | invoice created FROM a Delivery Note | 10 | 0 | 4 | 4 | 6 (unchanged) | 6 | 6 | Same proof as B — an invoice-from-DN never re-reduces remainToDeliver, even split across MULTIPLE later invoices of the same DN line (each carries `deliveryNoteLineId`, so each is excluded from `directlyInvoicedQty` every time) |
| I | multiple DN lines for one SO line (DN-1001 3 + DN-1002 2) | 10 | 0 | 5 | 0 | 5 | 5 | 10 | The `sum(...)` in `0054`'s query aggregates across an unlimited number of posted DN rows for the same SO line — proven structurally, not just for 2 |
| J | one DN line → exactly one invoice-line allocation | — | — | — | — | — | — | — | Policy/schema decision (Part 9), not a runtime-provable state: `InvoiceLine.deliveryNoteLineId?` stays a **scalar** field. A DN line's quantity MAY still be split across multiple invoices over time (that remains supported and necessary for partial invoicing — see H); what is disallowed is a SINGLE invoice line drawing from TWO DIFFERENT DN lines. Not yet implementable/testable — invoice-line creation from DNs is 5C-B, not built. |

**DOUBLE-SUBTRACTION CHECK: PASS.** Proven in B/H/I: a delivered-then-invoiced quantity is counted
exactly once (inside `deliveredQty`, via the OTHER-delivery-notes sum in `0054`'s own query) and
explicitly excluded from `directlyInvoicedQty` by the `not (l.value ? 'deliveryNoteLineId')` filter
— regardless of how many separate invoices eventually bill that one delivered quantity, or how many
separate Delivery Notes contribute to one SO line.

### CRITICAL FINDING — scenario F: `create_invoice_from_sales_order` (0049) does not know Delivery Notes exist

`post_delivery_note` (0054) correctly re-derives `remainingToDeliver` against **both** other posted
Delivery Notes AND directly-invoiced quantity. But `create_invoice_from_sales_order` (0049 — **live,
already applied**, a Phase 5B artifact this checkpoint does not modify) re-derives its own "taken"
quantity **only** against other invoices — it has no knowledge that `delivery_notes` will exist,
because it predates Phase 5C entirely. Traced precisely, **not merely as a race, as a plain
sequential defect**:

```
1. DN 6 posted against a 10-unit SO line (deliveredQty = 6, remainingToDeliver = 4).
2. create_invoice_from_sales_order(so, [{lineId, qty: 10}]) — 0049's own "taken" check sees
   0 existing invoice-line qty (it never looks at delivery_notes) → ALLOWS a draft for the FULL
   10 units, not just the 4 that should remain.
3. invoiceService.postInvoice() posts that draft — it never locks the SO row or re-checks
   anything against delivery_notes either (confirmed by reading the function: it posts the
   invoice's own already-fixed line quantities unconditionally).
4. Result: deliveredQty(6) + directlyInvoicedQty(10) = physicallyIssuedQty(16) > ordered(10).
   A genuine over-issue — 6 units physically dispatched via the DN, plus a 10-unit invoice on
   top, for an order of 10.
```

This is **not a defect in `post_delivery_note` itself** — 0054 remains internally sound; the gap
runs the *other* direction (an invoice over-committing against already-delivered stock). It cannot
be closed by anything in the 0050-0054 migration set alone, because the fix belongs inside 0049's
own function body — a live, already-applied Phase 5B RPC that CP-5C-0 explicitly forbade reopening
without separate, explicit authorization.

**Recommended fix (NOT authored, pending approval):** a narrow, additive `create or replace
function public.create_invoice_from_sales_order` migration that also subtracts posted
`delivery_notes` line quantity from its own "taken" computation — fully backward compatible (when
no `delivery_notes` rows exist, the subtraction is 0, byte-identical to today's behaviour). This
would need its own migration number (proposed `0055`, authored only on explicit instruction) and
its own dedicated review, since it edits a live, applied function.

**This finding is now documented directly inside `0054`'s own migration file header** (a prominent
banner, not a footnote) so anyone reading the RPC in isolation sees the limit of what it guarantees.

**CONCURRENCY: PASS for scenarios A-E, G-J (0054's own logic, proven above) / gap identified in F
(a cross-RPC interaction with the pre-existing 0049, not a defect in 0054 itself).** Not a reason to
withhold 0050-0054 from being applied as inert schema — but Delivery Notes must **not** go into real
use (5C-B must not ship) until this companion question is resolved, one way or another.

## 4. RPC composition (`post_delivery_note` → `post_inventory_transaction`) — VERIFIED

Documented in full, property by property, directly inside `0054`'s own header comment (not
duplicated here in full — see the migration file): transaction atomicity (one implicit transaction,
no nested transaction, no savepoint), `SECURITY INVOKER` behaviour (both functions run as the
calling user throughout, no `SECURITY DEFINER` introduced), `search_path` behaviour (each function
independently pins its own), RLS behaviour (every table read/written enforces its own policy against
the same calling user in both the outer and inner call), lock ordering (`delivery_notes` row →
`sales_orders` row → `products` rows in `order by id`, no cycle possible with any other caller of
`post_inventory_transaction`), error propagation (an uncaught exception in the inner call aborts the
whole outer transaction, exactly as a direct top-level failure would), posting-key/idempotency
(one deterministic key, `post_inventory_transaction`'s own `inventory_transaction_log` UNIQUE
constraint is the mechanism, `0054`'s own `status <> 'draft'` guard is a second, earlier layer),
journal ownership (`post_inventory_transaction` is the SOLE writer of `journal_entries`/
`journal_lines`; `0054` never inserts into either), `stock_movements` evidence fields
(`source_document_type = 'delivery_note'`, `source_document_id` = the DN's own id,
`source_document_line_id` = the individual DN line's id — never the Sales Order's), no
nested-transaction assumption (confirmed — no `dblink`/`pg_background`/cross-transaction mechanism
anywhere), and no possibility of a partially-posted Delivery Note (the ONLY write to
`delivery_notes.status` is the single final `update`, strictly after `post_inventory_transaction`
has already returned successfully — proven structurally, and now also asserted by a contract test).

**RPC COMPOSITION: PASS.** New contract tests added (`deliveryNotesMigrations.test.ts`): the
status-flip `update` textually occurs AFTER the engine call in the SQL source (no partial-post),
`0054` writes no `journal_entries`/`journal_lines` rows itself, and `0054`'s evidence fields are
stamped to the Delivery Note and its own line — never the Sales Order or its line.

## 5. Account 1220 — VERIFIED

- **Unused, re-confirmed read-only**: `select count(*) from public.accounts where code = '1220'` = 0 (live project, 2026-09-04).
- **Classification/normal balance**: `asset` / `debit` — consistent with the Chart of Accounts convention (matches `1200`/`1210`'s own classification), and with the reporting engine.
- **Balance Sheet**: `calculateBalanceSheet()` (`src/features/reports/financialStatements/services/calculateBalanceSheet.ts`) classifies every account purely by `account.type`/`account.subType` — no hardcoded account-code list, no current/non-current split at all (confirmed by reading the function in full). `1220` requires **zero** reporting-engine change to appear correctly as an ordinary asset line, sorted by code, alongside `1200`/`1210`.
- **`reconcileInventory()` exclusion, confirmed**: the function (`src/features/inventory/services/reconcileInventory.ts`) resolves ONLY `accounts.getAccountId('INVENTORY')` (1200) and `('INVENTORY_IN_TRANSIT')` (1210) for its GL-tie checks — confirmed by reading the function in full, no other account key is ever referenced. `1220` is **structurally excluded** from the "physical stock vs GL 1200" reconciliation and can never be swept into it by accident. The distinction the user required is preserved by construction: GL 1200 = physical stock still on hand; GL 1220 = cost of goods physically delivered but not yet invoiced — two different reconciliation targets, never conflated.
- **Minor forward note (not a 5C-A defect)**: `reconcileInventory()`'s movement-evidence-completeness check (`LINE_ID_REQUIRED`) does not yet include `'delivery'` as a movement type requiring `source_document_line_id` — harmless today (0050-0054 create no `stock_movements` rows, nothing applied), but worth adding when 5C-B starts producing them. Logged as a suggestion.

**1220 ACCOUNT: PASS. GL 1200 RECONCILIATION: UNCHANGED.**

## 6. Posted Delivery Note immutability contract

**No DB-level trigger added** (per instruction) — this is the exact, explicit contract 5C-B's
application layer must enforce, mirroring `updateInvoice`'s `ACCOUNTING_RELEVANT_FIELDS` guard:

**Immutable once `status = 'posted'`** (editing any of these after posting would make the document
disagree with its own already-written `stock_movements`/`journal_lines` evidence):
- `salesOrderId` — the relationship the posted GL entry and stock movements were computed against.
- `customerId` — denormalized identity of a posted document.
- `warehouseId` — the physical location `stock_movements.warehouse_id`/the WAC blend were computed against.
- `deliveryDate` — this IS `movement_date` on the resulting `stock_movements` rows (0054 passes it straight through); changing it after posting would desynchronize the document from its own immutable movement evidence.
- `line_items` (quantities, products, `salesOrderLineId` links) — the exact fields the posted `stock_movements`/`journal_lines` were computed from.
- `journalEntryId` — set BY the RPC at posting; must never be cleared or reassigned by later application code — it is the anchor connecting the document to its GL evidence.
- `deliveryNoteNumber` — kept immutable for consistency with every other posted document (it is already referenced inside the journal memo and audit log by the time posting completes).

**Remains editable after posting** (no accounting relevance, matches every other posted document's own convention, e.g. a posted Invoice's `notes` field):
- `notes` only.

**Correction workflow — explicit, never mutation:**
- A **posted** Delivery Note can never be edited or un-posted via `UPDATE`. A **draft** one remains
  freely editable/cancellable exactly as Part 3 already specifies — nothing changes there.
- If a posted Delivery Note needs correcting **before** any invoice has referenced its lines: the
  **Return Note** mechanism (Part 15, deferred to 5D) is the intended path — `DR Inventory / CR
  Goods Delivered Not Invoiced`, the mirror-image of the delivery, via a **NEW** document + NEW
  `stock_movements` + NEW journal entry, never touching the original posted row. This exactly
  mirrors how `issueCreditNote()` already corrects a posted Invoice (a new document reversing the
  old one, never editing it).
- **The mechanical building block for this already exists and needs no new engine work**:
  `reverse_inventory_transaction` (0031, unchanged) already negates every movement of a prior
  posting and reverses its journal entry via the swap-debit-credit rule, keyed by the ORIGINAL
  posting key. A future `reverse_delivery_note`-style wrapper (not built, not proposed as a file
  here) would call it exactly as `postingKey = 'delivery_note:<id>:post'`,
  `originalPostingKey` = the same — the identical shape 5B/5C's other reversal paths already use.
  No new reversal mechanism needs inventing.
- If correction is needed **after** an invoice has already cleared some/all of the delivered
  quantity into COGS: this becomes a genuine cross-document problem (the invoice's own COGS leg
  referenced the DN's frozen cost) — explicitly OUT OF SCOPE for 5C, belongs with the Return-Note/
  Credit-Note interaction design (Part 15/5D), not solved here.

**POSTED-DN IMMUTABILITY CONTRACT: defined above — application-layer enforcement (5C-B), no DB trigger, correction via a future symmetric reversal RPC reusing the existing `reverse_inventory_transaction` primitive, never via mutation of the posted row.**

## Gate at CP-5C-A HARDENING

tsc ✅ · eslint `--max-warnings 0` ✅ · **2383 tests / 311 files** ✅ (was 2377/311 — **+6 net
tests**, migration-contract file grew from 29 to 35 assertions covering the renumbered/hardened
migration set, zero regressions) · `vite build` ✅.

**Database writes: NONE. Migrations applied: NONE (0050-0054 authored only, renumbered from the
original 0050-0053). Accounting logic changed: NO (`post_inventory_transaction` remains
byte-unchanged; `create_invoice_from_sales_order` (0049) is UNCHANGED — the scenario-F gap is
flagged, not silently patched). 5C-B: NOT started. Commits/pushes/deploys: NONE.**

**STATUS: CP-5C-A HARDENING complete. Company-safe FKs upgraded. Full caller audit delivered,
cross-company risk assessed LOW (not a blocker). A genuine, non-cross-company over-issue gap found
in the 0049↔Delivery-Note interaction (scenario F) — flagged prominently, not fixed at this point,
resolved below via 0055. RPC composition verified property-by-property. Account 1220 verified
correctly isolated from GL 1200 reconciliation. Posted-DN immutability contract defined for 5C-B.**

---

# CP-5C-A FINAL — SCENARIO F RESOLVED (0055, 2026-09-04)

**This is NOT a Phase 5B reopening. Phase 5B remains COMPLETE** — its own worked example,
invariants, and shipped behaviour (`docs/SALES_FULFILMENT.md`) are unchanged and fully preserved.
`0055` is a **Phase 5C compatibility amendment** to the Phase 5B invoice RPC: Phase 5C introduces a
SECOND source of physical fulfilment (posted Delivery Notes) that did not exist when `0049` was
authored and reviewed; `0049` could not, and did not, account for a source of physical departure it
had no knowledge of. `0055` `create or replace`s the SAME function (same name, same signature) to
teach it about that second source — nothing else about it changes.

## The fix

`create_invoice_from_sales_order` (0049 → 0055) now computes, for every **direct** (no
`deliveryNoteLineId`) selection:

```
directlyInvoicedQty (write-time reservation)  = Σ non-void (draft+posted) invoice-line qty for the
                                                  SO line WHERE the line carries NO deliveryNoteLineId
deliveredQty                                   = Σ posted Delivery Note line qty for the SO line
remainingToDeliver                             = max(0, orderedQty − deliveredQty − directlyInvoicedQty)
```
and rejects the selection unless `requestedQty ≤ remainingToDeliver`. This is the SAME formula
`post_delivery_note` (0054) already used — now applied symmetrically on the invoice-creation side.

For a **delivery-linked** selection (`deliveryNoteLineId` present — the future 5C-B "invoice this
delivery" workflow), validation is instead against that SPECIFIC Delivery Note line's own remaining-
to-invoice quantity (`dnLineQty − Σ non-void invoice-line qty already linked to that exact DN line`)
— entirely independent of `remainingToDeliver`, because the physical event already happened at
delivery. The created invoice line is stamped with `deliveryNoteLineId`, so it is excluded from
`directlyInvoicedQty` in every future computation — the double-subtraction guard (proven below).

## PHYSICAL FULFILMENT FORMULA (exact, as implemented in both 0054 and 0055)

```
deliveredQty          = Σ posted DeliveryNoteLine.quantity for the SO line
directlyInvoicedQty   = Σ non-void invoice-line qty for the SO line WHERE NO deliveryNoteLineId
                         (0054/0055's write-time check: draft+posted, matching Phase 5B's own
                          reservation semantics; the read-side TS selector, once 5C-B builds it,
                          uses posted-only — see the distinction below)
physicalFulfilledQty  = deliveredQty + directlyInvoicedQty
remainingToDeliver     = max(0, orderedQty − physicalFulfilledQty)
```

**`remainingToInvoice` is explicitly NOT changed and NEVER made equal to `remainingToDeliver`** —
they answer different questions, exactly as Phase 5B already established:

```
remainingToInvoice = max(0, orderedQty − postedFulfilledQty − draftInvoicedQty)   (UNCHANGED, Phase 5B)
  where postedFulfilledQty counts EVERY posted invoice line for the SO line, REGARDLESS of
  deliveryNoteLineId — invoicing a delivered quantity still reduces remainingToInvoice, exactly as
  invoicing a direct quantity always has.
```
Worked example, proven (ordered 10, delivered 7, invoiced 4): `remainingToDeliver = 10 − 7 − 0 = 3`;
`remainingToInvoice = 10 − 4 − 0 = 6`. A delivered quantity can sit un-invoiced — this is valid, and
`0055` never collapses the two concepts.

**One important, deliberate nuance**: `0055`'s own write-time `directlyInvoicedQty` (used for the
`remainingToDeliver` REJECT/ALLOW decision at invoice-CREATION time) counts **draft+posted** — this
is NOT the same number as the design doc's original Part 8 read-side `directlyInvoicedQty` (posted-
only, used by the future TS `physicalFulfilledQty` selector). The draft-inclusive version is
deliberately STRICTER, preserving Phase 5B's own RACE 3 protection (two concurrent invoice DRAFTS
must not collectively exceed capacity) exactly as `0049` always required. Both concepts share a name
in prose; the SQL keeps them as distinct variables (`v_taken_direct` vs. the read-side concept) to
avoid conflating a write-time reservation guard with an accounting-truth read formula.

## Double-subtraction & the 18-scenario proof

Every scenario from the brief is now a **runnable, passing test** —
`src/repositories/deliveryNotesMigrations.test.ts`, describe block "CP-5C-A quantity matrix — formal
proof (18 scenarios)" — local, test-only pure functions reimplementing the exact SQL arithmetic (no
new service or UI module; nothing exported from any `src` feature). Representative results:

| # | Scenario | Result |
|---|---|---|
| 1 | ordered 10, delivered 0, direct 0, request direct 10 | **ALLOW** |
| 2 | ordered 10, delivered 6, direct 0, request direct 10 | **REJECT** (the scenario-F fix itself) |
| 3 | ordered 10, delivered 6, direct 0, request direct 4 | **ALLOW** |
| 4 | ordered 10, delivered 6 (4 of it also invoiced), request direct 4 | **ALLOW**, total physical fulfilment 10 ≤ 10 |
| 5 | ordered 10, delivered 6, direct 4, request direct 1 | **REJECT** |
| 6 | ordered 10, delivered 4, direct 3, request DN 3 | **ALLOW** (0054, unchanged) |
| 7 | ordered 10, delivered 4, direct 3, request DN 4 | **REJECT** |
| 8 | ordered 10, DN 4, invoice-from-DN 4 | remainingToDeliver=**6**, remainingToInvoice=**6** |
| 9 | ordered 10, DN 7, invoice-from-DN 4 | remainingToDeliver=**3**, remainingToInvoice=**6** |
| 10 | ordered 10, direct invoice 4 | remainingToDeliver=**6**, remainingToInvoice=**6** |
| 11 | legacy invoice, no `deliveryNoteLineId` | identical to #10 — no backfill needed |
| 12 | draft invoice | does NOT count as physical fulfilment |
| 13 | draft Delivery Note | does NOT count as physical fulfilment |
| 14 | concurrent DN 6 vs direct invoice 6 (RACE 1) | exactly one wins; the loser re-derives and is capped at the true remainder |
| 15 | concurrent invoice vs invoice (RACE 3) | Phase 5B protection preserved — formula reduces byte-identically to 0049's original when `deliveredQty=0` |
| 16 | concurrent DN vs DN (RACE 4) | 0054's own protection, untouched |
| 17 | company isolation | enforced entirely by SQL `company_id` filters (structural, proven in the SQL-contract tests) |
| 18 | attempted double count of a delivered-and-invoiced quantity | proven NOT to happen — the exclusion filter is load-bearing and its absence is shown to change the result |

**DOUBLE COUNT PROTECTION: PASS.**

## Locking / concurrency, re-proven for the full pair (0054 + 0055)

Both lock the **identical** `sales_orders` row (`where id = ... and company_id = v_company for
update`) — the single shared mutex. Neither locks an `invoices` or `delivery_notes` row directly
(only aggregate reads, protected by holding the SO lock throughout). No lock-ordering cycle is
possible: `0054` locks its own `delivery_notes` row THEN the SO row; `0055` locks ONLY the SO row —
neither ever waits on a resource the other holds while ALSO holding something the other needs.

- **RACE 1** (DN 6 vs direct invoice 6, concurrent): proven (test 14) — one transaction wins the SO
  lock, posts/creates against a remaining of 10; the second blocks, then re-derives against the
  NOW-committed remaining of 4, and is rejected if it still requests 6.
- **RACE 2** (existing DN 4, then DN 4 vs direct invoice 4, concurrent): same mechanism — one
  succeeds against a remaining of 6, the other re-derives and is capped by the true remainder.
- **RACE 3** (two concurrent direct invoices): Phase 5B's own original protection, UNCHANGED —
  `v_taken_direct` still counts draft+posted under the same SO row lock (test 15).
- **RACE 4** (two concurrent Delivery Notes): entirely `0054`'s own, unmodified contract (test 16).

**CONCURRENCY DN ↔ INVOICE: PASS. CONCURRENCY INVOICE ↔ INVOICE: PASS. CONCURRENCY DN ↔ DN: PASS.**

## Company safety (0055)

Every new query filters explicitly by `company_id = v_company`: the direct-path `v_taken_direct`
and `v_delivered` aggregates, the delivery-linked path's `v_dn_line` lookup and `v_dn_line_taken`
aggregate. No cross-company relationship can satisfy any quantity calculation. **COMPANY ISOLATION:
PASS.**

## The 0050-0055 changeset, reviewed as one unit

| Migration | Depends on (CREATE-time, hard) | Depends on (runtime only) | Idempotent / rollback |
|---|---|---|---|
| `0050` prereq composite keys | none | — | `ADD CONSTRAINT` has no `IF NOT EXISTS` in Postgres — matches `0037`'s own precedent exactly (not a new weakness); Supabase's migration-tracking prevents double-apply |
| `0051` `stock_movement_type` value | none | — | `ADD VALUE IF NOT EXISTS` — idempotent; enum values can't be dropped (same accepted limitation as `0021`/`0048`) |
| `0052` `delivery_notes` table | **`0050`** (composite FK targets must exist) | — | `CREATE TYPE`/`CREATE TABLE` — not idempotent, matches every other table-creating migration in this codebase (`0029`, `0038`-`0041`) |
| `0053` `1220` account seed | none | — | `INSERT ... WHERE NOT EXISTS` — idempotent, matches `0045` |
| `0054` `post_delivery_note` RPC | **`0052`** (references `public.delivery_notes` directly — must exist for the function to compile under `check_function_bodies`) | `0051` (a real `'delivery'` posting only succeeds once committed), `0053` (needs a real `1220` id to be passed by the caller) | `CREATE OR REPLACE FUNCTION` — inherently re-appliable |
| `0055` delivery-aware invoice RPC | **`0052`** (same reason) | none beyond what `0049` already required | `CREATE OR REPLACE FUNCTION` — inherently re-appliable |

**MIGRATION ORDER: PASS** — the current file order (`0050→0051→0052→0053→0054→0055`) satisfies
every hard CREATE-time dependency and every runtime dependency. `0054` and `0055` do not depend on
each other (neither calls the other in SQL) — both independently depend only on `0052` — but are
sequenced adjacently for coherent review, matching how they are jointly proven above.

**Historical compatibility, reconfirmed for the pair:** `deliveredQty ≡ 0` (true for every
pre-Delivery-Note SO/invoice, forever, unless a Delivery Note is later posted against it) makes
`0055`'s new formula reduce byte-identically to `0049`'s original `ordered − taken` — proven by test
15/11. No historical invoice, journal, or stock movement is read, written, or reinterpreted by
`0055`. No Delivery Note is fabricated for legacy data (unchanged from CP-5C-0's own Part 14
decision).

## Gate at CP-5C-A FINAL

tsc ✅ · eslint `--max-warnings 0` ✅ · **2417 tests / 311 files** ✅ (was 2383/311 — **+34 net
tests**, `deliveryNotesMigrations.test.ts` grew from 35 to 69 assertions covering `0055` and the
formal 18-scenario proof, zero regressions, zero skipped/weakened tests) · `vite build` ✅.

**Database writes at authoring time: NONE. Service code: NONE. UI code: NONE. Accounting logic
changed: NO (`post_inventory_transaction` remains byte-unchanged; `0049`'s BEHAVIOUR is unchanged
for every case with `deliveredQty=0` — proven, not asserted). Phase 5B: COMPLETE, NOT reopened —
`0055` is a Phase 5C compatibility amendment to a Phase 5B RPC, not a revision of Phase 5B's own
design or invariants.**

---

# CP-5C-A APPLIED + LIVE-VERIFIED (2026-09-04)

Migrations `0050`-`0055` were applied, in order, to the live project `bcaffvpibpitpuqglszn` (the
same development project this entire engagement has used) after confirming it was the correct
target (`list_migrations` showed `0049` as the latest applied — the expected predecessor).

## Live schema verification

| Check | Result |
|---|---|
| `sales_orders_company_id_id_key` / `customers_company_id_id_key` exist | ✅ both present |
| `'delivery'` in `stock_movement_type` | ✅ present |
| `delivery_notes` table | ✅ 13 columns, 8 constraints, 8 indexes, RLS enabled, 1 policy |
| `1220` account, every company | ✅ 3/3 companies, all `asset`/`debit`/active |
| `post_delivery_note` function | ✅ exists, `SECURITY INVOKER` (`prosecdef = false`), granted to `authenticated` only (not `anon`) |
| `create_invoice_from_sales_order` function | ✅ upgraded — body confirmed to contain `deliveryNoteLineId` and `v_taken_direct` (the new delivery-aware logic), still `SECURITY INVOKER` |

## Live rollback-wrapped end-to-end smoke test

A full transaction — impersonating a real active company profile via `set_config('request.jwt.claims', ...)` / `set local role authenticated` (so RLS and `get_my_company_id()` behaved exactly as a
real client call would) — built a temporary Sales Order (10 units) and Delivery Note (6 units) using
real company/customer/warehouse/product/account ids, exercised every RPC path, and was then
**rolled back in full** (`ROLLBACK` as the final statement — confirmed after the fact: `sales_orders`,
`customers`, `invoices`, `journal_entries`, `stock_movements` row counts and the trial balance were
all byte-identical to the pre-test baseline; `delivery_notes` count = 0; zero leftover rows).

| Test | Action | Result | Evidence |
|---|---|---|---|
| A | Post the Delivery Note (6 units) | **ALLOWED** | `stock_movements`: `type=delivery, qty=-6, unit_cost=1141.551 (current WAC, frozen), total_cost=6849.31, source_document_type=delivery_note`. Journal: `status=posted`, `Σdebit − Σcredit = 0.00` (balanced) |
| B | Re-post the SAME (now posted) DN | **REJECTED (correct)** | `"delivery note DN-TEST-5C-SMOKE is posted — only a draft can be posted"` — double-post guard proven live |
| C | Direct invoice for the FULL 10 units (6 already delivered) | **REJECTED (correct — the scenario-F fix itself, live)** | `"cannot invoice 10.000 ... only 4.000 remain to invoice directly (6 already delivered, 0 already directly invoiced)"` |
| D | Direct invoice for exactly 4 (the true remainder) | **ALLOWED (correct)** | draft invoice created, `total=2000.00` |
| E | Delivery-linked invoice for the 6 delivered units | **ALLOWED (correct)** | draft invoice created, `total=3000.00` |
| F | A further delivery-linked invoice for +1 against the now-exhausted DN line | **REJECTED (correct)** | `"only 0.000 remain to invoice on that delivery"` — the double-subtraction guard proven live |

**Every one of the six live tests matched its design-time prediction exactly.** Scenario F is
confirmed fixed against the real database, not merely proven by unit tests against reimplemented
formulas.

## Post-apply integrity

Security advisors (`get_advisors(security)`): **86 findings, ALL `WARN`, ZERO `ERROR`.** The one
`delivery_notes`-specific entry (`auth_allow_anonymous_sign_ins`) is the SAME pre-existing WARN
class every other company-scoped table in this project already carries — not a new or
delivery-note-specific issue. Local gate re-run after apply (no app code changed, confirmed
unchanged): tsc ✅ · eslint ✅ · **2417 tests / 311 files** ✅ · build ✅.

**Database writes: the six migrations (schema/RPC only — no business data rows). Migrations
applied: `0050`, `0051`, `0052`, `0053`, `0054`, `0055` — all six, live on `bcaffvpibpitpuqglszn`.
Live smoke-test writes: NONE persisted (transaction rolled back, confirmed by post-rollback row
counts). Service code: NONE. UI code: NONE. Accounting logic changed: NO (proven live, not just by
static contract). Phase 5B: COMPLETE, NOT reopened.**

**STATUS: CP-5C-A COMPLETE — APPLIED + LIVE-VERIFIED. Scenario F RESOLVED, confirmed against the
real database. 5C-B (service/UI implementation) is the next, separately-scoped phase.**

---

## Cross-references

- `docs/SALES_FULFILMENT.md` — Phase 5A/5B (complete, shipped). This document is additive on top.
- `docs/ACCOUNTING_RELATIONSHIPS.md` — Q3 (Invoice posting), the GRNI precedent (§ purchase-side
  3-way match), and now this design's mirror of it.
- `docs/INVENTORY_ARCHITECTURE.md` — STOCK COMMITMENT section; Part 8's formula is the next
  evolution of that section, not yet applied.
- `docs/LEDGER_ARCHITECTURE.md` — the GRNI pattern this design mirrors.
- `docs/KNOWN_ISSUES.md` — new CP-5C-0 entries (see the final report).

**STATUS: CP-5C-0 design complete, APPROVED. CP-5C-A schema + DB safety AUTHORED, HARDENED,
scenario F RESOLVED, and — as of 2026-09-04 — APPLIED to the live project + VERIFIED (migrations
0050-0055, plus a full rollback-wrapped end-to-end smoke test proving the scenario-F fix live —
see "CP-5C-A FINAL" below for the exact evidence). 5C-B (service/UI implementation) is the next,
separately-scoped phase.**
