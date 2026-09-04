import type { SalesOrder } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import { salesOrderRepository, warehouseRepository } from '../repositories/instances';

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
 * or a non-positive quantity is skipped; a warehouse-less line is skipped when
 * there is no default warehouse. Shared verbatim by the global rollup
 * (`getCommitmentMap`) and the single-order contribution (`ownCommitmentMap`)
 * so the two can never disagree on filtering or warehouse fallback.
 */
function accumulateOrderCommitments(
  map: Map<string, number>,
  order: Pick<SalesOrder, 'lineItems'>,
  defaultWarehouseId: string | undefined,
): void {
  for (const line of order.lineItems) {
    const quantity = line.quantity ?? 0;
    if (!line.productId || quantity <= 0) continue;
    const warehouseId = line.warehouseId ?? defaultWarehouseId;
    if (!warehouseId) continue;
    const key = commitmentKey(line.productId, warehouseId);
    map.set(key, (map.get(key) ?? 0) + quantity);
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
  ) {}

  async getCommitmentMap(): Promise<Map<string, number>> {
    const [orders, warehouses] = await Promise.all([
      this.salesOrderRepo.getAll(),
      this.warehouseRepo.getAll(),
    ]);
    const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id;

    const map = new Map<string, number>();
    for (const order of orders) {
      if (order.status !== 'confirmed') continue;
      accumulateOrderCommitments(map, order, defaultWarehouseId);
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
): Map<string, number> {
  const map = new Map<string, number>();
  if (order?.status !== 'confirmed') return map;
  accumulateOrderCommitments(map, order, defaultWarehouseId);
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
export const stockCommitmentService = new StockCommitmentService(salesOrderRepository, warehouseRepository);
