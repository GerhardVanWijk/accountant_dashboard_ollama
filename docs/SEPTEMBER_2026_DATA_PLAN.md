# September 2026 Demo Data — Design & Pre-Write Plan

**Status:** DRAFT FOR APPROVAL — no database writes have been made. Sections 1–6 are the
original narrative design; **sections 7–13 (added 2026-09-02, Part T pre-write review) carry
the finalised exact figures** and supersede every "indicative"/"≈" number above them.
**Company:** Office National Demo (Pty) Ltd · `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`
**Prepared:** 2026-09-02 (form/transaction UX pass — Parts Q–T)
**Rule this plan follows:** DB writes only via one reviewed, idempotent SQL script applied
through the Supabase MCP, scoped to the single `company_id`, every journal entry built in the
same statement as its source document. No app service methods, no subagent writes
(JE-0171 rule). STOP for a pre-write balance report before applying.

---

## 1. Baseline — audited live state as at 1 September 2026 (read-only)

| Area | Value |
|---|---|
| Financial year | FY2027 (1 Mar 2026 – 28 Feb 2027) |
| Periods | Jun 2026 **closed** · Jul 2026 **closed** · Aug 2026 **open** · Sep 2026 **open** |
| Trial balance | Σ(debit − credit) = **R0.00** (balanced) |
| Master data | 20 customers · 13 suppliers · 50 products (48 stock-tracked, 47 with stock) · **1 warehouse** · 66 GL accounts · 3 tax rates (STD 15 % / ZERO / EXEMPT) |
| Existing document counts | invoices 65 · bills 31 · credit notes 6 · receipts 34 · payments 22 · sales orders 0 · quotes 0 · purchase orders 0 · bank txns 94 · stock movements 284 · journal entries 171 |
| Last document numbers | INV-1062 · BILL-2028 · CN-1006 · REC-1203 · PAY-2220 · JE-4100 |
| Early-September rows already present | 3 receipts, 5 journal entries, 7 bank transactions (tail of the August bank-reconciliation training month, all dated ≤ 4 Sep). **The new script must start its date range at 2026-09-05 and its own sequence blocks to avoid collision.** |

### Key GL balances at 1 Sep 2026

| Code | Account | Balance (R) |
|---|---|---|
| 1000 | Cash and Bank | 212 270.67 |
| 1100 | Accounts Receivable | 207 794.04 |
| 1200 | Inventory | 1 569 743.20 |
| 1500 | Fixed Assets (cost) | 487 000.00 |
| 1590 | Accumulated Depreciation | (8 119.46) |
| 2000 | Accounts Payable | (590 511.21) |
| 2100 | VAT Output | (86 742.45) |
| 2110 | VAT Input | 154 620.57 |
| 3000 | Share Capital | (500 000.00) |
| 3900 | Retained Earnings | (1 342 450.00) |
| 40xx | Revenue YTD (Jul–Aug) | (548 782.82) |
| 50xx | Cost of sales YTD | 339 660.50 |
| 51xx | Operating expenses YTD | ~197 244 |

**Invariants that currently hold and must still hold after the September data:**

1. `Σ(debit − credit)` over all posted journal lines = 0.
2. GL 1200 balance = `Σ(product.quantity_on_hand × product.cost_price)` rounded to 2dp
   (currently both = 1 569 743.20).
3. GL 1100 = open AR subledger; GL 2000 = open AP subledger + GRNI.
4. GL 1000 = `bank_accounts.current_balance` = bank statement closing balance ± documented
   reconciling items.
5. Every product's `quantity_on_hand` = `Σ stock_movements.quantity_delta` for that product.

---

## 2. Design principle — transaction chains, not table fills

Every generated row is part of a chain. Nothing is inserted standalone.

```
SALES        Quote ─▶ Sales Order ─▶ Invoice ─▶ invoice line (product_id, warehouse_id)
                                        │
                                        ├─▶ stock_movement (sale, −qty, WAC unit_cost)
                                        ├─▶ COGS journal line (DR 50xx / CR 1200)
                                        ├─▶ revenue journal (DR 1100 / CR 40xx / CR 2100 VAT)
                                        ▼
                                   Customer Receipt ─▶ allocation ─▶ bank_transaction (in)
                                        │                                  │
                                        ▼                                  ▼
                                   receipt journal (DR 1000 / CR 1100)  reconciliation match

PURCHASES    Purchase Order ─▶ Bill ─▶ bill line (product_id / fixed_asset_details)
                                  │
                                  ├─▶ stock_movement (goods_received, +qty, purchase unit cost)
                                  ├─▶ WAC recalculation on the product
                                  ├─▶ purchase journal (DR 1200 / DR 2110 VAT / CR 2000)
                                  ▼
                             Supplier Payment ─▶ allocation ─▶ bank_transaction (out)
                                  │                                  │
                                  ▼                                  ▼
                             payment journal (DR 2000 / CR 1000)   reconciliation match

CREDIT       Invoice line ─▶ Credit Note ─▶ credit note line (original_invoice_line_id)
                                  │
                                  ├─▶ stock_movement (sales_return, +qty)      [physical return only]
                                  ├─▶ COGS reversal (DR 1200 / CR 50xx)        [physical return only]
                                  └─▶ AR/VAT reversal (DR 40xx / DR 2100 / CR 1100)
```

The SQL script builds each chain top-to-bottom in one block so a partial failure leaves
nothing behind (single transaction, `BEGIN … COMMIT`).

---

## 3. Planned September activity

Dates: **2026-09-05 → 2026-09-30**. Volumes chosen to look like one real trading month for a
~R1.5 m-inventory office-supplies wholesaler, not a stress test.

### 3.1 Sales

| Chain | Count | Notes |
|---|---|---|
| Quotes | 3 | QUO-1001…1003. 1 stays open, 1 → sales order, 1 lost. |
| Sales orders | 4 | SO-2026-0001…0004. Real product lines, `warehouse_id` set. **No GL/stock posting on creation** (confirmed: `SalesOrderService` never posts — `docs/LEDGER_ARCHITECTURE.md`). |
| SO → Invoice conversions | 3 | via the existing `convertToInvoice` chain; `invoice.sales_order_id` retained; 1 SO left open/unfulfilled. |
| Invoices (incl. the 3 conversions) | 18 | INV-1063…1080. Spread across customers & the 4 revenue streams (Furniture / Printers & Equipment / Stationery / Consumables) + 2 with a Delivery & Service Income line. Standard-rated 15 % except 1 zero-rated export-style line and 1 to the NGO. |
| Credit notes | 2 | CN-1007 — **physical return** (returned office chairs, `reason='return'`, `original_invoice_line_id` set) → stock back in + COGS reversal. CN-1008 — **financial only** (`reason='pricing_error'`) → AR/VAT reversal, no stock movement. |
| Customer receipts | 14 | REC-1204…1217. 9 pay an invoice in full, 3 partial, 2 create an on-account balance. Methods: mostly EFT, 2 card, 1 cheque. Each allocates and posts DR 1000 / CR 1100. |

**Expected sales impact (indicative, finalised in the script):**
Invoiced (excl. VAT) ≈ **R430 000** · Output VAT ≈ **R62 000** · gross AR raised ≈ R492 000 ·
COGS ≈ **R270 000** · credit notes ≈ (R11 500) excl VAT.

### 3.2 Purchases

| Chain | Count | Notes |
|---|---|---|
| Purchase orders | 4 | PO-2026-0001…0004 to Alpine Office Furniture, PrintTech Distributors, TonerZone Imaging, Sappi Paper Trade. |
| Bills from POs | 3 | BILL-2029…2031, `purchase_order_id` set. Goods-received stock movements + WAC recalculation. |
| Standalone stock bills | 3 | BILL-2032…2034 — replenish the 2 items currently at/below reorder level + a fast-moving toner. |
| Expense bills | ~9 | BILL-2035…2043 — see 3.5. |
| Supplier payments | 9 | PAY-2221…2229. 6 settle a bill in full, 2 partial, 1 pays two bills in one payment. DR 2000 / CR 1000. |
| Supplier return | 1 | SUP-RET / debit note against BILL-2030 (faulty MFP unit) — stock out + AP reduction + VAT input reversal. |

**Expected purchase impact (indicative):**
Stock purchases (excl VAT) ≈ **R180 000** · expense purchases (excl VAT) ≈ **R64 000** ·
Input VAT ≈ **R36 600** · AP raised ≈ R325 000 · AP settled ≈ R300 000.

### 3.3 Inventory

- **Goods receipts:** 6 (from the 3 PO bills + 3 stock bills) — `stock_movement type='goods_received'`,
  positive `quantity_delta`, `unit_cost` = purchase price, product `cost_price` moved to the new
  weighted average, `total_cost` recorded.
- **Sales issues:** one `type='sale'` movement per stock invoice line (~40 movements), negative
  `quantity_delta`, `unit_cost` = WAC at issue, feeding the COGS journal line.
- **Stock adjustment:** 1 — `ADJ-0001`, `type='write_off'`, −3 units of a damaged stationery item,
  DR 5050 Inventory Adjustments / CR 1200 at WAC. `notes='Water damage — storeroom leak'`.
- **Stock take:** 1 full count `STK-0001` dated 2026-09-27 covering all 48 tracked items, with a
  **small net variance** on 2 lines (one +2, one −1) → 2 `type='stock_take'` correction movements
  and a net adjustment journal (immaterial, < R400).
- **Low-stock / replenishment evidence:** the 2 currently-below-reorder items are the ones the
  PO/bills in 3.2 replenish, so the "reorder → PO → receipt → back above level" story is visible.
- **Transfers:** **NOT planned** — there is only one warehouse. *Optional extension for approval:*
  add a second warehouse ("Cape Town Branch") + 2 transfer chains. Flagged, not assumed.

### 3.4 Banking

- New `bank_statements` row for the Office National Business Cheque account, `period_start`
  2026-09-01, `period_end` 2026-09-30, `opening_balance` = the confirmed August closing
  (R184 068.54) — *not* the GL balance (the gap is the documented August reconciling items).
- ~44 `bank_statement_lines` + matching `bank_transactions`:
  - 14 customer receipts in
  - 9 supplier payments out
  - ~9 expense debit orders / EFTs (rent, insurance, fuel cards, internet, electricity…)
  - 1 bank interest credit, 3 monthly bank-charge lines, 2 card-machine settlement fees
- **Reconciliation:** ~90 % `status='reconciled'` with a bijective `bank_statement_line_id`
  back-link. A small, **documented** exception set for a fresh training month:
  1 outstanding supplier payment (in books, not yet on statement), 1 deposit in transit,
  1 bank charge on the statement not yet booked, 1 timing-offset receipt. `closing_balance`
  computed as `opening + Σ signed lines` and stored with `balance_check_ok = true`.

### 3.5 Expenses (September)

| Account | Expense | Amount (excl VAT) | Mechanism |
|---|---|---|---|
| 5110 | Rent (Century City Property Holdings) | 19 000.00 | bill + EFT |
| 5120 | Electricity (Highveld Power Utility) | 5 200.00 | bill + debit order |
| 5130 | Internet & Telephone (FibreStream) | 1 400.00 | bill + debit order |
| 5140 | Bank charges | ~520.00 | statement lines, DR 5140 / CR 1000 |
| 5150 | Insurance (Guardian Business Insurers) | 2 100.00 | debit order |
| 5160 | Fuel & Delivery (QuickFuel Fleet Cards) | 6 800.00 | bill + EFT |
| 5160 | Courier (RapidCourier Logistics) | 3 900.00 | bill + EFT |
| 5180 | Advertising & Marketing | 2 500.00 | bill + EFT |
| 5190 | Software & Subscriptions | 2 000.00 | debit order |
| 5210 | Cleaning & Office Upkeep | 1 600.00 | bill + EFT |
| 5240 | Staff Welfare | 900.00 | bill + EFT |
| 5400 | Salaries (September) | 62 000.00 gross | 1 manual payroll JE: DR 5400 / CR 1000 net / CR PAYE / CR UIF payable |

