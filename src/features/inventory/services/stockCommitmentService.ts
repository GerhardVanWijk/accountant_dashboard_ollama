import type { SalesOrder } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { IDeliveryNoteRepository } from '@/repositories/IDeliveryNoteRepository';
import { sumPhysicallyIssuedBySalesOrderLine } from '@/features/sales/utils/salesOrderFulfilment';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import { invoiceRepository, salesOrderRepository, warehouseRepository, deliveryNoteRepository } from '../repositories/instances';

/** Narrow read surface this service needs from IDeliveryNoteRepository — keeps the default stub trivial. */
type DeliveryNoteLookup = Pick<IDeliveryNoteRepository, 'getAll'>;

/**
 * Stable per-(product, warehouse) key. Shared by the commitment map, the
 * read-path hydrator (`applyStockCommitments`) and the two availability
 * services so a commitment and the balance row it hydrates always agree.
 */
export function commitmentKey(productId: string, warehouseId: string): string {
  return `${productId}__${warehouseId}`;
}

/**
 * The narrow read contract `stockService` / `stockBalanceService` depend on —
 * keeps them off the concrete class (and lets a test inject a fake without a
 * repository).
 */
export interface StockCommitmentLookup {
  getCommitmentMap(): Promise<Map<string, number>>;
}

/**
 * Fold ONE order's lines into `map`, keyed by
 * `commitmentKey(productId, warehouseId ?? defaultWarehouseId)` and summed
 * (so multiple lines of the same product in the same warehouse add up, and
 * different warehouses stay in separate buckets). A line with no `productId`
 * or a non-positive **remaining** quantity is skipped; a warehouse-less line is
 * skipped when there is no default warehouse. Shared verbatim by the global
 * rollup (`getCommitmentMap`) and the single-order contribution
 * (`ownCommitmentMap`) so the two can never disagree on filtering, warehouse
 * fallback, or how much has been fulfilled.
 *
 * Phase 5C (docs/DELIVERY_NOTES_DESIGN.md Part 3): the committed quantity for
 * a line is its REMAINING un-issued quantity —
 * `max(0, orderedQty − physicalFulfilledQty)` — where `fulfilledByLine`
 * (the param name is unchanged; it now carries `sumPhysicallyIssuedBySalesOrderLine`'s
 * result, `deliveredQty + directlyInvoicedQty`, not just posted-invoice qty).
 * With an empty map this reduces exactly to the Phase 5A rule
 * (`committed = orderedQty`); with no Delivery Notes ever posted it reduces
 * exactly to the Phase 5B.3 rule (`committed = orderedQty − postedFulfilledQty`)
 * — proven in `stockCommitmentService.test.ts`. A DRAFT invoice or a DRAFT
 * Delivery Note is deliberately NOT in this map — neither ever releases
 * commitment; only a POSTED physical departure does. A delivery-linked
 * invoice line does NOT reduce commitment a second time (the
 * double-subtraction guard, `sumDirectlyInvoicedBySalesOrderLine`'s own
 * `deliveryNoteLineId` exclusion).
 */
function accumulateOrderCommitments(
  map: Map<string, number>,
  order: Pick<SalesOrder, 'lineItems'>,
  defaultWarehouseId: string | undefined,
  fulfilledByLine: Map<string, number>,
): void {
  for (const line of order.lineItems) {
    const ordered = line.quantity ?? 0;
    if (!line.productId || ordered <= 0) continue;
    const remaining = Math.max(0, ordered - (fulfilledByLine.get(line.id) ?? 0));
    if (remaining <= 0) continue;
    const warehouseId = line.warehouseId ?? defaultWarehouseId;
    if (!warehouseId) continue;
    const key = commitmentKey(line.productId, warehouseId);
    map.set(key, (map.get(key) ?? 0) + remaining);
  }
}

/**
 * Derived stock commitment (Phase 5A). `stock_balances.quantity_committed`
 * stays **0 in storage** — there is NO schema change, NO `stock_reservations`
 * table, NO migration, NO Supabase write, and NO `stock_movement` is ever
 * created by a commitment. The real committed quantity is recomputed on read
 * from confirmed Sales Order lines, exactly the way aging / margin are already
 * derived.
 *
 * Commit rule: while a Sales Order is `confirmed`, each of its lines commits
 * its full ordered quantity of `productId` at `line.warehouseId` (falling back
 * to `Warehouse.isDefault` when the line carries none).
 * Release rule: `pending`, `fulfilled` and `cancelled` orders commit nothing —
 * so confirming an order commits stock and `convertToInvoice()` (which flips the
 * order to `fulfilled`) releases it, with no extra bookkeeping.
 * A line with no `productId` or a non-positive quantity commits nothing.
 *
 * Layering: this service depends on `ISalesOrderRepository` (the repository
 * interface, imported from `@/repositories`), never on `salesOrderService` —
 * so there is no inventory ↔ sales service cycle.
 */
