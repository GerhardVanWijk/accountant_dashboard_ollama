import type { Product } from '@/types';

export interface InventoryTotals {
  /** Sum of quantityOnHand × costPrice, tracked-inventory products only — what the balance sheet actually carries. */
  stockValueAtCost: number;
  /** Sum of quantityOnHand × unitPrice, tracked-inventory products only — potential revenue if all stock sold at list price. */
  stockValueAtSelling: number;
  /** stockValueAtSelling − stockValueAtCost. */
  potentialMargin: number;
  /** Count of tracked-inventory products carrying stock (quantityOnHand > 0). */
  lineCount: number;
}

/**
 * Pure display rollup over already-fetched Products for the Products page's
 * summary row — mirrors v0's inventory page (`inventoryTotals`), adapted to
 * the real `Product.trackInventory` distinction v0's mock doesn't have: a
 * service-type or non-tracked product has no real stock quantity or
 * carrying value, so it's excluded from every figure here rather than
 * silently contributing `0 × price`. Not a service/accounting calculation —
 * every input is a field already on the fetched Product, nothing is
 * recomputed that stockService/productService own.
 */
export function calculateInventoryTotals(products: Product[]): InventoryTotals {
  const tracked = products.filter((p) => p.trackInventory);

  const stockValueAtCost = tracked.reduce((sum, p) => sum + p.quantityOnHand * p.costPrice, 0);
  const stockValueAtSelling = tracked.reduce((sum, p) => sum + p.quantityOnHand * p.unitPrice, 0);

  return {
    stockValueAtCost,
    stockValueAtSelling,
    potentialMargin: stockValueAtSelling - stockValueAtCost,
    lineCount: tracked.filter((p) => p.quantityOnHand > 0).length,
  };
}