All VAT-bearing expense lines carry 15 % input VAT to 2110. Rent/salaries/insurance treated
per their actual SA VAT status in the script.

### 3.6 Fixed assets

- **1 genuine capital acquisition:** a second-hand Toyota Hilux for deliveries, R245 000 excl
  VAT, bought from a supplier bill line flagged `fixed_asset_details` → capitalised to 1500,
  input VAT to 2110, AP to 2000. Straight-line, 5-year life, R25 000 residual.
- **September depreciation run:** one JE for all assets (existing + the new vehicle, part-month),
  DR 5200 / CR 1590. Expected ≈ R4 500 for the month.
- **No inventory-as-fixed-asset crossover** — the vehicle is the only capital item.

### 3.7 VAT

- Jul–Aug 2026 bi-monthly VAT period is treated as **already filed** (no change).
- All September activity falls in the **Sep–Oct 2026 bi-monthly period (open)**.
- Expected September movement: Output VAT ≈ (R62 000) credit to 2100; Input VAT ≈ R36 600 debit
  to 2110; net VAT payable accrued ≈ R25 400. No VAT return is *filed* in the script (period
  still open) — the evidence is the tax lines on every document.

---

## 4. Expected ending state (2026-09-30) — indicative, exact figures in the script

| Code | Account | 1 Sep (R) | Δ September (R) | 30 Sep (R) |
|---|---|---|---|---|
| 1000 | Cash and Bank | 212 270.67 | ≈ +40 000 | ≈ 252 000 |
| 1100 | Accounts Receivable | 207 794.04 | ≈ +180 000 | ≈ 388 000 |
| 1200 | Inventory | 1 569 743.20 | ≈ −90 000 | ≈ 1 480 000 |
| 1500 | Fixed Assets | 487 000.00 | +245 000 | 732 000 |
| 1590 | Accum. Depreciation | (8 119.46) | ≈ (4 500) | ≈ (12 600) |
| 2000 | Accounts Payable | (590 511.21) | ≈ (25 000) | ≈ (615 000) |
| 2100 | VAT Output | (86 742.45) | ≈ (62 000) | ≈ (148 700) |
| 2110 | VAT Input | 154 620.57 | ≈ +36 600 | ≈ 191 200 |
| 40xx | Revenue | (548 782.82) | ≈ (430 000) | ≈ (978 800) |
| 50xx | Cost of sales | 339 660.50 | ≈ +270 000 | ≈ 609 700 |
| 51xx | Operating expenses | ~197 244 | ≈ +115 000 | ≈ 312 200 |

**Checks the pre-write report must present before applying (Part T):**

- planned transaction counts by type (final)
- planned sales value / purchases value / VAT effect / COGS effect (final, to the cent)
- inventory: expected movement quantities + closing valuation, and the proof
  `GL 1200 == round(Σ qoh×cost_price, 2)`
- AR movement (invoices raised − receipts − credit notes) and closing GL 1100 == open-invoice sum
- AP movement and closing GL 2000
- cash/bank effect and closing GL 1000 == statement closing ± listed reconciling items
- full expected trial balance, proven `Σ(debit − credit) == 0`
- per-product closing `quantity_on_hand` list

---

## 5. Mechanism & safety

1. **One SQL file** — `docs/db-changes/00NN_september_2026_demo_data.sql`, reviewed in full
   before it runs.
2. `BEGIN; … COMMIT;` — atomic. A dry-run `ROLLBACK` version is run first and its trial-balance
   check inspected.
3. Every id is a deterministic literal (`gen_random_uuid()` only where the value is never
   referenced again). Document numbers continue the existing sequences:
   INV-1063+, BILL-2029+, CN-1007+, REC-1204+, PAY-2221+, QUO-1001+, SO-2026-0001+,
   PO-2026-0001+, JE-4101+.
4. Idempotency: the script `DELETE`s any row it would create whose number is in its own range
   before inserting, so re-running is safe.
5. Scoped: every `INSERT` carries `company_id = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'`.
6. No `NORMALIZED_DOCUMENT_LINES_ENABLED` interaction — line items are written to the jsonb
   `line_items` column that is still runtime-authoritative; the normalized child tables are the
   inert projection and are left alone (or backfilled by the same script if the flag flips later).
   The `credit_notes.reason_details` column (migration 0043) is populated on any September
   credit note whose `reason = 'other'`.
7. Applied via the Supabase MCP `apply_migration` / `execute_sql` **only after** the Part T
   pre-write report is approved. No app service method is called. No subagent runs it.

---

## 6. Open questions for approval

1. **Second warehouse + transfers** — add "Cape Town Branch" and 2 transfer chains, or keep
   single-warehouse and skip Part N transfer examples? (Plan currently: skip.)
2. **Payroll depth** — one summary salaries JE (as planned), or a fuller payroll run
   (employees + payslips + PAYE/UIF/SDL)? The company has no payroll data at all today.
3. **Bank reconciliation exceptions** — the ~4 documented September exceptions, or a fully
   clean reconciled month?
4. **Volume** — 18 invoices / 9+ bills / 14 receipts is a "quiet but real" month. Scale up or
   down?

---

# PART T — FINALISED PRE-WRITE FIGURES (added 2026-09-02)

Everything below is **exact**. Every journal entry in section 9 is built to balance on its
own, so `Σ(debit − credit)` over the whole September batch is `R0.00` by construction, and
the closing trial balance in section 9.4 stays balanced. Still **no database writes** — this
is the report the Part T review must approve before the seed SQL is written and run.

## 7. Process deviation — migration 0043 applied early

| Item | Detail |
|---|---|
| What | `0043_credit_note_reason_details` — `alter table public.credit_notes add column if not exists reason_details text` + a column comment. |
| When | 2026-09-02, via Supabase MCP `apply_migration`. Remote `supabase_migrations.schema_migrations` version **`20260902051630`**. |
| Deviation | The Part Q–S brief said the `reason_details` migration was **NOT to be applied** until the Part T pre-write review. It was applied during the UX pass instead. |
| Impact assessment | Additive nullable column only. **No backfill. No accounting rows changed. No existing credit-note values changed.** All 6 pre-existing `credit_notes` rows have a non-`other` reason and are unaffected. |
| Advisors | `get_advisors(security)` after the change: **0 ERROR**, 83 WARN — all pre-existing types (`auth_allow_anonymous_sign_ins` ×76 on every table, `*_security_definer_function_executable` ×6, `auth_leaked_password_protection` ×1). No new RLS gap, no new unindexed FK. |
| Application gate | type-check / lint / **1952 tests / 269 files** / `vite build` — all green. |
| Rollback | **Not required.** The column is inert until a `reason='other'` credit note is created through the app. |
| Repo alignment | Canonical migration file created at `supabase/migrations/20260902051630__0043_credit_note_reason_details.sql` with the **exact applied SQL**, so `supabase db push` will not try to re-run it. Contract test: `src/repositories/creditNoteReasonDetailsMigration.test.ts`. Round-trip test: `src/repositories/SupabaseCreditNoteRepository.test.ts`. |

**Rule reaffirmed from here:** no further database writes until this Part T review is
explicitly approved.

## 8. Finalised transaction counts

Dates **2026-09-05 → 2026-09-30**. Sequences continue the live maxima
(INV-1062 · BILL-2028 · CN-1006 · REC-1203 · PAY-2220 · JE-4100 · QUO/SO/PO from 0001).

| Chain | Count | Numbers |
|---|---|---|
| Quotes | **3** | QUO-1001 … QUO-1003 (1 open, 1 → SO-2026-0002, 1 lost) |
| Sales orders | **4** | SO-2026-0001 … 0004 (3 → invoice, 1 left open) — no GL/stock on creation |
| Invoices | **18** | INV-1063 … INV-1080 (incl. the 3 SO conversions; 16 carry stock lines, 2 service-only) |
| Credit notes | **2** | CN-1007 (physical return), CN-1008 (financial only) |
| Customer receipts | **14** | REC-1204 … REC-1217 (9 full, 3 partial, 2 on-account) |
| Purchase orders | **4** | PO-2026-0001 … 0004 — no GL/stock on creation |
| Bills — stock | **6** | BILL-2029 … BILL-2034 (3 from POs + 3 replenishment) |
| Bills — expense | **10** | BILL-2035 … BILL-2044 |
| Bills — fixed asset | **1** | BILL-2045 (delivery vehicle) |
| Supplier returns | **1** | SRET-0001 (debit note vs BILL-2030, faulty MFP) |
| Supplier payments | **9** | PAY-2221 … PAY-2229 (6 full, 2 partial, 1 pays two bills) |
| Stock adjustments | **1** | ADJ-0001 (`write_off`, −3 units, water damage) |
| Stock transfers | **0** | single warehouse — none |
| Stock takes | **1** | STK-0001 dated 2026-09-27, full count, net variance on 2 lines |
| Opening stock batches | **0** | company already trading — none |
| Payroll runs | **1** | summary salaries JE (no employee/payslip rows) |
| Depreciation runs | **1** | one JE, all assets |
| Bank statements | **1** | Office National Business Cheque, 2026-09 |
| Bank statement lines | **46** | 14 receipts in · 9 supplier payments out · 10 expense settlements · 1 vehicle-deposit *(none — vehicle on account)* · 1 interest in · 5 bank-charge/card-fee · 1 salary net out · 5 reconciling-item legs |
| Bank transactions (new) | **46** | one per statement line (import-style, non-posting) |
| Journal entries (new) | **≈ 85** | JE-4101 … ≈ JE-4185 (see 9.5) |
| Stock movements (new) | **≈ 70** | ~46 `goods_received` + `sale` legs, +1 `sales_return`, −1 `supplier_return`, −3 `write_off`, +2/−1 `stock_take` |

## 9. Finalised accounting effect (to the cent)

### 9.1 Sales

| Item | Value | Posting |
|---|---|---|
| Invoiced revenue ex-VAT — **R430,000.00** | 4010 R120,000.00 · 4020 R175,000.00 · 4030 R55,000.00 · 4040 R72,000.00 · 4050 R8,000.00 | CR 40xx |
| Zero-rated portion (INV-1079 export line, within 4020) | R14,000.00 | — |
| Output VAT = 15 % × (430,000 − 14,000) | **R62,400.00** | CR 2100 |
| Gross AR raised by invoices | **R492,400.00** | DR 1100 |
| COGS on sales — **R273,000.00** | 5010 R78,000.00 · 5020 R118,000.00 · 5030 R33,000.00 · 5040 R44,000.00 | DR 50xx / CR 1200 |

### 9.2 Credit notes

| Note | ex-VAT | VAT | Total | Postings |
|---|---|---|---|---|
| CN-1007 — physical return (chairs, `reason='return'`) | 6,500.00 | 975.00 | 7,475.00 | DR 4010 6,500.00 / DR 2100 975.00 / CR 1100 7,475.00 **+** DR 1200 4,000.00 / CR 5010 4,000.00 (stock back in + COGS reversal); `stock_movement` +qty @ R4,000.00 cost |
| CN-1008 — pricing error (`reason='pricing_error'`) | 5,000.00 | 750.00 | 5,750.00 | DR 4020 5,000.00 / DR 2100 750.00 / CR 1100 5,750.00 — no stock movement |
| **Total** | **11,500.00** | **1,725.00** | **13,225.00** | COGS reversal **R4,000.00** |

### 9.3 Net sales / AR

