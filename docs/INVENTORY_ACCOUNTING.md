# INVENTORY ACCOUNTING — GL FLOWS, COSTING, RECONCILIATION

**Status:** Phase 3C (hardening) — **migrations 0033–0036 APPLIED** to live Supabase 2026-08-30
(Review 3C-A gate), awaiting Review 3C-B. 0021–0030 APPLIED (Review 3A); 0031/0032 APPLIED (Phase 3).
0033 journal-number allocator, 0034 `5060 Purchase Price Variance`, 0035 round-after-sum + allocator
in both inventory RPCs, 0036 atomic `freeze_stock_take`. All additive; zero Office National data
contamination (`inventory_transaction_log` still 0 rows; all business-table md5s byte-identical
before/after; only additions = 1 `journal_number_counters` seed row + 1 `accounts` row for 5060).
Recorded versions `20260830221042__0033` … `20260830221256__0036`.
Applied filenames are timestamp-prefixed (`20260830155625__0021_...` onward) so filesystem ordering
places them after the historical 0000–0020 migrations; logical numbering is unchanged.
**Parent:** `docs/INVENTORY_ARCHITECTURE.md`. **Governing:** `docs/SA_ACCOUNTING_MASTER_SPEC.md` §22–§24.

All account references are **AccountMappingKeys**, never literal codes or UUIDs. Resolution order for
any inventory-related leg: **product override → product's category → generic key.**

## New AccountMappingKeys (migration 0023)

| Key | Account | Type |
|---|---|---|
| `INVENTORY_ADJUSTMENT` | `5050` Inventory Adjustments | expense |
| `PURCHASE_PRICE_VARIANCE` | `5060` Purchase Price Variance (migration 0034) | expense |
| `INVENTORY_IN_TRANSIT` | `1210` Inventory in Transit | asset |
| `OPENING_BALANCE_EQUITY` | `3950` Opening Balance Equity | equity |

`5050` is for **physical** stock differences (shrinkage, damage, write-offs, stock-take count
variances — the quantity on hand changed). `5060` is for **purchasing economics** — the quantity
did not change, but a supplier settled at a value different from the WAC carrying cost. Reporting
keeps the two distinct.

Existing keys reused: `INVENTORY` (1200), `COGS` (5000), `GRNI` (2050), `AP` (2000),
`VAT_INPUT` (2110), `VAT_OUTPUT` (2100), `AR` (1100), `SALES_REVENUE` (4000).

## Costing — one authoritative model (fork A)

**Weighted Average Cost is authoritative.** FIFO stays in the codebase but is parked (no
`stock_lots` Supabase table this initiative; existing FIFO code untouched, `valuation_method` enum
kept). Every product is `weighted_average` (migration 0025 makes it `NOT NULL DEFAULT`).

- **WAC recompute** happens **only on a stock IN event at a real acquisition cost** — a purchase
  receipt or a supplier-return reversal is *not* a new purchase. Formula (unchanged, one place):

  ```
  newAvgCost = (existingQty × existingAvgCost + receivedQty × receivedUnitCost) / (existingQty + receivedQty)
  ```

  Zero / negative `newQty` → keep the previous `costPrice` (never divide by ≤ 0).
- **Every movement records its own `unit_cost` and `total_cost`** (migration 0022). This makes WAC
  **reconstructable from the ledger** — `recomputeWeightedAverageFromLedger(productId)` walks IN
  movements oldest-first and is the basis of any restatement (with a regression test, unlike Phase 21).
- **Historical unit cost is never rewritten.** A movement keeps the `unit_cost` it was posted at.
- **COGS on a sale / sales return uses the current WAC** at post time (inherent to WAC; documented).
- **Precision house rule:** cost stored `numeric(14,4)`; quantity `numeric(14,3)`; **every GL posting
  and every valuation-report figure is computed the same way** — `roundToCents` per line, then
  `bucketByAccount` reconciles buckets to the control total to the cent. `calculateValuation` /
  `calculateInventoryTotals` are re-implemented in Phase 3/8 to match the GL exactly.
