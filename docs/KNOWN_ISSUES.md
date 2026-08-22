# Known Issues

Running log of real issues hit during hive development — not a bug tracker for the
product itself (no real users yet), but a record of things that were true problems
during the build, whether fixed, worked around, or still open. Newest first within
each section.

## Open

### No Bill-line capitalization path into the Fixed Asset Register
`FixedAsset.sourceBillId` (`src/types/fixedAsset.ts`) exists specifically for this, but
nothing sets it yet — an asset can only be registered manually on the Asset Register
page (2026-08-22), not by flagging a Bill line item as "this is a fixed asset, not an
expense" the way Inventory lines already capitalize via `billService.postBill()`'s
tracked-product check. A user buying, say, a delivery vehicle on a supplier Bill today
has to record the Bill as a normal expense/AP posting AND separately register + post
the acquisition on the Asset Register — two disconnected postings for one real-world
purchase, not one Bill driving both. Fixing this means threading an
"is this line a fixed asset" flag (or a `FixedAsset` link) through `Bill`'s line items
and `billService.postBill()`'s expense/inventory split, the same shape of change
Inventory capitalization already made there — deliberately not attempted in the same
pass that built the register/depreciation/disposal/tax-register engine, to keep that
change reviewable on its own.

### Invoice/Bill "Record Payment" actions exist as component props but are never wired up
`InvoiceDetail`'s `onRecordPayment` and `BillDetail`'s `onRecordPayment` (both take an
id and expect the parent page to collect an amount and call
`invoiceService`/`billService`'s real `recordPayment()`) are never passed from
`InvoicesPage`/`BillsPage` — found 2026-08-22 while fixing the adjacent "no way to
post from the UI" gap (see Resolved below) in the same two files. Neither page has an
amount-entry UI to drive them yet (no existing pattern to reuse — `CustomerReceiptForm`
handles the Sales-side receipt-allocation flow but takes a different shape). Distinct
from the posting gap: an invoice/bill can now be created and posted through the UI,
just not paid down, through this UI, yet.

### AR/AP subledger reconciliation still shows a variance for partially-paid seed documents
`generateSeedPostings.ts` (2026-08-21) backfilled the ORIGINAL posting entry for every
non-draft/non-void seed Invoice/Bill (see Resolved below), which is enough for VAT
reconciliation to hold — VAT is fully recognized at posting time, unaffected by later
payment status. It is NOT enough for the AR/AP subledger reconciliation
(`reconcileAccountsReceivable`/`reconcileAccountsPayable`) to show zero variance for any
seed document with `amountPaid > 0` (several seed invoices/bills are `paid`/
`partially_paid`): the GL's AR/AP control account balance reflects the FULL original
posting, while the subledger total (`total - amountPaid`) is net of payments that have
no matching GL credit. Fixing this means also backfilling matching receipt/payment
journal entries (crediting AR/debiting AP for each `amountPaid`), which is a
meaningfully larger undertaking than the VAT-focused posting backfill done here — not
attempted in this pass. Confirmed via `vatReportService.test.ts`'s integration test that
VAT reconciliation itself is clean; this is specifically the AR/AP side, deliberately
scoped out.

### GL posting engine has no storage-layer enforcement of the balance invariant
`JournalEntryService.postJournalEntry()` (`src/features/accounting/services/`)
validates sum(debit) === sum(credit) in application code before writing, but the mock
repository is an in-memory array with no `CHECK` constraint or transaction backing it.
Fine for a single-writer mock; a real backend must also enforce this at the storage
layer (DB constraint or serializable transaction), since application code alone can't
stop a second writer from bypassing the service. See `docs/LEDGER_ARCHITECTURE.md`.

### GL posting engine has no currency dimension yet
`JournalLine` (`src/types/journalEntry.ts`) has no currency/exchange-rate field, so
every seeded account and posting is implicitly single-currency even though
`CurrencyCode` exists as a shared primitive. Needs solving before multi-currency
invoices/bills can post to the GL. See `docs/LEDGER_ARCHITECTURE.md` § Known gaps.

### Aging-bucket key-name inconsistency between Customers and Suppliers
`src/features/customers/utils/calculateAging.ts` and
`src/features/suppliers/utils/calculateAging.ts` were built independently (parallel
Wave 1 dispatch) and produce differently-shaped bucket objects for the same concept:
- Customers: `{ current, days1to30, days31to60, days61Plus, total }`
- Suppliers: `{ current, days30, days60, days90Plus, total }`

Neither is wrong in isolation, and Dashboard Bee correctly normalized both into a
shared `FleetAgingBuckets` shape (`src/features/dashboard/types/aging.types.ts`)
rather than assuming they matched — so nothing is currently broken. But the
inconsistency itself is still there in the two source files and will confuse anyone
extending either module directly. Worth a small cleanup pass to converge on one
bucket-naming convention across both.

### Dashboard financials are fully mocked
Revenue/Expenses/Profit and the Cash Flow chart have no real General Ledger or Banking
data to draw from yet (`src/features/dashboard/mock-data/financials.ts`, commented
`TEMPORARY`). Will need rewiring once the Accounting/Banking modules exist.

### Two GitHub identities in play
`gh auth status` shows two authenticated accounts (`GerhardVanWijk` active,
`Gerhard29046` inactive); the local git commit email for this repo is
`gerhard.ark.of.war@gmail.com` (repo-local override, set 2026-08-20, not the global
git config). This is intentional per explicit user instruction, not a misconfiguration
— noted here only so a future session doesn't "fix" it back to the global default.

### CRLF/LF git warnings on every commit
Every commit prints a `LF will be replaced by CRLF` warning per changed file (Windows
checkout, no `.gitattributes` committed). Harmless, but noisy. A `.gitattributes`
pinning `* text=auto eol=lf` (or accepting CRLF explicitly) would silence it.

## Resolved

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