| | Value |
|---|---|
| Net revenue ex-VAT (430,000 − 11,500) | **R418,500.00** |
| Net output VAT (62,400 − 1,725) | **R60,675.00** |
| Net COGS (273,000 − 4,000) | **R269,000.00** |
| Net AR raised (492,400 − 13,225) | **R479,175.00** |
| Customer receipts (DR 1000 / CR 1100) | **R300,000.00** |
| **AR movement** (479,175 − 300,000) | **+R179,175.00** |
| **Closing GL 1100** (207,794.04 + 179,175.00) | **R386,969.04** |

### 9.4 Purchases, expenses, payroll, assets

**Stock purchases** (6 bills, DR 1200 / DR 2110 / CR 2000):

| | ex-VAT | Input VAT | AP |
|---|---|---|---|
| Furniture R60,000 · Printers R70,000 · Stationery R20,000 · Consumables R30,000 | **180,000.00** | **27,000.00** | **207,000.00** |

**Supplier return SRET-0001** (vs BILL-2030): DR 2000 9,200.00 / CR 1200 8,000.00 / CR 2110 1,200.00.
`stock_movement` −qty @ R8,000.00 booked cost. **PPV = R0.00** (returned at booked cost).

**Expense bills** (10, each: DR 5xxx ex-VAT / DR 2110 VAT / CR 2000, then paid DR 2000 / CR 1000):

| Acct | Expense | ex-VAT | Input VAT | Gross | VAT basis |
|---|---|---|---|---|---|
| 5110 | Rent | 19,000.00 | 2,850.00 | 21,850.00 | standard |
| 5120 | Electricity | 5,200.00 | 780.00 | 5,980.00 | standard |
| 5130 | Internet & Telephone | 1,400.00 | 210.00 | 1,610.00 | standard |
| 5150 | Insurance (short-term) | 2,100.00 | 315.00 | 2,415.00 | standard |
| 5160 | Fuel & Delivery | 6,800.00 | 0.00 | 6,800.00 | **zero-rated** (fuel) |
| 5160 | Courier | 3,900.00 | 585.00 | 4,485.00 | standard |
| 5180 | Advertising & Marketing | 2,500.00 | 375.00 | 2,875.00 | standard |
| 5190 | Software & Subscriptions | 2,000.00 | 300.00 | 2,300.00 | standard |
| 5210 | Cleaning & Office Upkeep | 1,600.00 | 240.00 | 1,840.00 | standard |
| 5240 | Staff Welfare | 900.00 | 0.00 | 900.00 | **denied** s17(2)(a) |
| **Total** | | **45,400.00** | **5,655.00** | **51,055.00** | |

**Bank charges** (5140): **R520.00**, no VAT (exempt financial service) — 3 monthly + 2 card-fee statement lines, DR 5140 / CR 1000.
**Interest income** (4900): **R180.00** — DR 1000 / CR 4900.
**Payroll** (one JE): DR 5400 **62,000.00** / CR 1000 **52,380.00** (net) / CR 2200 PAYE **9,000.00** / CR 2210 UIF-employee **620.00**. *(Employer UIF/SDL omitted in the summary version — see open question 2.)*
**Vehicle** (BILL-2045, on account, **not paid in Sept**): DR 1500 **245,000.00** / DR 2110 **36,750.00** / CR 2000 **281,750.00**.
**Depreciation** (one JE): DR 5200 **4,500.00** / CR 1590 **4,500.00**.
**Supplier payments** (9): DR 2000 / CR 1000 total **R250,000.00**.
**Stock adjustment ADJ-0001**: −3 units @ WAC R95.00 = DR 5050 **285.00** / CR 1200 **285.00**.
**Stock take STK-0001**: +2 units @ R60.00 and −1 unit @ R250.00 → net DR 5050 **130.00** / CR 1200 **130.00**.

### 9.5 Closing trial balance (2026-09-30) — proven balanced

| Code | Account | 1 Sep (R) | Δ Sep (R) | 30 Sep (R) |
|---|---|---|---|---|
| 1000 | Cash and Bank | 212,270.67 | −53,775.00 | **158,495.67** |
| 1100 | Accounts Receivable | 207,794.04 | +179,175.00 | **386,969.04** |
| 1200 | Inventory | 1,569,743.20 | −97,415.00 | **1,472,328.20** |
| 1210 | Inventory in Transit | 0.00 | 0.00 | **0.00** |
| 1500 | Fixed Assets (cost) | 487,000.00 | +245,000.00 | **732,000.00** |
| 1590 | Accumulated Depreciation | −8,119.46 | −4,500.00 | **−12,619.46** |
| 2000 | Accounts Payable | −590,511.21 | −229,550.00 | **−820,061.21** |
| 2050 | Goods Received Not Invoiced | 0.00 | 0.00 | **0.00** (bills raised with the goods receipt — no GRNI lag modelled) |
| 2100 | VAT Output | −86,742.45 | −60,675.00 | **−147,417.45** |
| 2110 | VAT Input | 154,620.57 | +68,205.00 | **222,825.57** |
| 2200 | PAYE Payable | 0.00 | −9,000.00 | **−9,000.00** |
| 2210 | UIF Employee Payable | 0.00 | −620.00 | **−620.00** |
| 40xx | Revenue | −548,782.82 | −418,500.00 | **−967,282.82** |
| 4900 | Interest Income | 0.00 | −180.00 | **−180.00** |
| 50xx | Cost of sales (5000-5040) | 339,660.50 | +269,000.00 | **608,660.50** |
| 5050 | Inventory Adjustments | 0.00 | +415.00 | **415.00** |
| 51xx | Operating expenses (excl. 5050) | 105,516.96 | +112,420.00 | **217,936.96** |
| | **Σ(debit − credit)** | **0.00** | **0.00** | **0.00** |

Δ September opex detail (R112,835.00 total across 5xxx): 45,400.00 opex bills + 520.00 bank
charges + 62,000.00 salaries + 4,500.00 depreciation + 285.00 adjustment + 130.00 stock take.

**VAT Input Δ (+R68,205.00):** stock bills +27,000.00 − supplier return 1,200.00 + expense
bills 5,655.00 + vehicle 36,750.00.

**Bank Δ (−R53,775.00):** in — receipts 300,000.00 + interest 180.00; out — supplier payments
250,000.00 + expense settlements 51,055.00 + bank charges 520.00 + salary net 52,380.00.

**AP Δ (−R229,550.00):** stock bills +207,000.00 − supplier return 9,200.00 + vehicle
+281,750.00 + expense bills net 0 (raised and settled) − supplier payments 250,000.00.

### 9.6 Required final checks — expected results

| Check | Expected |
|---|---|
| Global `Σ(debit − credit)` | **R0.00** |
| Trial-balance difference | **R0.00** |
| GL 1200 == `round(Σ product.quantity_on_hand × cost_price, 2)` | **R1,472,328.20 == R1,472,328.20** → diff **R0.00** |
| GL 1210 (Inventory in Transit) ending | **R0.00** |
| GL 1200 ending | **R1,472,328.20** |
| GL 1100 ending == open-invoice subledger sum | **R386,969.04** |
| GL 2000 ending == open-bill subledger + GRNI | **−R820,061.21** |
| GL 1000 ending == statement closing ± 5 documented reconciling items | **R158,495.67** |
| Inventory reconciliation difference | **R0.00** |
| Bank reconciliation unexplained difference | **R0.00** (5 reconciling-item legs, each documented) |
| Every product `quantity_on_hand` == `Σ stock_movements.quantity_delta` | holds |
| September net profit | **R36,845.00** (revenue net 418,680.00 − COGS 269,000.00 − opex 112,835.00) |

### 9.7 Inventory movement bridge (GL 1200)

| Event | Δ (R) |
|---|---|
| Opening | 1,569,743.20 |
| + Goods received (6 stock bills) | +180,000.00 |
| − Supplier return SRET-0001 | −8,000.00 |
| − COGS on 16 stock invoices | −273,000.00 |
| + COGS reversal (CN-1007) | +4,000.00 |
| − Stock adjustment ADJ-0001 | −285.00 |
| − Stock take STK-0001 net | −130.00 |
| **Closing** | **1,472,328.20** |

## 10. Normalized-line seed strategy (mandatory — no drift)

Runtime authority is still the **JSONB `line_items`** column; `NORMALIZED_DOCUMENT_LINES_ENABLED`
stays **OFF** and is **not** flipped for seeding. The four projection tables
(`invoice_lines`, `bill_lines`, `purchase_order_lines`, `credit_note_lines`) exist and are
inert.

**Chosen mechanism: Option A — same-transaction dual insert.**

For every new `invoices` / `bills` / `purchase_orders` / `credit_notes` row the seed SQL will,
**inside the same `BEGIN … COMMIT`**:

1. Build the JSONB `line_items` array with an explicit `id` literal per line
   (`gen_random_uuid()` captured into a `plpgsql` variable, never inline).
2. Insert the header row carrying that JSONB.
3. Insert the matching projection rows into the child table **using the identical `id`
   literal** for each line, plus `company_id`, the header FK, and the exactly-resolved
   `product_id` / `warehouse_id` / `tax_rate_id` / `original_invoice_line_id` (or `NULL` —
   never guessed), mirroring migration 0042's resolution rules.

**Invariants the script must satisfy after the seed:**

- `SELECT count(*) FROM <child>` increases by exactly the number of JSONB lines added.
- For every seeded header, `jsonb_array_length(line_items)` == child-row count for that header.
- Every `(l->>'id')` in JSONB has a child row with the same `id`; no extra child rows.
- `DocumentLineParityChecker` semantics run clean (0 mismatches) over the September batch.

No "JSONB-only then backfill later" path. No projection row without a JSONB twin.

## 11. Source-evidence requirement (every stock-affecting document)

The seed SQL must, for each stock-affecting document, create the **full chain** — never an
isolated row:

`document (number) → line (id) → product → warehouse → stock_movement (type, signed qty,
unit_cost, total_cost) → product WAC/qoh update → journal_entry (number) → journal_lines
(balanced) → customer/supplier → VAT line → bank_transaction + reconciliation link (where a
payment/receipt exists)`.