- **Concurrency:** the posting services no longer fan per-line movement calls out with `Promise.all`;
  every line of a document is handed to the engine in ONE `applyInventoryTransaction()` call, applied
  inside a single Postgres transaction. Same-product WAC cannot race: the RPC does
  `SELECT … FROM products … ORDER BY id … FOR UPDATE` before touching cost, so concurrent receipts
  serialise deterministically (Phase 3 fix; `inventoryAccountingMatrix.test.ts` concurrency case).
- **Negative stock under WAC:** a sale that would drive on-hand negative **warns** and is allowed
  (configurable later); COGS posts at current WAC. (FIFO's throw-and-abort is parked with FIFO.)

## GL flows

### Purchase receipt (unchanged, + category split)

```
PO receipt:   DR <category inventory acct | INVENTORY>   Σ ex-VAT line total
              CR GRNI                                     Σ ex-VAT line total
Bill (PO pre-received):  DR GRNI ...  (clears; no stock re-record)
Bill (not pre-received): DR <category inventory acct | INVENTORY> ... + DR VAT_INPUT (deductible) ... / CR AP bill.total
```
Phase 3 wired `purchaseOrderService` / `billService` to `InventoryAccountResolver` — the inventory
leg resolves per line (product override → category → generic `INVENTORY` key), no longer always 1200.
Movements: `goods_received`, `unit_cost` = ex-VAT unit price, `source_document_type='purchase_order'|'bill'`.

### Sale (unchanged)

```
DR AR invoice.total
CR <category revenue | SALES_REVENUE>  bucketed to subtotal
CR VAT_OUTPUT invoice.taxTotal (if > 0)
-- for productId lines, if totalCogs > 0:
DR <category COGS | COGS>       bucketed COGS (current WAC, roundToCents)
CR <category inventory | INVENTORY> bucketed COGS
```
Movement: `sale`, negative delta, `unit_cost` = WAC used, `source_document_type='invoice'`,
`source_document_line_id` set. **Fix:** if no default warehouse resolves, the post **fails loudly**
(today it silently books revenue with no stock movement).

### Credit note (sales return) (unchanged; gated on `reason === 'return'`)

```
DR <category revenue | SALES_REVENUE> bucketed subtotal
DR VAT_OUTPUT taxTotal (if > 0)
CR AR total
-- if reason === 'return' && totalCogs > 0:
DR <category inventory | INVENTORY> bucketed COGS reversal (current WAC)
CR <category COGS | COGS>           bucketed COGS reversal
```
Movement: `sales_return`, positive delta, WAC unchanged. **New guard:** returned qty ≤ invoiced qty
per line.

### Purchase return / supplier return (migration 0029; PPV model — Phase 3C)

Inventory leaves at the **WAC carrying value**. AP/GRNI and input VAT unwind at the **supplier's
actual credit note value**. The difference is a purchasing gain/loss → `PURCHASE_PRICE_VARIANCE`
(5060), never 5050.

```
DR AP  (subtotal + taxTotal)          -- or GRNI, subtotal only, for an un-billed PO receipt (no VAT claimed)
    CR <category inventory | INVENTORY>   Σ (qty × WAC)              -- stock leaves at carrying value
    CR VAT_INPUT                          Σ return line tax          -- un-claim input VAT (AP path only)
    CR PURCHASE_PRICE_VARIANCE            supplier net credit − carrying value   (Dr if carrying > net credit)
```

Worked examples (10 units, WAC R9.00, carrying R90.00):
- supplier net credit R100 → `Dr AP 100 / Cr Inventory 90 / Cr PPV 10`
- supplier net credit R80  → `Dr AP 80 / Dr PPV 10 / Cr Inventory 90`
- with 15% VAT on R100 (total R115) → `Dr AP 115 / Cr Inventory 90 / Cr VAT_INPUT 15 / Cr PPV 10`

Implementation: the engine posts `Dr PPV / Cr <inventory>` at carrying value (contra = PPV); the
service's `extraJournal` adds `Dr AP total / Cr PPV netCredit / Cr VAT_INPUT taxTotal`, which nets
against it so the persisted entry shows only the residual PPV line.
Movement: `purchase_return`, negative delta, `unit_cost` = WAC, `source_document_type='supplier_return'`.
WAC is **not** recomputed.

Each return line is a persistent `supplier_return_lines` row. Where the source is known it retains the
legacy bill / purchase-order JSON-line UUID and a tenant-consistent FK to the goods-received stock
movement; the resulting purchase-return movement uses the new normalized return-line UUID as
`source_document_line_id`. Free-text references are display aids, never the canonical audit link.

### Stock adjustment — write-off / shrinkage / damage / gain / correction (NEW — migration 0027)

```
Loss (write_off/shrinkage/damage):  DR INVENTORY_ADJUSTMENT  |Σ costEffect|
                                    CR <category inventory | INVENTORY>  |Σ costEffect|
Gain (stock_gain):                  DR <category inventory | INVENTORY>  Σ costEffect
                                    CR INVENTORY_ADJUSTMENT              Σ costEffect
```
`costEffect` per line = `quantityDelta × unitCost` (current WAC). One balanced entry per adjustment,
category-bucketed. Movements: `write_off` / `stock_gain` / `correction`, `source_document_type='stock_adjustment'`.
Lifecycle: `draft → (pending_approval) → posted`. `posted` is immutable; a correction is a new
adjustment. `inventory:adjust` permission to create/post.

### Warehouse transfer (NEW — migration 0027)

Company-wide inventory value **unchanged**. With the in-transit leg:

```
Dispatch (status → in_transit):  DR INVENTORY_IN_TRANSIT  Σ line totalCost
                                 CR <from-category inventory | INVENTORY>
Receipt (status → completed):    DR <to-category inventory | INVENTORY>
                                 CR INVENTORY_IN_TRANSIT
```
Movements: `transfer_out` (dispatch, from warehouse), `transfer_in` (receipt, to warehouse).
A single-step transfer (no in-transit tracking) posts nothing and records both movements at once.

### Stock take (migration 0028; atomic freeze — migration 0036)

Lifecycle: `draft → counting → ready_for_review → posted`. **Freeze is a single atomic RPC**
(`public.freeze_stock_take`, migration 0036): the caller supplies SCOPE only
(`stock_takes.scope` ∈ `all|category|items` + `scope_ref`); the RPC locks every scoped product
`FOR UPDATE`, then replaces the take's lines in one `INSERT … SELECT` — `expected_qty` from
`stock_balances` for the take's warehouse, `unit_cost` from `products.cost_price` (frozen WAC).
No caller-supplied `expectedQty`/`unitCost` is trusted, and no unrelated receipt/sale/transfer can
interleave the snapshot. Once frozen, `expected_qty` and `unit_cost` are immutable; `counted_qty`
is the only counting input; posting uses `counted_qty − frozen expected_qty` at the frozen
`unit_cost`.
Posting:

- one `stock_take` movement per non-zero-variance line (`quantityDelta = countedQty − expectedQty`,
  `unit_cost` = frozen WAC);
- **one** balanced GL entry for the **net** variance value:
  net loss → `DR INVENTORY_ADJUSTMENT / CR <inventory>`; net gain → the reverse; category-bucketed.

`posted` is immutable. `inventory:stocktake_post` permission.

### Opening stock batch (NEW — migration 0029)

`draft` batch is populated (manually or by import — **import never confirms it**). Confirming:

1. **Preview** the entry: `DR INVENTORY  Σ totalCost` / `CR OPENING_BALANCE_EQUITY  Σ totalCost`
   (per category on the debit side).
2. Explicit user confirmation.
3. Post the entry + `opening` movements (`unit_cost` per line, `source_document_type='opening_stock_batch'`).

`inventory:opening_stock` permission. This is the only accounting-significant import path and it is
never automatic.

## Persistent source-line evidence

The five new inventory workflows use normalized headers plus persistent lines:
`stock_adjustments` / `stock_adjustment_lines`, `stock_transfers` / `stock_transfer_lines`,
`stock_takes` / `stock_take_lines`, `opening_stock_batches` / `opening_stock_batch_lines`, and
`supplier_returns` / `supplier_return_lines`. JSONB is not canonical line storage.

Every Phase 3 movement records `source_document_type`, the header UUID in `source_document_id`, and
the normalized line UUID in `source_document_line_id`.
Transfer dispatch and receipt movements may point to the same transfer line, with movement type and
warehouse identifying the leg. Stock-take lines permanently retain the frozen expected quantity,
counted quantity, variance, unit cost, and variance value; reconciliation must never reconstruct the
snapshot from today's balance.

## Reconciliation (Phase 3 engine; Phase 14 UI)

- **Phase 3 owns `reconcileInventory()`** in
  `src/features/inventory/services/reconcileInventory.ts` (unit-tested in `reconcileInventory.test.ts`
  and `inventoryAccountingMatrix.test.ts`). The former Phase-14-only plan is superseded. The function
  returns exact quantities, values, and differences (not only pass/fail) across checks A–F: (A) summed
  movement quantities vs `stock_balances`; (B) Σ `stock_balances` vs exposed
  `products.quantity_on_hand`; (C) WAC-valued subledger (ROUND-AFTER-SUM) vs Inventory Asset GL 1200;
  (D) in-transit value vs Inventory in Transit GL 1210; (E) total (1200 + 1210); (F) movement
  source-evidence completeness against a caller-supplied known-refs set. Each `InventoryReconciliationFinding`
  carries `code` / `severity` / product / warehouse / movement / journal / documentRef /
  `expected` / `actual` / `difference` / `detail`. `isReconciled` is true iff no `error`-severity
  finding (negative-stock and missing-evidence are `warning`). Valuation flows through the single
  `roundAfterSumValuation()` in `inventoryValuation.ts` — never sum-of-line-rounded.
- Transfer reconciliation proves three separate equations: warehouse inventory value equals the
  Inventory Asset GL; dispatched in-transit value equals the Inventory in Transit GL; and total
  inventory value equals both asset accounts combined. Immediate same-company transfers remain
  GL-neutral.
- **Rounding residual (Phase 3C bound).** Migration 0035 makes the posting RPC aggregate JE lines
  as `round(Σ raw line, 2)` per account (round‑after‑sum WITHIN a posting), matching the valuation
  contract. So GL 1200 = Σ over inventory‑affecting **postings** of a per‑posting‑rounded amount,
  vs the subledger's single rounding of the grand total. The mathematically‑justified bound is
  therefore `roundingBand = 0.005 × (number of distinct inventory‑affecting postings)` — **per
  posting, not per movement** (0035 collapsed a document's same‑account lines into one rounding).
  A healthy deterministic book with no multi‑posting cent accumulation reconciles to **exactly
  R0.00** (Office National today: R0.00). A `subledger_vs_gl` / `total_inventory_vs_gl` difference
  inside the band is a **`warning`** that exposes `expected` / `actual` / `difference` /
  `toleranceBound` — never hidden, never coerced to R0.00 (spec item 8) — and does NOT set
  `isReconciled = false`; a difference outside the band is an **`error`**.
- **Movement source‑evidence rules BY type (check F, Phase 3C).** No blanket "adjustments /
  corrections are exempt". Document‑generated movements (`goods_received`, `sale`, `sales_return`,
  `purchase_return`, `transfer_in`, `transfer_out`, `write_off`, `stock_gain`, `stock_take`,
  `adjustment`) require `source_document_type` + `source_document_id`, plus `source_document_line_id`
  where a normalized line always exists. `correction` movements require `reversal_of_movement_id`
  **and** source evidence. `opening` is the one documented exception — a legitimate opening movement
  may predate the `opening_stock_batch` workflow (Office National's was a hand‑seeded SQL journal),
  so an `opening_stock_batch` link OR a resolvable reference OR an `OPENING`‑style reference
  satisfies it.
- **In‑transit understands movement chains (check D, Phase 3C).** In‑transit is the EFFECTIVE
  transfer set: `Σ transfer_out − Σ transfer_in`, with a `correction` of a `transfer_out`
  contributing `−(original value)` and a `correction` of a `transfer_in` contributing
  `+(original value)`. `dispatch only` → in transit; `dispatch + receipt` or `dispatch +
  reversal(dispatch)` → zero; `dispatch + receipt + reversal(receipt)` → back in transit. A net
  below zero for a transfer is an **`error`**: `duplicate_transfer_receipt` if a dispatch exists,
  `orphan_in_transit` if none does. The finding names the exact transfer.
- **Books Integrity checks** (`booksIntegrity/checks.ts`, behind `if (products.length > 0)`):
  `checkInventorySubledgerIntegrity`, `checkStockLedgerConsistency` (cached qty vs Σ movements),
  `checkNegativeStock`, `checkOrphanedInventoryMovements` (movement whose `source_document_*` /
  `reference` resolves to nothing), `checkInvoiceLineWithoutCogsMovement`.
- **Phase 14 owns presentation/investigation:** integrate the Phase 3 reconciliation result into the
  Difference Investigator and evidence UI. A ranked/evidence-scored inventory
  `ReconciliationIssueType` remains dependent on genericising the bank-coupled pipeline.

## Immutability & corrections

Every new document follows draft → post → **reverse** (never edit/delete a posted one). Draft lines
may be added, changed, or removed, and an unposted draft header may be deleted through the service;
header deletion removes only its draft lines (`line_items` FK is `ON DELETE CASCADE`). Posted/confirmed
headers and their lines are immutable and non-deletable — **enforced by the service layer**, exactly
as posted invoices/bills/journal entries are guarded today (Review 2C: no inventory-only DB-level
status immutability; that belongs to the future application-wide authorization phase).
`journalEntryService.reverseJournalEntry()` is the only journal correction path; a reversal is a new
entry dated now, open-period-checked, audit-logged. A reversed inventory document also records a
`correction` movement (`reversal_of_movement_id` set, `source_document_type='reversal'`).

**Posted bills are immutable (Phase 3C).** `billService.updateBill` and `billService.voidBill` are
now draft-only (matching posted-invoice behaviour). Correct a posted inventory bill via a supplier
return (which atomically reverses stock + GL) or a journal reversal — never an in-place edit or a
status flip to `void`, which would leave the journal entry and stock movements live.

## Journal numbering (Phase 3C — migrations 0033 + 0035)

One safe architecture: `public.journal_number_counters` (per-company row) + the atomic
`public.allocate_journal_number(company_id)` (row-lock `UPDATE … RETURNING`, seeded once from the
highest existing `JE-<n>` suffix; malformed historic numbers ignored). `create_journal_entry_with_lines`
allocates when the client passes no number; both inventory RPCs call the allocator (migration 0035).
`journalEntryService.nextEntryNumber()` (a `count(*) + 1`) was **deleted** — the number is assigned
at the repository / DB boundary. `MockJournalEntryRepository` applies the identical rule in memory
(`src/features/accounting/utils/journalNumbering.ts`). No historic entry is renumbered.

## Audit (Phase 11)

New `AuditAction` values (the column is `text`, no migration — added to the union in
`src/types/auditLog.ts`): `stock_adjusted`, `stock_written_off`, `opening_stock_set`,
`cost_price_changed`, `stock_take_posted`, `inventory_account_mapping_changed`,
`stock_import_committed`, `supplier_return_posted`. Every new service takes `auditLogService` by DI
and logs after the state change; `reason` mandatory on adjustments / write-offs.

**Phase 3 status:** the posting engine writes the audit row **inside the atomic RPC** (via the
`p_audit` arg) for every workflow that routes through it — the workflow service no longer double-logs.
`ProductCategoryService` now takes an optional audit logger (wired to `auditLogService` in the
singleton) and emits `inventory_account_mapping_changed` from `updateCategory` **only when a
`revenueAccountId` / `cogsAccountId` / `inventoryAccountId` / `adjustmentAccountId` value actually
changes** — a plain rename or a no-op set does not audit (`previousValue` / `newValue` carry just the
changed fields). Permission gating (`inventory:account_map`) is enforced at the route/UI layer in
Phase 4/11. `cost_price_changed` / `stock_import_committed` fire from Phase 6 import code that does
not exist yet.

## Frozen unit cost for issue / return_in (migration 0032)

An `issue` / `return_in` engine line normally values the movement (and its GL leg) at the product's
*current* WAC. A stock take is the exception: its variance must post at the unit cost the count sheet
was **frozen** at, not a WAC that may have moved between freeze and post. `InventoryTransactionLine`
carries an optional `unitCostOverride`; `stockTakeService` passes `line.unitCost` (the persisted
frozen snapshot). The product's WAC is still never moved by these modes. Stock adjustments post at
current WAC (their `line.unitCost` is the WAC snapshot captured at post time, so the two agree).
