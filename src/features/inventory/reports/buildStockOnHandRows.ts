import type { Product, ProductCategory, StockBalance, Supplier, Warehouse } from '@/types';
import { quantityAvailable } from '@/types/stockBalance';

export type StockOnHandStatus = 'in_stock' | 'low' | 'out';

export const STOCK_ON_HAND_STATUS_LABEL: Record<StockOnHandStatus, string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export interface StockOnHandRow {
  product: Product;
  warehouse: Warehouse;
  categoryName: string;
  supplierName: string;
  onHand: number;
  available: number;
  committed: number;
  reorderLevel: number | undefined;
  reorderQuantity: number | undefined;
  /** Company-wide weighted-average cost (`Product.costPrice`) — WAC is one number per product, not per warehouse (docs/INVENTORY_ARCHITECTURE.md §Valuation). */
  wac: number;
  /** `onHand × wac`, per this warehouse's slice of the product. Summing this across every row reproduces the authoritative subledger total (`reconcileInventory()`'s round-after-sum figure) to the cent — see `buildStockOnHandRows.test.ts`. */
  inventoryValue: number;
  status: StockOnHandStatus;
}

/**
 * The ONE row-per-(product, warehouse) authoritative build every STOCK
 * report (Stock on Hand, Valuation, Low Stock, Out of Stock, Warehouse
 * Analysis, Category Analysis, Margin Analysis) starts from — Phase 8 spec
 * §1 classification A: every field here is read directly off `Product` /
 * `StockBalance`, nothing is independently recalculated. Only TRACKED
 * products with an actual `stock_balances` row are included (an untracked
 * product, or a tracked product with no balance row for a warehouse yet,
 * has no meaningful on-hand position to report).
 *
 * Valuation uses the same WAC × quantity identity as `reconcileInventory()`
 * and `buildInventoryRows()` (Phase 4) — `Product.costPrice`, the one
 * company-wide weighted-average cost, applied to this warehouse's slice of
 * quantity. No per-line rounding here (reports display, they don't post);
 * a report's own total row sums the already-2dp `inventoryValue` values with
 * `sumMoney()` (see the report pages), matching the accounting convention
 * used everywhere else in this module.
 */
export function buildStockOnHandRows(
  products: Product[],
  balances: StockBalance[],
  categories: ProductCategory[],
  suppliers: Supplier[],
  warehouses: Warehouse[],
): StockOnHandRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows: StockOnHandRow[] = [];
  for (const balance of balances) {
    const product = productById.get(balance.productId);
    const warehouse = warehouseById.get(balance.warehouseId);
    if (!product || !product.trackInventory || !warehouse) continue;

    const onHand = balance.quantityOnHand;
    const available = quantityAvailable(balance);
    const wac = product.costPrice;
    const inventoryValue = onHand * wac;

    let status: StockOnHandStatus = 'in_stock';
    if (onHand <= 0) status = 'out';
    else if (product.reorderLevel !== undefined && onHand <= product.reorderLevel) status = 'low';

    rows.push({
      product,
      warehouse,
      categoryName: (product.categoryId ? categoryById.get(product.categoryId) : undefined) ?? product.category ?? '—',
      supplierName: (product.preferredSupplierId ? supplierById.get(product.preferredSupplierId) : undefined) ?? '—',
      onHand,
      available,
      committed: balance.quantityCommitted,
      reorderLevel: product.reorderLevel,
      reorderQuantity: product.reorderQuantity,
      wac,
      inventoryValue,
      status,
    });
  }
  return rows;
}

/**
 * `max(reorderQuantity, preferredStockLevel − available)` — the ONE
 * documented suggested-order-quantity rule (spec §5), using only the two
 * schema fields that already carry that exact semantic
 * (`Product.reorderQuantity`, `Product.preferredStockLevel`). Returns
 * `undefined` when neither field is set on the product — no purchasing
 * recommendation is invented from thin air.
 */
export function suggestedOrderQuantity(row: Pick<StockOnHandRow, 'available' | 'reorderQuantity' | 'product'>): number | undefined {
  const { reorderQuantity, product, available } = row;
  const preferredStockLevel = product.preferredStockLevel;
  if (reorderQuantity === undefined && preferredStockLevel === undefined) return undefined;
  const toTarget = preferredStockLevel !== undefined ? preferredStockLevel - available : undefined;
  if (reorderQuantity !== undefined && toTarget !== undefined) return Math.max(reorderQuantity, toTarget);
  return reorderQuantity ?? toTarget;
}
