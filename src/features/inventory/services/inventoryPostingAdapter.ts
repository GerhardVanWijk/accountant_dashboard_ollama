import type { ID, Product, StockMovementType, Warehouse } from '@/types';
import { productService } from './productService';
import { stockService } from './stockService';
import { warehouseService } from './warehouseService';

/**
 * Narrow surface Sales/Purchases GL posting depends on — composes
 * Inventory's own productService/stockService/warehouseService so
 * invoiceService.ts/billService.ts never need to know about warehouses,
 * stock movements, or WAC recalculation directly
 * (SA_ACCOUNTING_MASTER_SPEC.md §22-§24: a sale must reduce stock and post
 * Cost of Sales; a purchase of tracked inventory must capitalize to the
 * Inventory asset, not an expense).
 *
 * Every source document line item lacks a `warehouseId` field today, so
 * every movement this adapter records uses the single default warehouse
 * (`Warehouse.isDefault`) — a real, documented simplification (see
 * docs/KNOWN_ISSUES.md), not a silent one.
 */
export interface InventoryPoster {
  /** True if this product's cost should capitalize to the Inventory asset rather than being expensed immediately. */
  isTrackedInventory(productId: ID): Promise<boolean>;
  /** Read-only — the Cost of Sales this quantity of this product represents at its current weighted-average cost. Never mutates stock. 0 if the product doesn't exist or isn't tracked. */
  calculateCogs(productId: ID, quantity: number): Promise<number>;
  /**
   * Reduces stock for a sale. Call ONLY after the GL entry it contributes
   * to has posted successfully (mirrors billService.postBill()'s
   * GL-then-mutate ordering) — a failed post must never leave stock
   * reduced with no matching journal entry.
   */
  recordSaleMovement(productId: ID, quantity: number, reference: string): Promise<void>;
  /**
   * Records stock IN at the real purchase unit cost and recalculates the
   * product's weighted-average cost:
   * newAvgCost = (existingQty × existingAvgCost + receivedQty × unitCost) / (existingQty + receivedQty).
   * Call ONLY after the GL entry it contributes to has posted successfully.
   */
  recordReceiptMovement(productId: ID, quantity: number, unitCost: number, reference: string): Promise<void>;
}

/** Minimal surface this adapter depends on from each Inventory service — narrow interfaces keep it independently testable. */
export interface ProductLookup {
  getProduct(id: string): Promise<Product | undefined>;
  updateProduct(id: string, patch: Partial<Product>): Promise<Product>;
}
export interface StockMover {
  recordStockMovement(input: {
    productId: ID;
    warehouseId: ID;
    type: StockMovementType;
    quantityDelta: number;
    reference?: string;
  }): Promise<unknown>;
}
export interface DefaultWarehouseLookup {
  getDefaultWarehouse(): Promise<Warehouse | undefined>;
}

export class InventoryPostingAdapter implements InventoryPoster {
  constructor(
    private readonly products: ProductLookup,
    private readonly stock: StockMover,
    private readonly warehouses: DefaultWarehouseLookup,
  ) {}

  async isTrackedInventory(productId: ID): Promise<boolean> {
    const product = await this.products.getProduct(productId);
    return Boolean(product?.trackInventory);
  }

  async calculateCogs(productId: ID, quantity: number): Promise<number> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return 0;
    return quantity * product.costPrice;
  }

  async recordSaleMovement(productId: ID, quantity: number, reference: string): Promise<void> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return;
    const warehouse = await this.warehouses.getDefaultWarehouse();
    if (!warehouse) return; // no default warehouse configured — nothing to record against
    await this.stock.recordStockMovement({
      productId,
      warehouseId: warehouse.id,
      type: 'sale',
      quantityDelta: -Math.abs(quantity),
      reference,
    });
  }

  async recordReceiptMovement(productId: ID, quantity: number, unitCost: number, reference: string): Promise<void> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return;
    const warehouse = await this.warehouses.getDefaultWarehouse();
    if (!warehouse) return;

    const existingQty = product.quantityOnHand;
    const newQty = existingQty + quantity;
    const newAverageCost =
      newQty > 0 ? (existingQty * product.costPrice + quantity * unitCost) / newQty : product.costPrice;

    await this.stock.recordStockMovement({
      productId,
      warehouseId: warehouse.id,
      type: 'goods_received',
      quantityDelta: Math.abs(quantity),
      reference,
    });
    await this.products.updateProduct(productId, { costPrice: newAverageCost });
  }
}

/** Singleton wired to Inventory's real shared services (see ../repositories/instances.ts). */
export const inventoryPoster: InventoryPoster = new InventoryPostingAdapter(productService, stockService, warehouseService);
