import type { Product, StockBalance, StockTransfer, Warehouse } from '@/types';
import { commitmentKey } from '../services/stockCommitmentService';

export interface WarehouseAggregate {
  warehouse: Warehouse;
  /** Distinct tracked products with a balance row here. */
  productLines: number;
  onHand: number;
  committed: number;
  available: number;
  /** Inbound on `in_transit` transfers headed here. */
  inTransitIn: number;
  /** Outbound on `in_transit` transfers dispatched from here. */
  inTransitOut: number;
  stockValue: number;
  /** Products whose on-hand at this warehouse is > 0 but ≤ their reorder level. */
  lowStockItems: number;
  /** Products with a negative on-hand at this warehouse. */
  negativeStockItems: number;
}

/**
 * Per-warehouse rollup for the Warehouses control view. Pure — every input is
 * an already-fetched record or a derived map (`commitments` from
 * `stockCommitmentService`). No valuation engine is re-implemented: stock
 * value is `Σ qty × product.costPrice` rounded to cents, the same shape the
 * item detail uses.
 */
export function warehouseAggregates(
  warehouses: Warehouse[],
  balances: StockBalance[],
  products: Product[],
  transfers: StockTransfer[],
  commitments: Map<string, number> = new Map(),
): WarehouseAggregate[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const balancesByWarehouse = new Map<string, StockBalance[]>();
  for (const b of balances) {
    const list = balancesByWarehouse.get(b.warehouseId) ?? [];
    list.push(b);
    balancesByWarehouse.set(b.warehouseId, list);
  }

  const transitIn = new Map<string, number>();
  const transitOut = new Map<string, number>();
  for (const t of transfers) {
    if (t.status !== 'in_transit') continue;
    const qty = (t.lineItems ?? []).reduce((s, l) => s + l.quantity, 0);
    transitOut.set(t.fromWarehouseId, (transitOut.get(t.fromWarehouseId) ?? 0) + qty);
    transitIn.set(t.toWarehouseId, (transitIn.get(t.toWarehouseId) ?? 0) + qty);
  }

  return warehouses.map((warehouse) => {
    const rows = balancesByWarehouse.get(warehouse.id) ?? [];
    let onHand = 0;
    let committed = 0;
    let stockValue = 0;
    let lowStockItems = 0;
    let negativeStockItems = 0;
    for (const b of rows) {
      const product = productById.get(b.productId);
      if (!product?.trackInventory) continue;
      onHand += b.quantityOnHand;
      committed += commitments.get(commitmentKey(b.productId, warehouse.id)) ?? 0;
      stockValue += b.quantityOnHand * product.costPrice;
      if (b.quantityOnHand < 0) negativeStockItems += 1;
      else if (
        b.quantityOnHand > 0 &&
        product.reorderLevel !== undefined &&
        b.quantityOnHand <= product.reorderLevel
      ) {
        lowStockItems += 1;
      }
    }
    return {
      warehouse,
      productLines: rows.filter((b) => productById.get(b.productId)?.trackInventory).length,
      onHand,
      committed,
      available: onHand - committed,
      inTransitIn: transitIn.get(warehouse.id) ?? 0,
      inTransitOut: transitOut.get(warehouse.id) ?? 0,
      stockValue: Math.round((stockValue + Number.EPSILON) * 100) / 100,
      lowStockItems,
      negativeStockItems,
    };
  });
}
