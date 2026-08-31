import type { ActiveStatus, BaseEntity, ID } from './common';

export type ProductType = 'good' | 'service';

/**
 * How this product's Cost of Sales is calculated (SA_ACCOUNTING_MASTER_SPEC.md
 * §23). `weighted_average` uses `Product.costPrice`, recalculated on every
 * receipt — the only method available before 2026-08-22. `fifo` costs a
 * sale from the oldest still-open `StockLot` records first (see
 * src/types/stockLot.ts / stockLotService.ts) — requires real per-receipt
 * lot data, which only exists from whenever a product is switched to it
 * forward; switching a product with no lot history yet will fail to cost a
 * sale until at least one receipt creates a lot.
 */
export type ValuationMethod = 'weighted_average' | 'fifo';

export interface Product extends BaseEntity {
  sku: string;
  name: string;
  description?: string;
  type: ProductType;
  unitPrice: number;
  /**
   * Under `weighted_average` (the default), this IS the Cost of Sales
   * driver — recalculated by `InventoryPostingAdapter.recordReceiptMovement()`
   * on every receipt. Under `fifo`, this is informational only (the most
   * recent unit cost received, for display/estimation) — actual Cost of
   * Sales comes from `StockLot` consumption instead, never from this field.
   */
  costPrice: number;
  taxRateId?: ID;
  /** Whether stock movements/quantities are tracked for this product. */
  trackInventory: boolean;
  quantityOnHand: number;
  reorderLevel?: number;
  status: ActiveStatus;

  // --- Additive extensions (inventory-bee) — never remove/rename the
  // fields above; these are optional and safe for any existing consumer
  // to ignore.
  barcode?: string;
  /** Unit of measure, e.g. 'EA', 'KG', 'L'. */
  uom?: string;
  category?: string;

  /** Defaults to `'weighted_average'` when absent — every existing product keeps behaving exactly as before. */
  valuationMethod?: ValuationMethod;

  // --- Inventory Accounting Module (Phase 2) additions. All optional; a
  // product with none set behaves exactly as before. See
  // docs/INVENTORY_ARCHITECTURE.md §13.2 and migrations 0024–0025.

  /** FK to `ProductCategory`. `category` (the free-text string above) is kept during the transition and stays populated. */
  categoryId?: ID;
  /** Text shown on sales documents when different from `description`. */
  salesDescription?: string;
  /** Text shown on purchase documents / to suppliers when different from `description`. */
  purchaseDescription?: string;
  /** Default supplier this product is bought from. */
  preferredSupplierId?: ID;
  /** The supplier's own code/SKU for this product. */
  supplierItemCode?: ID;
  /** Quantity to bring the item back up to when reordering (distinct from `reorderLevel`, the trigger point). */
  reorderQuantity?: number;
  /** Target stock level to hold (min/ideal on-hand). */
  preferredStockLevel?: number;
  /**
   * Optional per-product GL account overrides. When set, they win over the
   * product's category mapping, which wins over the generic AccountMappingKey.
   * Never a literal code/UUID in a posting service.
   */
  salesAccountId?: ID;
  inventoryAccountId?: ID;
  cogsAccountId?: ID;
  purchaseAccountId?: ID;
}
