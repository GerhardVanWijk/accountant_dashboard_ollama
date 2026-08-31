import type { Product, ProductCategory, StockBalance, Supplier } from '@/types';

export interface InventoryRow {
  product: Product;
  categoryName: string;
  supplierName: string;
  onHand: number;
  available: number;
  committed: number;
  reorderLevel: number | undefined;
  avgCost: number;
  inventoryValue: number;
  sellingPrice: number;
  marginPercent: number | null;
  stockState: 'in_stock' | 'low' | 'out' | 'untracked';
}

export const STOCK_STATE_LABEL: Record<InventoryRow['stockState'], string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  untracked: 'Not tracked',
};

/**
 * Pure display rollup: one row per product with its stock position, valuation
 * and margin. Company-wide `onHand` (`Product.quantityOnHand`); `available` /
 * `committed` summed across the product's `stock_balances` rows. Nothing is
 * recomputed that a service owns — every input is a field already on the
 * fetched records.
 */
export function buildInventoryRows(
  products: Product[],
  balances: StockBalance[],
  categories: ProductCategory[],
  suppliers: Supplier[],
): InventoryRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
  const committedByProduct = new Map<string, number>();
  const availableByProduct = new Map<string, number>();
  for (const b of balances) {
    committedByProduct.set(b.productId, (committedByProduct.get(b.productId) ?? 0) + b.quantityCommitted);
    availableByProduct.set(
      b.productId,
      (availableByProduct.get(b.productId) ?? 0) + b.quantityOnHand - b.quantityCommitted + b.quantityOnOrder,
    );
  }

  return products.map((product) => {
    const onHand = product.trackInventory ? product.quantityOnHand : 0;
    const committed = committedByProduct.get(product.id) ?? 0;
    const available = availableByProduct.has(product.id)
      ? (availableByProduct.get(product.id) ?? 0)
      : onHand - committed;
    const avgCost = product.costPrice;
    const inventoryValue = product.trackInventory ? onHand * avgCost : 0;
    const marginPercent =
      product.unitPrice > 0 ? ((product.unitPrice - avgCost) / product.unitPrice) * 100 : null;

    let stockState: InventoryRow['stockState'] = 'untracked';
    if (product.trackInventory) {
      if (onHand <= 0) stockState = 'out';
      else if (product.reorderLevel !== undefined && onHand <= product.reorderLevel) stockState = 'low';
      else stockState = 'in_stock';
    }

    return {
      product,
      categoryName:
        (product.categoryId ? categoryById.get(product.categoryId) : undefined) ?? product.category ?? '—',
      supplierName: (product.preferredSupplierId ? supplierById.get(product.preferredSupplierId) : undefined) ?? '—',
      onHand,
      available,
      committed,
      reorderLevel: product.reorderLevel,
      avgCost,
      inventoryValue,
      sellingPrice: product.unitPrice,
      marginPercent,
      stockState,
    };
  });
}