export class StockCommitmentService implements StockCommitmentLookup {
  constructor(
    private readonly salesOrderRepo: ISalesOrderRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    /**
     * Phase 5B.3: read-only source of the invoices used to net each confirmed
     * SO line down to its REMAINING commitment. Only `getAll()` is called.
     * Never posts, never creates a movement — a commitment stays derived.
     */
    private readonly invoiceRepo: IInvoiceRepository,
    /**
     * Phase 5C: read-only source of POSTED Delivery Note evidence, netted
     * into the SAME commitment formula alongside directly-invoiced quantity
     * (`sumPhysicallyIssuedBySalesOrderLine`). Optional, defaults to an
     * empty-returning stub so every pre-5C construction of this class
     * (every existing test) is byte-unchanged.
     */
    private readonly deliveryNoteRepo: DeliveryNoteLookup = { getAll: async () => [] },
  ) {}

  async getCommitmentMap(): Promise<Map<string, number>> {
    const [orders, warehouses, invoices, deliveryNotes] = await Promise.all([
      this.salesOrderRepo.getAll(),
      this.warehouseRepo.getAll(),
      this.invoiceRepo.getAll(),
      this.deliveryNoteRepo.getAll(),
    ]);
    const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id;
    // Σ (deliveredQty + directlyInvoicedQty) per SO line — drafts (of either
    // kind) excluded, a delivery-linked invoice line excluded from the
    // "directly invoiced" side (already counted via deliveredQty) — see
    // `sumPhysicallyIssuedBySalesOrderLine`'s own doc comment.
    const fulfilledByLine = sumPhysicallyIssuedBySalesOrderLine(invoices, deliveryNotes);

    const map = new Map<string, number>();
    for (const order of orders) {
      if (order.status !== 'confirmed') continue;
      accumulateOrderCommitments(map, order, defaultWarehouseId, fulfilledByLine);
    }
    return map;
  }
}

/**
 * The CURRENT (being-edited) Sales Order's own contribution to the global
 * commitment map — same `commitmentKey(productId, warehouseId ?? default)`
 * semantics, summed across every one of its lines. Returns an EMPTY map unless
 * the PERSISTED order's status is `confirmed` (a `pending` / `fulfilled` /
 * `cancelled` order contributes nothing to the global map, so there is nothing
 * to subtract).
 *
 * This exists only for the document-context availability layer in
 * `SalesOrderForm`: when you edit an already-`confirmed` order, the global
 * `getCommitmentMap()` already contains that order's quantities, so without
 * this subtraction the line editor would tell the user its own reserved units
 * are "committed to other orders". The global map, the inventory register, the
 * product detail and the stock reports are UNAFFECTED — they must keep
 * counting the order normally.
 *
 * Pass the order exactly as loaded from persistence (`SalesOrderForm`'s
 * `salesOrder` prop), NOT the live-edited form state — the global map reflects
 * what is persisted, and live line edits are already netted separately by the
 * editor's own `committedElsewhere`.
 */
export function ownCommitmentMap(
  order: Pick<SalesOrder, 'status' | 'lineItems'> | undefined,
  defaultWarehouseId: string | undefined,
  /**
   * Phase 5C: Σ (deliveredQty + directlyInvoicedQty) per SO line
   * (`sumPhysicallyIssuedBySalesOrderLine(invoices, deliveryNotes)`), so the
   * "own" contribution nets physical-departure progress exactly the way the
   * global map does. Omit (or pass an empty map) for the pre-5B.3
   * whole-quantity behaviour.
   */
  fulfilledByLine: Map<string, number> = new Map(),
): Map<string, number> {
  const map = new Map<string, number>();
  if (order?.status !== 'confirmed') return map;
  accumulateOrderCommitments(map, order, defaultWarehouseId, fulfilledByLine);
  return map;
}

/**
 * Document-context external commitment: the global committed quantity for a
 * `(productId, warehouseId)` MINUS the current order's own contribution
 * (`ownCommitmentMap`), floored at 0. When `warehouseId` is omitted, both
 * sides are summed across every warehouse for the product.
 *
 * `own` is empty for a create-mode form and for any non-`confirmed` persisted
 * order, so this returns the plain global figure in those cases.
 */
export function externalCommittedFor(
  global: Map<string, number>,
  own: Map<string, number>,
  productId: string,
  warehouseId?: string,
): number {
  if (warehouseId) {
    const key = commitmentKey(productId, warehouseId);
    return Math.max(0, (global.get(key) ?? 0) - (own.get(key) ?? 0));
  }
  return Math.max(
    0,
    getCommittedForProduct(global, productId) - getCommittedForProduct(own, productId),
  );
}

/** Total committed quantity across every warehouse for one product. */
export function getCommittedForProduct(map: Map<string, number>, productId: string): number {
  const prefix = `${productId}__`;
  let total = 0;
  for (const [key, quantity] of map) {
    if (key.startsWith(prefix)) total += quantity;
  }
  return total;
}

/**
 * Singleton. Read-only, used by `stockCommitmentService` consumers for the
 * derived commitment model (Phase 5A). A second Supabase-backed
 * `SupabaseSalesOrderRepository` instance is safe here: it is a shared
 * database with no in-memory divergence (unlike a `Mock*Repository`), so this
 * never disagrees with the sales feature's own instance.
 */
export const stockCommitmentService = new StockCommitmentService(
  salesOrderRepository,
  warehouseRepository,
  invoiceRepository,
  deliveryNoteRepository,
);
