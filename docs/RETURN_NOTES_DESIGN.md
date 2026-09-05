# Return Notes — Phase 5D design record

**Status: COMPLETE, applied live 2026-09-05** (migrations 0056–0058, project `bcaffvpibpitpuqglszn`).

## The gap this closes

Credit Notes already fully cover returning **invoiced** goods (COGS/VAT/AR/stock all
reverse correctly, over-return and double-credit are both guarded, live-tested — see
`docs/ACCOUNTING_RELATIONSHIPS.md`). The genuine remaining gap, precisely identified by
the 2026-09-05 completion audit: goods that were physically **delivered** (a posted
Delivery Note) but **not yet invoiced**. There was no document for "the customer sent
some of this back before we ever billed them" — a Credit Note structurally cannot cover
it (there is no invoice to credit against).

Lifecycle, depending on whether the goods were invoiced:

```
SO → DN → Return Note                 (delivered, not yet invoiced — THIS document)
SO → DN → Invoice → Credit Note       (already invoiced — existing, unchanged)
```

## Accounting treatment

A Delivery Note posts:

```
DR 1220 Goods Delivered Not Invoiced
CR 1200 Inventory
```

A Return Note posts the exact reversal, at the frozen cost the goods left at:

```
DR 1200 Inventory
CR 1220 Goods Delivered Not Invoiced
```

No revenue, no AR, no VAT, no customer refund — there was never an invoice, so there is
nothing to reverse on the sales side. This is a pure inventory reclassification.

## Return quantity model

Scoped to the **Delivery Note line**, not the Sales Order line — a return always traces
to the specific physical dispatch it reverses:

```
deliveredQty            = the Delivery Note line's own quantity
invoicedQty             = Σ non-void invoice-line qty carrying THIS EXACT deliveryNoteLineId
alreadyReturnedQty      = Σ POSTED return-note-line qty against THIS EXACT deliveryNoteLineId (other return notes)
returnableUninvoicedQty = max(0, deliveredQty − invoicedQty − alreadyReturnedQty)
```

Worked example: delivered 10, invoiced 6, previously returned 1 → returnable 3.

## Historical cost, not current WAC

The return **must** reverse at the cost the goods left at, not today's (possibly
since-moved) weighted-average cost. `post_return_note` (0058) reads the exact
`stock_movements` row `post_delivery_note` (0054) wrote for that Delivery Note line
(`source_document_type = 'delivery_note'`, `source_document_line_id = <DN line id>`) and
passes its `unit_cost` as an explicit `unit_cost_override` to the existing `return_in`
costing mode (already supported since migration 0032 — no engine change needed). If no
such evidence exists for a line that claims a `deliveryNoteLineId` link, the RPC raises
rather than guessing.

## Schema (0056–0058)

- **0056** — adds the `return_note` value to `stock_movement_type` (its own migration;
  `ALTER TYPE ... ADD VALUE` can't share a transaction with other DDL).
- **0057** — `return_notes` table. Same shape as `delivery_notes`: `line_items jsonb`
  authoritative, no priced header totals, `draft → posted → cancelled` lifecycle.
  `delivery_note_id` / `sales_order_id` / `customer_id` / `warehouse_id` are all
  COMPOSITE FKs from the first migration (every referenced table already carried a
  `(company_id, id)` candidate key — no 0050-style prerequisite needed this time).
  `warehouse_id` is stored but the RPC independently verifies it matches the source
  Delivery Note's own warehouse — a return can never target the "wrong" warehouse by
  construction.
- **0058** — `post_return_note(p_return_note_id, p_contra_account_id, p_line_accounts, …)`,
  the atomic posting RPC. Locks the Return Note row, then the Delivery Note row
  (serialises concurrent returns against the same delivery). Re-derives the returnable
  formula fresh inside the transaction. Calls the existing, unchanged
  `post_inventory_transaction` — no engine duplication.

## What this does NOT do (documented, deliberate scope boundary)

The SO-line-level `remainingToDeliver`/`remainingToInvoice` read model
(`salesOrderFulfilment.ts`) and `post_delivery_note`'s own `deliveredElsewhere`
aggregate are **unchanged** — a posted Return Note does not currently net back into "how
much of this Sales Order line remains to deliver again." Re-delivering
previously-returned-and-not-yet-invoiced stock against the *same* Sales Order line is a
known, narrower follow-on (the same class of cross-RPC compatibility question the
Phase 5C `0055` migration solved for delivery-vs-invoice; solving it for
delivery-vs-return needs the same multi-scenario proof rigor, deliberately not rushed
into this migration set). What Return Notes DO fully and correctly guarantee, proven by
the formula above: no over-return, no returning already-invoiced quantity through this
document, no double-return of the same quantity.

## Application layer

`ReturnNoteService` (`src/features/sales/services/returnNoteService.ts`) mirrors
`DeliveryNoteService` exactly: plain repository writes for draft create/update/cancel
(zero accounting effect), posting always through the atomic RPC via `RpcReturnNotePoster`.
`computeReturnableDeliveryNoteLines` is exported standalone (mirrors
`computeSalesOrderFulfilment`) so the "Create return" page can derive returnable
quantities synchronously from already-fetched delivery-note/invoice/return-note data.

## UI

- **List**: `/sales/return-notes` (`ReturnNotesPage`).
- **Detail**: `/sales/return-notes/:returnNoteId` (`ReturnNoteDetailPage`) — full page,
  price-suppressed line table, stock-movement evidence section, Post/Cancel/Delete
  actions with the same posted-immutability contract as every other document.
- **Create**: `/sales/delivery-notes/:deliveryNoteId/return` (`CreateReturnNotePage`),
  reachable only from a posted Delivery Note's "Create return" action. Full page, not a
  modal/sheet.
- Delivery Note detail page gained a "Returns from this delivery" section and a
  "Create return" action (shown only when the delivery has any returnable quantity).
- Printable document (`returnNoteToBusinessDocument`), global search, navigation
  ("Return Notes" between Delivery Notes and Invoices), and the record-preview
  registries all follow the exact Delivery Note precedent.