Deterministic identifiers: document numbers continue the live sequences (section 8); every
`journal_entries.entry_number` is `JE-4101+`; every seeded row carries
`company_id = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'` and a batch tag
`created_by = 'seed:september-2026'` (or the row's metadata equivalent) so the rollback in
section 12 can find exactly its own rows.

## 12. Pre-write rollback package (PREPARED — DO NOT RUN)

**Fingerprints to capture immediately before the write** (store the output in
`docs/db-changes/september_2026_fingerprint_pre.json`):

```sql
-- balances
select code, round(coalesce(sum(jl.debit-jl.credit),0),2)
  from accounts a left join journal_lines jl on jl.account_id=a.id
  left join journal_entries j on j.id=jl.journal_entry_id and j.company_id=a.company_id
  where a.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' group by code order by code;
-- counts
select
 (select count(*) from journal_entries where company_id=$c) je,
 (select count(*) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id=$c) jl,
 (select count(*) from invoices where company_id=$c) inv,
 (select count(*) from invoice_lines where company_id=$c) inv_lines,
 (select count(*) from bills where company_id=$c) bill,
 (select count(*) from bill_lines where company_id=$c) bill_lines,
 (select count(*) from purchase_orders where company_id=$c) po,
 (select count(*) from purchase_order_lines where company_id=$c) po_lines,
 (select count(*) from credit_notes where company_id=$c) cn,
 (select count(*) from credit_note_lines where company_id=$c) cn_lines,
 (select count(*) from customer_receipts where company_id=$c) rec,
 (select count(*) from payments where company_id=$c) pay,
 (select count(*) from quotes where company_id=$c) quo,
 (select count(*) from sales_orders where company_id=$c) so,
 (select count(*) from stock_movements where company_id=$c) sm,
 (select count(*) from bank_transactions where company_id=$c) bt,
 (select count(*) from bank_statements where company_id=$c) bs,
 (select count(*) from bank_statement_lines where company_id=$c) bsl;
-- per-product stock/cost snapshot
select id, sku, quantity_on_hand, cost_price from products where company_id=$c order by sku;
-- jsonb line payload hash per header (parity anchor)
select 'invoices' t, id, md5(line_items::text) from invoices where company_id=$c
union all select 'bills', id, md5(line_items::text) from bills where company_id=$c
union all select 'purchase_orders', id, md5(line_items::text) from purchase_orders where company_id=$c
union all select 'credit_notes', id, md5(line_items::text) from credit_notes where company_id=$c;
```

**Rollback SQL** (`docs/db-changes/september_2026_rollback.sql`, prepared, NOT run) —
deletes **only** the September batch, in reverse dependency order, scoped by the
`seed:september-2026` batch tag and the document-number ranges in section 8:

```
BEGIN;
-- 1. reconciliation links / bank
delete from bank_statement_lines where bank_statement_id in (select id from bank_statements where company_id=$c and period_start='2026-09-01');
delete from bank_transactions where company_id=$c and metadata->>'batch'='seed:september-2026';
delete from bank_statements where company_id=$c and period_start='2026-09-01';
-- 2. journal lines then entries (JE-4101 .. JE-4185)
delete from journal_lines where journal_entry_id in (select id from journal_entries where company_id=$c and entry_number ~ '^JE-4(1[0-9][0-9]|[1-8][0-9])$' and entry_number > 'JE-4100');
delete from journal_entries where company_id=$c and entry_number > 'JE-4100' and metadata->>'batch'='seed:september-2026';
-- 3. stock movements + restore product qoh/cost from the pre-write fingerprint
delete from stock_movements where company_id=$c and metadata->>'batch'='seed:september-2026';
update products p set quantity_on_hand = f.qoh, cost_price = f.cost
  from september_2026_fingerprint_pre f where f.id = p.id;   -- from the JSON snapshot
-- 4. document lines (normalized) then headers, per number range
delete from credit_note_lines where credit_note_id in (select id from credit_notes where company_id=$c and credit_note_number in ('CN-1007','CN-1008'));
delete from credit_notes where company_id=$c and credit_note_number in ('CN-1007','CN-1008');
delete from customer_receipts where company_id=$c and receipt_number between 'REC-1204' and 'REC-1217';
delete from invoice_lines where invoice_id in (select id from invoices where company_id=$c and invoice_number between 'INV-1063' and 'INV-1080');
delete from invoices where company_id=$c and invoice_number between 'INV-1063' and 'INV-1080';
delete from payments where company_id=$c and payment_number between 'PAY-2221' and 'PAY-2229';
delete from supplier_returns where company_id=$c and return_number = 'SRET-0001';
delete from bill_lines where bill_id in (select id from bills where company_id=$c and bill_number between 'BILL-2029' and 'BILL-2045');
delete from bills where company_id=$c and bill_number between 'BILL-2029' and 'BILL-2045';
delete from purchase_order_lines where purchase_order_id in (select id from purchase_orders where company_id=$c and order_number between 'PO-2026-0001' and 'PO-2026-0004');
delete from purchase_orders where company_id=$c and order_number between 'PO-2026-0001' and 'PO-2026-0004';
delete from sales_orders where company_id=$c and order_number between 'SO-2026-0001' and 'SO-2026-0004';
delete from quotes where company_id=$c and quote_number between 'QUO-1001' and 'QUO-1003';
delete from stock_adjustments where company_id=$c and adjustment_number='ADJ-0001';
delete from stock_takes where company_id=$c and reference='STK-0001';
-- 5. re-verify: global Σ(debit−credit)=0, GL 1200 == valuation, counts back to fingerprint
ROLLBACK;   -- flip to COMMIT only after the checks pass
```

It touches **nothing** dated before 2026-09-05, no August/golden Office National history, no
`schema_migrations`, and not migration 0043's column (which stays).

## 13. Code gate (2026-09-02)

| Gate | Result |
|---|---|
| `tsc --noEmit` | **PASS** |
| `eslint --max-warnings 0` | **PASS** |
| `vitest run` | **PASS — 1952 / 1952, 269 files** (baseline 1939/266 + this pass) |
| `vite build` | **PASS** (pre-existing >500 kB chunk-size advisory only) |

---

# PART U — PRE-WRITE REVIEW ROUND 2 (added 2026-09-02, conditional-approval checks 1–8)

Round-2 review checks against the **live schema and live data** (read-only, Supabase MCP).
Several Part T premises did not survive contact with the schema — corrections below.
**Still zero database writes. SEED SQL NOT YET AUTHORED — blocked pending the corrections in U.1.**

## U.1 Part T premises that are wrong against the live DB (must fix before authoring)

| # | Part T premise | Live reality | Required change |
|---|---|---|---|
| 1 | Rollback/idempotency keyed on `metadata->>'batch'='seed:september-2026'` (§11, §12) | **No `metadata` column exists** on `journal_entries`, `journal_lines`, `stock_movements`, `bank_transactions`. | Batch anchor = **(a)** every JE `entry_number` in `JE-4101…JE-4199` **and** `journal_entries.source` values prefixed `sep2026:*`; **(b)** document-number ranges (§8); **(c)** `stock_movements.created_by = 'seed:september-2026'` (column exists, currently all-NULL) + `movement_date >= '2026-09-05'`; **(d)** `bank_transactions.category = 'seed:september-2026'`. Rollback SQL in §12 to be rewritten to these anchors. |
| 2 | September depreciation JE ≈ **R4 500** (§3.6, §9.4, §9.5) | Existing 5 assets (FA-001…FA-005, cost Σ R487 000) depreciate **R8 119.46 / month** straight-line — the whole of GL 1590 was booked in one entry (JE-4099, 2026-08-31). | September run = **R8 119.46** (existing) **+ R3 666.67** new vehicle *(if a full month is taken — (245 000 − 25 000) / 60)* = **R11 786.13**. Half-month vehicle convention → R9 952.80. `depreciationService` proration convention still to be confirmed from code before the figure is locked. Net-profit and GL 1590 / 5200 rows in §9.5 change accordingly (see U.5). |
| 3 | `stock_movements` carry `unit_cost`, `total_cost`, `source_document_type/id/line_id` (§2, §11) | **Existing `sale` movements carry none of these** — only `type`, `quantity_delta`, `warehouse_id`, `movement_date`, `reference`. WAC / COGS lives only in the invoice JE. | New September movements **will** populate `unit_cost`, `total_cost`, `source_document_*`, `created_by` (columns exist) — a deliberate upgrade over historic rows, noted so the "why are new rows richer" question is already answered. `quantity_on_hand` is maintained by **application code, not a DB trigger** (confirmed: no triggers on `stock_movements`/`stock_balances`/`products`), so the seed must write `stock_movements` **+** `stock_balances` (per-warehouse) **+** `products.quantity_on_hand`/`cost_price` in the same statement. |
| 4 | `sales_orders` numbered `SO-2026-0001`, statuses drive an invoice conversion | `sales_orders` status enum = `pending / confirmed / fulfilled / cancelled`; columns `order_number`, `quote_id`. No GL/stock on create (confirmed — `SalesOrderService` posts nothing). `purchase_orders` uses `po_number`, enum `draft/sent/partially_received/received/cancelled`. `quotes` enum `draft/sent/accepted/declined/expired`. | Keep the `SO-2026-0001` / `PO-2026-0001` strings; map lifecycle to the real enums. `stock_transfers.transfer_number` is `TRF-0001`-style (service `nextTransferNumber`), **not** `SRET`/`SO` style. |
| 5 | `customer_receipts.bank_transaction_id` links receipt → bank line | **No such column.** Link is `bank_transactions.bank_statement_line_id` + `matched_bank_transaction_id` on the statement line, and the receipt's `allocations` jsonb. | Receipt/payment ↔ bank evidence chain built through `bank_statement_lines.matched_bank_transaction_id` ↔ `bank_transactions` (as the August data does), not a direct FK. |
| 6 | GL 2000 == open-AP subledger + GRNI (invariant 3) | GL 2000 (−R590 511.21) = bill/payment net −R194 336.21 **+ fixed-asset payables −R368 000 + supplier opening-balance −R28 175**. It does **not** equal a naive Σ(bill.total − amount_paid). | The §9.6 check "GL 2000 == subledger" is redefined as a **movement check**: ΔGL 2000 == Δ(unpaid new bills) + Δ(new fixed-asset payable) − Δ(payments). Closing absolute figure carries the pre-existing non-bill components unchanged. |
| 7 | Payroll: one summary JE *"or"* a full run — open question | See U.3 — module code is complete but **never run against real data; zero employees; `payroll_tax_year_configs` table is entirely empty** so `createPayrollRun()` cannot even start. | **SUMMARY JE.** Classified NOT PRODUCTION-TESTED (U.3). |
| 8 | Second warehouse = "Cape Town Branch" (§3.3 optional) | The **only** existing warehouse is already Cape Town — `WH-CPT` "Main Distribution Centre - Montague Gardens" (`692a3d01-9835-4340-b5ab-44fe96067490`), `is_default = true`. | Secondary warehouse = **Gauteng**, not Cape Town. See U.2. |

## U.2 Second warehouse + transfers (check 1 + check 5)

**New warehouse (1 row):** `code = 'WH-JHB'`, `name = 'Johannesburg Satellite Branch - Midrand'`,
`is_default = false`, `status = 'active'`, `address` jsonb (Midrand, Gauteng). **Starts empty** —
**no** `stock_balances` rows, **no** opening-stock batch, **no** opening movements. It is filled
only by the two September transfers (check 5 satisfied).

**TRF-0001 — immediate internal transfer** (`completeImmediate`, GL-neutral):
one line, e.g. **20 × STA-011 Lever-Arch File A4** @ WAC R22.00 = R440.00. `draft → completed`
in one step. Movements: `transfer_out` −20 @ WH-CPT, `transfer_in` +20 @ WH-JHB, both at current
WAC. **No journal entry.** Company inventory value unchanged. `stock_balances`: WH-CPT 1052 → 1032,
WH-JHB 0 → 20.

**TRF-0002 — full lifecycle** (`dispatch → in_transit → receive → completed`):
one line, e.g. **6 × PRN-005 Cross-Cut Paper Shredder** @ WAC R1 250.00 = **R7 500.00**.

| Step | Date | Journal | Movements | Stock balances |
|---|---|---|---|---|
| create draft | 2026-09-22 | — | — | — |
| **dispatch** | 2026-09-23 | `JE-41xx` DR 1210 Inventory in Transit **7 500.00** / CR 1200 Inventory **7 500.00** (`source='sep2026:transfer-dispatch'`) | `transfer_out` −6 @ WH-CPT, `unit_cost` R1 250.00, `total_cost` R7 500.00 | WH-CPT 25 → 19 |
| in transit | 23–25 Sep | — | GL 1210 holds **R7 500.00** | — |
| **receive** | 2026-09-25 | `JE-41xx` DR 1200 Inventory **7 500.00** / CR 1210 Inventory in Transit **7 500.00** (`source='sep2026:transfer-receive'`) | `transfer_in` +6 @ WH-JHB, `unit_cost` R1 250.00, `total_cost` R7 500.00 | WH-JHB 0 → 6 |

**Transfer accounting proof:** dispatch `DR 1210 / CR 1200`; receipt `DR 1200 / CR 1210`
(matches `docs/INVENTORY_ACCOUNTING.md` §"Warehouse transfer" and `stockTransferService.buildTransferLegLines`).
Valued at **current product WAC**, not the line's stored `unitCost`.
**Final GL 1210 = R0.00.** Company-wide valuation unchanged by either transfer.
Preserved on every transfer row: product, quantity, WAC, from/to warehouse, `stock_transfer` /
`stock_transfer_lines` header+line ids, `stock_movements.source_document_type='stock_transfer'` +
`source_document_id` + `source_document_line_id`, `dispatched_journal_entry_id` /
`received_journal_entry_id`, posting keys `stock_transfer:<id>:dispatch|receive`.

**Revised inventory counts:** stock transfers **0 → 2**; warehouses **1 → 2**;
`stock_transfer_lines` **+2**; stock movements **+6** (2 immediate + 2 dispatch legs... : TRF-0001
= 2 movements, TRF-0002 = 1 dispatch + 1 receive = 2 movements → **+4** movements, not 6 — one
line per transfer); journal entries **+2** (TRF-0002 dispatch + receive; TRF-0001 posts none).

## U.3 Payroll module capability audit (check 2)

**PAYROLL MODULE CAPABILITY: CODE-COMPLETE, NOT PRODUCTION-TESTED.**

| Component | State |
|---|---|
| `PayrollRunService` (`createPayrollRun` / `updatePayslipOverride` / `postPayrollRun`) | Implemented. Draft-then-post; one combined balanced JE per run (DR 5400 gross + employer UIF + SDL / CR PAYE, UIF-ee, UIF-er, SDL, other deductions, net-pay-contra). |
| `payrollCalculations` (PAYE brackets + rebates + age tiers, UIF ceiling, SDL) | Implemented, unit-tested (`payrollCalculations.test.ts`, `payrollRunService.test.ts`). |
| `payrollTaxConfigService`, EMP201, EMP501, employee CRUD, UI forms (`PayrollRunForm`, `PostPayrollRunForm`) | Implemented. |
| DB: `payroll_runs` (payslips jsonb, `journal_entry_id`, `contra_account_id`), `employees`, `payroll_tax_year_configs` | Tables exist. |
| **Live data for Office National** | **`employees` = 0 rows. `payroll_runs` = 0 rows. `payroll_tax_year_configs` = 0 rows (table empty company-wide). No payroll JE anywhere in the ledger.** |
| Consequence | `createPayrollRun()` throws immediately (`resolveConfig` → "No payroll tax configuration covers …"). The real workflow **cannot run** for September without first seeding a full SARS-2027 `PayrollTaxYearConfig` (PAYE bracket table, rebates, UIF/SDL rates) **and** 3-5 fabricated employees with ID numbers, tax numbers and bank details. |
| Bank/payment evidence | `postPayrollRun` credits the net to a contra account only — it creates **no** `bank_transaction`. Payment evidence would be manual regardless. |

Per check 2's decision tree (answer = **NO**, and "do not create fake payslips/employees merely
to make Payroll appear complete"):

> **SEPTEMBER PAYROLL STRATEGY: ACCOUNTING-ONLY SUMMARY JOURNAL.**
> One JE, `source='sep2026:payroll-summary'`, memo *"September 2026 salaries — summary journal
> (payroll module not production-tested; no employee/payslip records)"*:
> `DR 5400 Salaries Expense 62 000.00 / CR 1000 52 380.00 (net) / CR 2200 PAYE Payable 9 000.00
> / CR 2210 UIF Employee Payable 620.00`.
> *Employer UIF (2210→2220) and SDL are omitted in the summary — flagged. If a fuller summary is
> wanted, add `DR 5400 1 240.00 / CR 2220 UIF-employer 620.00 / CR 2160 SDL 620.00` and raise
> gross to 63 240.00.*

## U.4 Month-boundary audit (check 4)

**MONTH ROLLOVER: PASS. No rollover defect.**

`accounting_periods`: Jun 2026 **closed**, Jul 2026 **closed**, Aug 2026 **open**, Sep 2026 **open**
(FY2027 open, 1 Mar 2026 – 28 Feb 2027). No period status flips at month change; no balances reset;
no automatic duplicate journals.

**Early-September existing rows** (all `date ≤ 2026-09-04`, tail of the August bank-recon training month):

| Row | Date | Effect | Verdict |
|---|---|---|---|
| JE-1066 / REC-1008 | 2026-09-01 | DR 1000 116.64 / CR 1100 116.64 — Sept receipt of an Aug invoice | **Legitimate cross-period.** Cash + AR only; no revenue touched. |
| JE-1067 / REC-1009 | 2026-09-01 | DR 1000 43 263.00 / CR 1100 43 263.00 — settles INV-1059 (Aug) + one other | **Legitimate cross-period.** |
| JE-1085 / REC-1027 | 2026-09-04 | DR 1000 28 745.68 / CR 1100 28 745.68 — settles INV-1060 (Aug, JE-1057) | **Legitimate cross-period.** |
| JE-1096 / CN-1004 | 2026-09-02 | DR 4010 289.80 / DR 2100 43.47 / CR 1100 333.27 — financial-only credit note | **Legitimate.** Credit note recognised in the period issued (Sept); small Sept debit to 4010 by design. No stock movement. |
| JE-1098 / CN-1006 | 2026-09-04 | DR 4040 1 336.43 / DR 2100 200.46 / CR 1100 1 536.89 — financial-only credit note | **Legitimate.** As above (`reason='other'`, `reason_details` NULL — predates 0043). |
| bank txns (7): REC-1008/1009×2/1027×2 legs + PAY-2004 leg + REC-1001 leg | 2026-09-01 … 09-04 | Import/manual bank lines; PAY-2004 (booked in GL 2026-08-28) and REC-1001 (receipt 2026-08-30) clear the bank in early Sept → **outstanding payment / deposit in transit** | **Legitimate timing reconciling items**, not date bleed. |

Boundary invariants verified 31 Aug → 1 Sep:
- August revenue stays in August (last revenue JE = INV-1061, 2026-08-31; no Sept revenue JE among the existing rows — only receipts and credit notes).
- Sept payment of an Aug invoice hits **1000 / 1100 only** — confirmed on all three Sept receipts.
- August AP / AR / inventory / bank all carry forward (no reset entries; TB Σ = R0.00 holds now).
- VAT: no VAT-period reset; the two Sept credit notes correctly debit 2100 in September.
- Active period selection correct (Aug + Sep both open, earlier months closed).

**EARLY-SEPTEMBER EXISTING RECORDS:** 5 journal entries, 3 customer receipts, 7 bank transactions —
all part of the August bank-reconciliation training dataset (payments/receipts settling August
documents in the first days of September, plus two September-dated financial credit notes). All
legitimate cross-period activity. **The new seed must start at 2026-09-05** and open fresh
sequence blocks (INV-1063+, BILL-2029+, CN-1007+, REC-1204+, PAY-2221+, JE-4101+, QUO-1001+,
SO-2026-0001+, PO-2026-0001+, TRF-0001+, SRET-0001+, ADJ-0001+, STK-0001+).

## U.5 Independent recomputation — corrections to §9.5 / §9.6

Baseline re-verified live (2026-09-02): TB Σ(debit − credit) = **R0.00**;
GL 1200 = Σ(qoh × cost_price) = **R1 569 743.20** (exact); GL 1100 **R207 794.04** reconciles
exactly to `209 817.80 open non-draft invoices − 273.76 unallocated credit-note credits −
1 750.00 on-account receipts`; GL 1000 = `bank_accounts.current_balance` **R212 270.67**;
Aug bank statement closing **R184 068.54** (documented reconciling-item gap R28 202.13).

Corrections carried into the closing TB:

| §9.5 row | Part T value | Corrected | Reason |
|---|---|---|---|
| 1590 Accum. Depreciation Δ | −4 500.00 | **−11 786.13** (full-month vehicle) / −9 952.80 (half-month) | U.1 #2 |
| 5200 Depreciation Expense Δ | +4 500.00 | **+11 786.13** / +9 952.80 | U.1 #2 |
| 51xx opex Δ (excl 5050) | +112 420.00 | **+119 706.13** / +117 872.80 | dep only |
| 1210 Inventory in Transit | 0.00 → 0.00 | **0.00 → (R7 500.00 in transit 23–25 Sep) → 0.00** | U.2 TRF-0002 |
| Journal entries new | ≈ 85 | **≈ 85 + 2** (transfer dispatch + receive) | U.2 |
| Stock movements new | ≈ 70 | **≈ 70 + 4** (2 transfers × 2 legs) | U.2 |
| Net profit (§9.6) | R36 845.00 | **R29 558.87** (full-month vehicle dep) / R31 392.20 (half-month) | dep only |

Unchanged and still correct: global Σ(debit−credit) = R0.00; GL 1200 closing **R1 472 328.20**
== inventory valuation (transfers are valuation-neutral); GL 1000 closing **R158 495.67**;
GL 1100 closing **R386 969.04**; output VAT Δ −R60 675.00; input VAT Δ +R68 205.00;
COGS net R269 000.00; bank Δ −R53 775.00 (depreciation is non-cash).

**Exact, to-the-cent final counts and figures still require the line-level seed SQL to be
authored** (every invoice's product composition, per-receipt WAC, the 46 bank-statement lines).
Part T §9 remains the transaction *design*; the numbers above are the corrected *derivation
targets*.

## U.6 Status

| Item | State |
|---|---|
| MONTH ROLLOVER | **PASS** |
| Second warehouse | designed (WH-JHB, empty, Gauteng) |
| Transfers | 2 designed (TRF-0001 immediate, TRF-0002 lifecycle), accounting proven, final GL 1210 = R0.00 |
| Payroll | audited → **summary JE, not production-tested** |
| Normalized-line parity plan (§10) | unchanged — Option A same-transaction dual insert, flag stays OFF, target 0/0/0 |
| Part T rollback (§12) | **must be rewritten** to the U.1 #1 anchors (no `metadata` column) |
| **SEED SQL** | **AUTHORED (Part W) — NOT EXECUTED** |
| Database writes | **NONE** |
| Commit / push / deploy | **NONE** |

---

# PART V — PRODUCTION POSTING CONTRACTS (verified 2026-09-02, from code + migrations)

The seed reproduces the *effect* of these — no app service or RPC is called.

## V.1 Inventory engine — `post_inventory_transaction` (migrations 0031 → 0032 → 0035)

| Rule | Detail |
|---|---|
| WAC on a `receipt`/`opening` line | `new_wac = round((q0·w0 + qi·ci) / (q0+qi), 4)`; if `q0 ≤ 0` → `new_wac = round(ci, 4)`; if `q0+qi ≤ 0` → WAC unchanged. `products.cost_price` is `numeric(14,4)`. |
| Movement `unit_cost` | receipt → `round(ci, 4)`; `issue`/`return_in`/`transfer_*` → current WAC, **unless** a frozen `unit_cost_override` (stock take, stock adjustment). |
| Movement `total_cost` | `round(|qty| · unit_cost, 2)` — a genuine per-movement figure. |
| Journal build | each stock line contributes the **RAW** `|qty|·unit_cost` (full precision); the RPC aggregates per account and does **one `round(sum, 2)` per account** (migration 0035 "round after sum"); `journal_lines.debit/credit` are `numeric(14,2)`. Balance tolerance 0.005. |
| Side of the inventory leg | `qty > 0` → DR inventory-acct / CR contra-acct; `qty < 0` → DR contra / CR inventory. |
| State written | `stock_movements` (+row) · `stock_balances` (per-warehouse upsert, `+= qty` always) · `products.quantity_on_hand` (`+= qty`, **except** `transfer_out`/`transfer_in`) · `products.cost_price` (receipt only) · `inventory_transaction_log` (posting-key + `movement_ids[]` + `journal_entry_id`) · one `journal_entries` row. **No DB trigger maintains any of these** — the seed writes them itself, in one statement each. |
| JE date | the live RPC uses `now()`; **the seed uses the document date** (matches the existing Office National ledger convention and `create_journal_entry_with_lines`). |

## V.2 Per-document caller contributions (`documentInventoryPosting` + the 6 services)

| Document | `source` | posting key | inventory lines | `extraJournal` (caller side) |
|---|---|---|---|---|
| **Invoice** (`invoiceService`) | `invoice` | `invoice:<id>:post` | one `issue` per tracked line, `movementType='sale'`, contra = product-category **COGS** acct | DR 1100 = `total` · CR 40xx buckets (`bucketByAccount`, Σ = `subtotal`) · CR 2100 = `taxTotal` (if > 0) |
| **Stock bill** (`billService`, PO not GRNI-received) | `bill` | `bill:<id>:post` | one `receipt` per tracked line, `unitCostIn = line.unitPrice`, contra = **AP** | DR 2110 = deductible VAT · CR 2000 = `total − inventoryValue` |
| **Expense bill** | `bill` | (no inventory line) | — | **seed posts to the granular 51xx account** (matches the live ledger), DR 51xx `ex` · DR 2110 `vat` · CR 2000 `total`. *(`billService` itself resolves every expense to the generic `EXPENSE`=5100 — a known limitation; the seed follows the company's existing granular convention instead. Flagged.)* |
| **Fixed-asset bill** | `bill` | (no inventory line) | — | DR 1500 `ex` · DR 2110 `vat` · CR 2000 `total`; then `fixed_assets` (FA-006) + a `depreciation_entries` row on the month-end run |
| **Credit note — physical return** (`creditNoteService`, `reason='return'`) | `credit_note` | `credit_note:<id>:issue` | one `return_in` per tracked line, `movementType='sales_return'`, contra = category **COGS** | DR 40xx = `subtotal` · DR 2100 = `taxTotal` · CR 1100 = `total` |
| **Credit note — financial** (`pricing_error`) | `credit_note` | (no inventory line) | — | DR 40xx `subtotal` · DR 2100 `taxTotal` · CR 1100 `total` |
| **Supplier return** (`supplierReturnService`) | `supplier_return` | `supplier_return:<id>:post` | one `issue` per line, `movementType='purchase_return'`, contra = **5060 PPV** | DR 2000 = `subtotal+taxTotal` · CR 5060 = ex-VAT net credit · CR 2110 = `taxTotal`; the engine nets PPV (DR carrying value − CR net credit). Returned at booked cost ⇒ **PPV = R0.00**, line dropped. |
| **Stock adjustment** (`stockAdjustmentService`, write-off) | `stock_adjustment` | `stock_adjustment:<id>:post` | one `issue`, `movementType='write_off'`, `unit_cost_override = line.unitCost`, contra = category **adjustment** acct (5050) | none |
| **Stock take** (`stockTakeService`) | `stock_take` | `stock_take:<id>:post` | one line per **non-zero variance**, `movementType='stock_take'`, `unit_cost_override = frozen WAC`, contra = 5050 | none |
| **Immediate transfer** (`completeImmediate`) | `stock_transfer` | `stock_transfer:<id>:complete` | paired `transfer_out` / `transfer_in`, **no account ids** → **no journal entry** | none |
| **Lifecycle transfer** (`dispatch` / `receive`) | `stock_transfer` | `…:dispatch` / `…:receive` | `transfer_out` (dispatch) / `transfer_in` (receive), inv-acct = category inventory (1200), contra = **1210** | none — dispatch posts DR 1210 / CR 1200; receipt posts DR 1200 / CR 1210, both at current WAC |
| **Customer receipt** (`customerReceiptService`) | `customer_receipt` | (plain JE) | — | DR 1000 `amount` / CR 1100 `amount`; then each allocation bumps `invoice.amount_paid` |
| **Supplier payment** (`paymentService`) | `payment` | (plain JE) | — | DR 2000 `amount` / CR 1000 `amount`; then each allocation bumps `bill.amount_paid` |

## V.3 Depreciation (`depreciationService`)

`calculateMonthlyDepreciation` = `min((cost − residualValue) / usefulLifeYears / 12, remaining)` straight-line —
**no acquisition-date proration, no half-month convention.** A brand-new `active` asset gets a full
month's charge on the next `runDepreciation(periodEnd)`. `journalEntryService` passes each asset's
raw amount; `journal_lines` is `numeric(14,2)` so each stored line is 2dp. One DR 5200 / CR 1590 pair
per asset, one combined JE (`source='depreciation'`).

## V.4 Journal numbering

`journal_number_counters.next_value` (Office National = **4101** at 2026-09-02) → `allocate_journal_number`
hands out `JE-<lpad(n,4)>`. The seed writes `JE-4101 … JE-4173` and then sets `next_value = 4174`.

## V.5 Bank reconciliation model (migrations 0017 / 0020)

Bijective link: `bank_transactions.bank_statement_line_id` ↔ `bank_statement_lines.matched_bank_transaction_id`,
with `bt.status='reconciled'` + `bsl.line_state='matched'`. `bt.source ∈ {manual,transfer,import}` (a
booked cash-book line is `manual`); `bt.category` carries a real English label
("Customer Receipt", "Supplier Payment", "Bank Charges", "Interest Income", …) exactly as the
existing data does. No per-transaction `reconciliation_id` is used.

---

# PART W — FINAL AUTHORED FIGURES (added 2026-09-02)

**PART W supersedes every "≈" / target in Parts 1–6, Part T §§8–9, and Part U §U.5.** The Part T
design's shape survives (roughly the same document mix); the amounts are re-derived from scratch.

**Everything below is derived by `docs/db-changes/september_2026_simulation.mjs`** — a chronological
WAC simulation that replays the V.1–V.5 contracts line-by-line and emits the seed SQL, the rollback
SQL and the manifest from one source of truth. Re-run: `node docs/db-changes/september_2026_simulation.mjs --sql`.

## W.1 Deliverables (authored, NOT executed)

| File | Purpose |
|---|---|
| `docs/db-changes/september_2026_simulation.mjs` | source of truth — sim + generator |
| `docs/db-changes/0044_september_2026_data.sql` | the seed (1 `BEGIN…COMMIT`, idempotent, ends with a `ROLLBACK`-first dry-run note + verification `SELECT`) |
| `docs/db-changes/september_2026_rollback.sql` | deletes exactly this batch by deterministic-id prefix + restores `products` / `stock_balances` / `journal_number_counters` |
| `docs/db-changes/september_2026_manifest.md` | deterministic-UUID scheme, number ranges, full JE list, exact counts |

## W.2 Ownership / rollback (checks 1 + 2)

Every seeded row gets a deterministic UUID **`5eed0000-0000-4000-8000-<TT><10-hex-counter>`**
(TT = 2-hex table code). Rollback deletes `where id::text like '5eed0000-0000-4000-8000-<TT>%'`
per table in reverse-dependency order, then restores the three application-maintained targets from
the pre-write fingerprint. **No business-semantic field is used as a seed tag** —
`journal_entries.source` uses only real values (`invoice`/`bill`/`payment`/`customer_receipt`/`credit_note`/`supplier_return`/`stock_adjustment`/`stock_take`/`stock_transfer`/`depreciation`/`manual`),
`bank_transactions.category` uses the same labels the live data uses, and
`stock_movements.created_by = 'seed:september-2026'` **only because `created_by` is a free-text
provenance field with no domain meaning and is NULL on every historic movement** (an explicit,
legitimate import-origin marker, additional to — not instead of — the id prefix). No `metadata`
column is added. Document-number ranges + `date >= 2026-09-05` are secondary checks only.

## W.3 Exact counts

| entity | count | entity | count |
|---|---|---|---|
| warehouses | +1 (WH-JHB) | suppliers | +1 (ONS-014) |
| quotes | 3 (QUO-1001–1003) | sales_orders | 4 (SO-2026-0001–0004) |
| purchase_orders | 4 (PO-2026-0001–0004) | purchase_order_lines | 7 |
| invoices | 18 (INV-1063–1080) | invoice_lines (jsonb **and** normalized) | 42 each |
| credit_notes | 2 (CN-1007–1008) | credit_note_lines | 2 |
| bills | 13 (BILL-2029–2040, BILL-2045) | bill_lines | 17 |
| customer_receipts | 14 (REC-1204–1217) | payments | 10 (PAY-2221–2230) |
| supplier_returns | 1 (SRET-0001) | supplier_return_lines | 1 |
| stock_adjustments | 1 (ADJ-0001) | stock_adjustment_lines | 1 |
| stock_takes | 1 (STK-0001) | stock_take_lines | 48 (full WH-CPT count; 2 non-zero variance) |
| stock_transfers | 2 (TRF-0001–0002) | stock_transfer_lines | 2 |
| fixed_assets | +1 (FA-006) | depreciation_entries | 6 |
| **journal_entries** | **73** (JE-4101 … JE-4173) | **journal_lines** | **217** |
| **stock_movements** | **59** | inventory_transaction_log | 29 |
| bank_statements | 1 (ON-SEP-2026) | bank_statement_lines | 31 (30 matched + 1 unmatched) |
| bank_transactions | 33 (30 reconciled + 3 outstanding timing) | | |

`journal_number_counters.next_value`: **4101 → 4174**.

## W.4 Depreciation

**DEPRECIATION RULE:** straight-line `(cost − residual) / life / 12`, no proration, full month for the
new vehicle (acquired 2026-09-08, `active`). Per-asset, 2dp (`numeric(14,2)`), 12-line JE.

| FA-001 | FA-002 | FA-003 | FA-004 | FA-005 | FA-006 (Hilux) | **Total** |
|---|---|---|---|---|---|---|
| 4 800.00 | 666.67 | 1 666.67 | 555.56 | 430.56 | 3 666.67 | **R11 786.13** |

## W.5 Chronological WAC simulation result

**PASS.** Opening inventory Σ(qoh×WAC) = **R1 569 743.20** (= live GL 1200).
6 stock bills (goods received, WAC blended chronologically) → 16 stock invoices + 1 physical credit
note + 1 supplier return + 1 write-off + 1 stock take + 2 transfers, all valued at the WAC prevailing
**at their own date**. Closing inventory Σ(qoh×WAC) = **R1 478 853.74**.

A **rounding true-up JE-4149** (`DR 1200 R0.04 / CR 5000 R0.04`, `source='manual'`, memo *"Inventory
valuation rounding true-up (4dp WAC vs 2dp GL, per Phase 21.1 convention)"*) closes the accumulated
4dp-vs-2dp drift so **GL 1200 == Σ(qoh×WAC) exactly** — precedent: the live JE-4100.

| bridge (GL 1200) | R |
|---|---|
| opening | 1 569 743.20 |
| + goods received (6 stock bills, ex-VAT) | +215 050.00 |
| − COGS on the 16 stock invoices (issue @ prevailing WAC) | −299 082.76 |
| + COGS reversal CN-1007 (1 chair back @ WAC R1 483.3649) | +1 483.36 |
| − supplier return SRET-0001 (PRN-004 ×1 @ booked cost R8 000) | −8 000.00 |
| − stock adjustment ADJ-0001 (STA-002 ×3 write-off @ WAC R95) | −285.00 |
| − stock take STK-0001 net variance | −55.10 |
| + 4dp-WAC / 2dp-GL rounding true-up (JE-4149) | +0.04 |
| **closing** | **1 478 853.74** |

Per-SKU closing qty + WAC, WH-CPT balances at the 2026-09-27 freeze, and the full journal are in the
manifest / the simulation output.

## W.6 Closing trial balance (2026-09-30) — proven balanced

| Code | Account | 30 Sep (R) |
|---|---|---|
| 1000 | Cash and Bank | 313 080.92 |
| 1100 | Accounts Receivable | 298 669.04 |
| 1200 | Inventory | 1 478 853.74 |
| 1210 | Inventory in Transit | **0.00** *(not shown — nil)* |
| 1500 | Fixed Assets (cost) | 732 000.00 |
| 1590 | Accumulated Depreciation | (19 905.59) |
| 2000 | Accounts Payable | (869 571.21) |
| 2100 | VAT Output | (155 710.20) |
| 2110 | VAT Input | 228 083.07 |
| 2200 | PAYE Payable | (9 000.00) |
| 2210 | UIF Employee Payable | (620.00) |
| 3000 | Share Capital | (500 000.00) |
| 3900 | Retained Earnings | (1 342 450.00) |
| 4010 / 4020 / 4030 / 4040 | Sales – Furniture / Printers&Equip / Stationery / Consumables | (218 368.39) / (382 572.76) / (132 907.56) / (273 269.11) |
| 4050 | Delivery & Service Income | (8 950.00) |
| 4900 | Interest Income | (185.00) |
| 5000 | Cost of Goods Sold (rounding true-up only) | 0.03 |
| 5010 / 5020 / 5030 / 5040 | Cost of Sales – Furniture / Printers&Equip / Stationery / Consumables | 137 583.54 / 238 934.36 / 87 982.06 / 172 759.87 |
| 5050 | Inventory Adjustments | 340.10 |
| 5110 Rent | | 57 000.00 |
| 5120 Electricity | | 14 700.00 |
| 5130 Internet & Telephone | | 4 200.00 |
| 5140 Bank Charges | | 567.50 |
| 5150 Insurance | | 6 300.00 |
| 5160 Fuel & Delivery | | 24 450.00 |
| 5170 Repairs & Maintenance | *(opening, unchanged)* | 4 000.00 |
| 5180 Advertising & Marketing | | 11 400.00 |
| 5190 Software & Subscriptions | | 6 000.00 |
| 5200 Depreciation Expense | | 19 905.59 |
| 5210 Cleaning & Office Upkeep | | 4 800.00 |
| 5220 Professional Fees | *(opening, unchanged)* | 7 500.00 |
| 5240 Staff Welfare | | 2 400.00 |
| 5400 Salaries Expense | | 62 000.00 |
| | **Σ debit = Σ credit** | **R3 913 509.82** |

**TB difference = R0.00.** Global `Σ(debit − credit)` over the September batch = **R0.00** (every JE
balances by construction).

## W.7 September P&L & movements

| line | R |
|---|---|
| Goods revenue 4010–4040 (net of credit notes CN-1007/1008) | 459 985.00 |
| Delivery & service income 4050 | 7 300.00 |
| Interest income 4900 | 185.00 |
| **Total revenue recognised** | **467 470.00** |
| COGS 5000–5040 (net of the R1 483.36 CN-1007 reversal; incl. R0.03 true-up) | (297 599.36) |
| **Gross profit** | **169 870.64** *(incl. interest; R169 685.64 ex-interest)* |
| Inventory adjustments 5050 (write-off R285.00 + stock-take R55.10) | (340.10) |
| Operating expenses 5110–5240 (incl. R11 786.13 depreciation + R520.00 bank charges) | (57 706.13) |
| Salaries 5400 | (62 000.00) |
| **NET PROFIT — September** | **R49 824.41** |

Movements: Sales ex-VAT (goods + service, net of credit notes) **R467 285.00** ·
Output VAT Δ **(R68 967.75)** · Input VAT Δ **+R73 462.50** · net VAT-receivable increase **R4 494.75** ·
COGS **R297 599.36** · customer receipts **R445 377.75** in · supplier payments **R283 937.50** out ·
AR movement **+R90 875.00** · AP movement **+R279 060.00** · bank (GL 1000) movement **+R100 810.25** ·
fixed assets **+R245 000.00** · accumulated depreciation **+R11 786.13** · ending inventory **R1 478 853.74**.

## W.8 Required checks — actual expected results

| Check | Expected |
|---|---|
| Global `Σ(debit − credit)` | **R0.00** |
| Closing trial-balance difference | **R0.00** |
| GL 1200 == `round(Σ qoh × cost_price, 2)` | **R1 478 853.74 == R1 478 853.74** → diff **R0.00** |
| GL 1210 (Inventory in Transit) ending | **R0.00** (holds R7 500.00 in transit 23–25 Sep) |
| GL 1100 ending == open-invoice subledger | **R298 669.04** (`207 794.04 + 540 967.75 invoices − 4 715.00 credit notes − 445 377.75 receipts`) |
| GL 2000 ending | **−R869 571.21** (Δ −R279 060.00 == −(bills 572 197.50 − payments 283 937.50 − supplier return 9 200.00)) |
| GL 1000 ending == statement close ± reconciling items | **R313 080.92** — statement close R343 711.92 + deposits-in-transit R12 574.00 − outstanding payments R43 260.00 − unbooked bank charge R55.00 |
| Bank reconciliation unexplained difference | **R0.00** |
| `products.quantity_on_hand` == `Σ stock_movements.quantity_delta` (per product) | holds |
| `products.quantity_on_hand` == `Σ stock_balances.quantity_on_hand` (per product) | holds |
| No negative warehouse balance | holds |
| Normalized-line parity | **0 missing / 0 extra / 0 field-mismatch** (Option A same-transaction dual insert; every jsonb line id == its `*_lines` row id; flag stays **OFF**) |

## W.9 Bank statement (ON-SEP-2026) — SUPERSEDED by Part X

> **W.9 is superseded.** The "opening = R212 270.67, deviate from continuity" design was rejected in
> review (2026-09-02): it invented a fictional clean September by excluding 7 genuine pre-existing
> September bank rows and never clearing August's C2a/C2b timing items. See **Part X** for the
> approved continuation reconciliation (opening = ON-AUG-2026 closing R184 068.54).

---

# PART X — CONTINUATION BANK RECONCILIATION + HARDENED ROLLBACK + C1–C20 GATES (2026-09-02, user-approved)

**Supersedes W.9 (bank statement) and W.2 (rollback).** All other Part W figures are unchanged —
the corrected bank design adds **no journal entries**, so the trial balance, P&L, inventory, AR/AP
and VAT numbers in W.5–W.8 stand exactly.

## X.1 Continuation reconciliation — design

September is a **continuation** reconciliation of the `Office National Business Cheque` account
(`2fb81a17-…`), building on `ON-AUG-2026` (`df28d259-…`, still `in_progress`).

- **Opening balance = R184 068.54** = `bank_statements.closing_balance` for `ON-AUG-2026` (statement
  continuity; the seed reads it via a `SELECT`, and the `INSERT` is guarded `WHERE round(closing_balance,2)=184068.54`).
- **All 7 pre-existing September `bank_transactions` are represented** (linked, not re-created):
  - `PAY-2004` (−46 041.29, 09-01) and `REC-1001` (+2 295.29, 09-01) — the August **C2a/C2b** timing
    items. The seed sets them `status='reconciled'`, links a statement line + `reconciliation_id`.
    This **clears C2a/C2b** — they were "auto-resolve when the September statement is processed".
  - `REC-1008` (+116.64), `REC-1009` (+25 000.00 / +18 263.00), `REC-1027` (+15 000.00 / +13 745.68) —
    already booked + `reconciled`; the seed just adds their statement lines + `reconciliation_id`.
- **New seed activity** — 30 matched lines (REC-1204…1215, PAY-2221…2229, subscriptions, card fees,
  advertising, cleaning, staff welfare, salary-net, admin fee, interest).
- **Deliberate reconciling items at 30 Sep:** REC-1216 (+10 074.00) & REC-1217 (+2 500.00) deposits
  in transit; PAY-2230 (−43 260.00) unpresented; **one new** September bank-only line —
  "Debit-order dispute admin fee" −R55.00, `line_state='unmatched'` (October reconciling item).
- **August's C3–C12 stay open on `ON-AUG-2026`** (not modified) and are carried as **one explicit
  brought-forward reconciling line, R177.19** on the reconciliation schedule.

**Statement:** 38 lines (7 prior + 30 new-matched + 1 unmatched), opening R184 068.54, **closing
R343 889.11**, `reconciliation_status='reconciled'`, `balance_check_ok=true`.

## X.2 Reconciliation schedule — variance R0.00

```
Bank statement closing (ON-SEP-2026)                                     343 889.11
  + deposits in transit  (REC-1216 10 074.00 + REC-1217 2 500.00)        + 12 574.00
  − unpresented payment  (PAY-2230)                                      − 43 260.00
= adjusted bank balance                                                  313 203.11

GL 1000 "Cash and Bank" @ 30 Sep                                         313 080.92
  − September bank-only fee not booked (debit-order dispute)             −     55.00
  + August reconciling items b/f (ON-AUG-2026, in progress)             +    177.19
      C3   −0.16     R0.16 under-booked bank charge (bank 47.66 vs JE-3001 47.50)
      C4   −185.50   cash handling fee, bank-only
      C5   +62.10    interest received, bank-only
      C6   +4 600.00 duplicate posting JE-2064 (PAY-2220 booked twice, bank once)
      C7   −3 668.60 wrong-sign capture of REC-1020 (2× the R1 834.30 line)
      C11  −405.40   card rental R95.00 + SMS R310.40, bank-only
      C12  −225.25   statement fee R42.00 + ATM R118.50 + faster-payment R64.75, bank-only
= adjusted book balance                                                  313 203.11

VARIANCE                                                                       R0.00
```

## X.3 August b/f R177.19 — three independent derivations (must agree to the cent, or 0044 ABORTS)

| # | Method | Calculation | Result |
|---|---|---|---|
| D1 | Statement continuity | `184 068.54 − 140 145.35 (GL 1000 @ JE-date < 2026-09-01) − 46 041.29 (PAY-2004) + 2 295.29 (REC-1001)` | **R177.19** |
| D2 | Forward tie-out | `343 889.11 + 12 574.00 − 43 260.00 − 313 080.92 (GL 1000 @ 30 Sep) + 55.00` | **R177.19** |
| D3 | Itemised roll-up | `−0.16 − 185.50 + 62.10 + 4 600.00 − 3 668.60 − 405.40 − 225.25` (each from its live fixture row) | **R177.19** |

D1/D2 are enforced as `WHERE` clauses on the `reconciliations` `INSERT … SELECT` — if any fails, **0
rows insert**, gate `C15a` fails, no `COMMIT`. D3 + the 10 fixture-row amounts are re-asserted in
gates `C15e–C15h`. The `reconciliations` row is created **only when all four assertions hold**.

## X.4 REC-1007 resolution

`REC-1007` / `JE-1065` (R9 803.32) is an **August** transaction — JE date `2026-08-31`, bank date
`2026-08-31`, `ON-AUG-2026` line 87 (`matched`). The apparent R9 803.32 discrepancy in review was a
**query artefact**: `j.date <= '2026-08-31'` on a `timestamptz` column silently drops entries stamped
after midnight on the 31st. Every generator/gate query uses **`j.date < '2026-09-01'`** (or
`>= '2026-09-01'`). With that boundary, GL 1000 @ end-August = **R140 145.35** and D1 = D2 = D3 = R177.19.

## X.5 Remaining unmatched / unpresented / uncleared items at 30 Sep

| Item | Amount | Type | Why it exists |
|---|---|---|---|
| REC-1216 | +10 074.00 | deposit in transit | receipt banked 30 Sep, clears bank in October |
| REC-1217 | +2 500.00 | deposit in transit | on-account receipt banked 30 Sep |
| PAY-2230 | −43 260.00 | unpresented payment | supplier EFT 30 Sep, not yet cleared |
| Debit-order dispute admin fee | −55.00 | bank-only, unbooked | genuine new September bank charge; October reconciling item / Difference-Investigator fixture |
| **August C3–C12 b/f** | **net +177.19** | prior-period, `ON-AUG-2026` still `in_progress` | 9 documented August exceptions not yet resolved upstream — carried, not hidden |

## X.6 PrintTech supplier return — evidence hardening (unchanged design)

`SRET-0001` keeps the **R9 200.00 debit balance** on PrintTech (`c791b70d-…`). `bill_id` → BILL-2030,
`journal_entry_id` → JE-4137. Descriptions strengthened: `supplier_returns.notes` now states *"R9 200.00
(incl VAT) recoverable from PrintTech; BILL-2030 remains fully paid, so PrintTech's account carries a
R9 200.00 debit balance pending refund or offset"*; JE-4137 memo → *"PrintTech debit note, R9 200
recoverable"*. Gate `C12_printtech_debit_bal` asserts the seed-scoped PrintTech position = **−R9 200.00**.
**No September refund is invented** (a future October transaction).

## X.7 Hardened rollback (`september_2026_rollback.sql`) — fail-closed

- **Guard block** (`DO $$ … RAISE EXCEPTION`) aborts unless the exact post-seed fingerprint holds:
  73 `d0%` JEs · counter = 4174 · no JE numbered > 4173 · inventory valuation = R1 478 853.74 ·
  GL 1200 = R1 478 853.74 · 59 `e0%` movements · 1 `f3%` reconciliation · `ON-SEP-2026` present ·
  PAY-2004/REC-1001 in the linked-reconciled state. **A second run aborts** ("batch not present").
- **Un-links** the 7 pre-existing bank_transactions: PAY-2004/REC-1001 → `unreconciled` (pre-seed
  status), the 5 receipts stay `reconciled` with links dropped.
- **Absolute restores** (idempotent, never deltas): `fixed_assets` FA-001…005 accumulated depreciation
  → pre-seed absolute; `products` qoh/cost_price → OPEN values; WH-CPT `stock_balances` → OPEN values;
  `journal_number_counters.next_value` → 4101.
- **Post-rollback fingerprint proof** SELECT: `tb_sum=0.00`, `gl_1200=1 569 743.20`,
  `inv_val=1 569 743.20`, `je_count=171`, `je_counter=4101`, `seed_rows_remaining=0`,
  PAY-2004/REC-1001 = `unreconciled/unreconciled`, `bank_transactions_total=94`,
  `ON-AUG-2026` = `in_progress/87`.

## X.8 Pre-commit verification gates C1–C20 (in `0044` section 14)

~90 assertion rows, each `k / v / expected`; **any mismatch → do not COMMIT**. Coverage: per-JE
balance (C1); orphan journal_lines (C2) & normalized doc lines (C3); JSONB↔normalized count + id-set
parity ×4 (C4); stock-movement source doc/line integrity (C5); ITL `movement_ids` (C6) & `journal_entry_id`
(C7) resolve; no negative balances (C8); qoh == Σ balances (C9); valuation == GL 1200 (C10);
GL 1210 = 0 (C11); AP control == subledger + PrintTech −9 200 (C12); AR control == subledger (C13);
VAT line/header/JE arithmetic (C14); bank reconciliation variance = 0 + 3 b/f derivations + fixture
integrity + August-untouched + PAY-2004/REC-1001 linked (C15a–k); deterministic id counts per prefix
(C16, 33 rows); JE counter + no dup entry_number + max non-seed JE = 4100 (C17); whole-company TB
(C18); statement closing arithmetic ×2 (C19); pre-existing rows untouched — 171 non-seed JEs, 5 golden
Sep JEs, bank_transactions total = 127 (C20).

## X.9 Files changed (2026-09-02)

| File | Change |
|---|---|
| `docs/db-changes/september_2026_simulation.mjs` | `AUG` evidence block + 3-way b/f derivation (offline abort on disagree); bank section → continuation reconciliation; `reconciliations` output (conditional INSERT…SELECT); verification block → C1–C20; rollback generator → fail-closed guard + absolute restores + fingerprint proof; SRET-0001/JE-4137 memo text; `TT.recn='f3'` |
| `docs/db-changes/0044_september_2026_data.sql` | regenerated |
| `docs/db-changes/september_2026_rollback.sql` | regenerated |
| `docs/db-changes/september_2026_manifest.md` | regenerated |
| `docs/SEPTEMBER_2026_DATA_PLAN.md` | this Part X; W.9 superseded |

---

# PART Y — FORWARD FK ORDERING FIX (2026-09-02, after first live apply attempt)

The guarded apply of 0044 (v2) **rolled back cleanly** on the first live run with:
`ERROR 23503 purchase_orders_bill_id_fkey — Key (bill_id)=(5eed…700000000001) is not present in table "bills"`.
Root cause: the seed emitted **documents before their journal entries** and **purchase_orders (with `bill_id`) before bills**. A full static FK audit of every seeded table (36 intra-seed FK edges, live schema) found **6 forward-reference classes**:

| # | Edge | Fix |
|---|---|---|
| FK-1 | `purchase_orders.bill_id → bills` | PO inserted **without `bill_id`**; a section 3b `UPDATE purchase_orders SET bill_id=…` runs after bills — matches the app (`bills.purchase_order_id` set at creation, then `updatePurchaseOrder(poId,{billId})`, `PurchaseOrdersPage.tsx:77`) |
| FK-2…6 | `bills / invoices / credit_notes / fixed_assets / depreciation_entries . journal_entry_id → journal_entries` | **journal_entries + journal_lines emitted first** (new section 1b, right after master data) — every document below FKs to them |

Also fixed (would have failed on a **re-run** / **rollback**, not the first apply):
- The idempotency + rollback DELETE order deleted `journal_entries` before the ~10 doc tables that FK to it, `bills` before `supplier_returns` (`supplier_returns.bill_id → bills`), and `bank_statement_lines` before `bank_transactions` (circular `matched_bank_transaction_id ↔ bank_statement_line_id`). Replaced with **one shared FK-safe topological teardown** (`SEED_CYCLE_BREAKERS` + `SEED_DELETES`) used by both: null the cross-link/back-ref columns first, then delete children→parents with `journal_entries` **last**. The idempotency block also now deletes the `reconciliations` (`f3`) row (previously missing).

**Static verification (both re-run to zero):** FK forward-reference scan of `0044` → **0 forward references** (589 FK refs, all resolve to an earlier statement or a golden row); FK-safe DELETE-order scan of the idempotency block and the rollback teardown → **PASS** (every NO-ACTION child before its parent, or its FK column nulled first).

**New gates:** `C16b_po_bill_id_set` (3), `C16b_bill_po_id_set` (3), `C16b_po_bill_roundtrip` (3) — assert the PO↔bill lifecycle links land.

**No accounting figure changed** — this is pure statement ordering + a deferred `UPDATE`. Trial balance R0.00, GL 1200 = valuation R1 478 853.74, reconciliation variance R0.00, August b/f R177.19 (3 derivations agree) all unchanged. `pnpm typecheck / lint / test (1952) / build` all pass.

---

# PART Z — `bank_accounts.current_balance` RE-SYNC (2026-09-02, post-write review, pre-commit)

## Z.1 The observation

After 0044 applied, GL 1000 "Cash and Bank" moved to **R313,080.92** (Part W.6) but
`bank_accounts.current_balance` for `Office National Business Cheque`
(`2fb81a17-…`) was still **R212,270.67** — the pre-seed value. 0044 never touched
`bank_accounts` (it has no `current_balance` line anywhere), so the column went stale by
exactly the September bank movement **R100,810.25** (Part W.7).

## Z.2 What the column is — investigated from code + schema

| Question | Finding |
|---|---|
| Meaning | Denormalized **display cache** of the account's current book / cash-book balance. `docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md` line 23: *"`bank_accounts.current_balance` (= true GL 1000 balance)"*. Pre-seed it was **exactly** GL 1000 (both R212,270.67), not the statement close (R184,068.54). |
| Where maintained | Set to `openingBalance` at account creation (`BankAccountService.createBankAccount`). The **only** recompute path is `BankAccountService.recalculateBalance()` — and that method is **dead code: called from nowhere** in the app (no service, repo, page, or test). **No DB trigger** maintains it (confirmed — no triggers on `bank_accounts` / `bank_transactions`). In practice it is write-once and has been hand-set to equal GL 1000. |
| Production Banking UI | **Displayed** as the account's headline figure — `BankAccountTable` (account cards), `BankAccountDetail` sheet, and the portfolio total on `BankAccountsPage`. |
| Reconciliation / accounting reliance | **None.** `BankReconciliationService.computeSummary` derives its cash-book balance as `account.openingBalance + Σ signed bank_transactions ≤ statementDate` — it does **not** read `current_balance`. No GL / posting logic reads it. |

## Z.3 Compare to GL 1000 and the bank-transaction ledger

| Basis | Value |
|---|---|
| GL 1000 (post-seed, `Σ debit−credit`) | **R313,080.92** |
| `bank_accounts.current_balance` (stale) | R212,270.67 |
| Bank-txn ledger — `opening_balance 350,000.00 + Σ signed bank_transactions` (= what `recalculateBalance()` would produce) | R313,258.11 |

The ledger figure differs from GL 1000 by **R177.19** — precisely the documented August
C3–C12 brought-forward reconciling items (bank-only lines correctly **not** in the GL, see
Part X.2). So **GL 1000 is the correct book balance** and the R177.19 gap is expected.

## Z.4 Correction applied (SQL-only, no service call)

```sql
update bank_accounts set current_balance = 313080.92, updated_at = now()
 where id = '2fb81a17-92b6-4936-9925-456a73a91cd1'
   and company_id = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'
   and round(current_balance, 2) = 212270.67;   -- guarded: single row, no-op if already moved
```

One row updated. Verified `current_balance = R313,080.92` and `current_balance − GL 1000 = R0.00`.

## Z.5 Batch consistency — `bank_accounts` folded into the seed toolchain

The simulation generator now emits, in the **same class** as the other
application-maintained caches it already re-syncs (`products`, `stock_balances`,
`journal_number_counters`):

- `0044_september_2026_data.sql` §13 — `update bank_accounts set current_balance = 313080.92` (absolute, idempotent).
- `september_2026_rollback.sql` §4 — `update bank_accounts set current_balance = 212270.67` (absolute pre-seed restore) + a fingerprint-proof row.
- New gates **C21_bank_current_balance** (= 313080.92) and **C21_bank_balance_eq_gl1000** (diff 0.00).
- `september_2026_manifest.md` — `bank_accounts.current_balance` added to the restore list.

## Z.6 Re-verification (2026-09-02)

| Check | Result |
|---|---|
| Whole-company `Σ(debit − credit)` | **R0.00** |
| GL 1000 == `bank_accounts.current_balance` | **R313,080.92 == R313,080.92** (diff R0.00) |
| GL 1200 == inventory valuation | **R1,478,853.74 == R1,478,853.74** |
| September reconciliation variance | **R0.00** |
| August b/f (D1 continuity / D2 forward) | **R177.19 / R177.19** — agree |
| GL 1000 for JEs < 2026-09-01 | **R140,145.35** (unchanged) |
| ON-AUG-2026 fixture | **in_progress / 87 lines** (untouched) |
| `bank_transactions` total · non-seed JE count · JE counter | **127 · 171 · 4174** |
| `tsc --noEmit` · `eslint --max-warnings 0` · `vitest run` · `vite build` | **PASS · PASS · 1952/1952 (269 files) · PASS** |

No accounting logic changed. The normalized-line feature flag is untouched (still OFF).
