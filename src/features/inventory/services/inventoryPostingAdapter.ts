import type { ID, Product, StockMovementType, Warehouse } from '@/types';
import { productService } from './productService';
import { stockService } from './stockService';
import { warehouseService } from './warehouseService';
import { stockLotService } from './stockLotService';

/**
 * Narrow surface Sales/Purchases GL posting depends on — composes
 * Inventory's own productService/stockService/warehouseService/
 * stockLotService so invoiceService.ts/billService.ts never need to know
 * about warehouses, stock movements, WAC recalculation, or FIFO lot
 * consumption directly (SA_ACCOUNTING_MASTER_SPEC.md §22-§24: a sale must
 * reduce stock and post Cost of Sales; a purchase of tracked inventory
 * must capitalize to the Inventory asset, not an expense).
 *
 * Every movement method takes an optional `warehouseId` (from
 * `DocumentLineItem.warehouseId`, added 2026-08-22) — when omitted, or
 * when it doesn't resolve to a real warehouse, falls back to the single
 * default warehouse (`Warehouse.isDefault`), so a single-warehouse
 * business (or an older document created before line items carried a
 * warehouse) keeps working unchanged. See docs/KNOWN_ISSUES.md.
 *
 * Cost calculation branches on `Product.valuationMethod` (added
 * 2026-08-22, §23): `'weighted_average'` (the default — every existing
 * product) uses `Product.costPrice`, recalculated on every receipt.
 * `'fifo'` costs from `StockLot` records instead (oldest first) — see
 * stockLotService.ts.
 */
export interface InventoryPoster {
  /** True if this product's cost should capitalize to the Inventory asset rather than being expensed immediately. */
  isTrackedInventory(productId: ID): Promise<boolean>;
  /**
   * Read-only — the Cost of Sales this quantity of this product
   * represents right now (current weighted-average cost, or a FIFO
   * preview from open lots — see class doc). Never mutates stock. 0 if
   * the product doesn't exist or isn't tracked. `warehouseId` matters
   * only for FIFO (lots are tracked per warehouse); ignored for WAC.
   * Throws if the product is FIFO-valued and its open lots can't cover
   * `quantity` — see StockLotService.previewFifoCost().
   */
  calculateCogs(productId: ID, quantity: number, warehouseId?: ID): Promise<number>;
  /**
   * Reduces stock for a sale. Call ONLY after the GL entry it contributes
   * to has posted successfully (mirrors billService.postBill()'s
   * GL-then-mutate ordering) — a failed post must never leave stock
   * reduced with no matching journal entry. For a FIFO product, this is
   * also where lot consumption actually happens (calculateCogs() only
   * ever previews it).
   */
  recordSaleMovement(productId: ID, quantity: number, reference: string, warehouseId?: ID): Promise<void>;
  /**
   * Records stock IN at the real purchase unit cost. Under WAC,
   * recalculates the product's weighted-average cost:
   * newAvgCost = (existingQty × existingAvgCost + receivedQty × unitCost) / (existingQty + receivedQty).
   * Under FIFO, creates a new StockLot at `unitCost` instead (and updates
   * `Product.costPrice` to `unitCost` purely as an informational "most
   * recently received cost" — never used for FIFO's own Cost of Sales
   * math). Call ONLY after the GL entry it contributes to has posted
   * successfully.
   */
  recordReceiptMovement(productId: ID, quantity: number, unitCost: number, reference: string, warehouseId?: ID): Promise<void>;
  /**
   * Restores stock for a customer return (credit note with reason
   * 'return'). Under WAC, deliberately does NOT recalculate
   * weighted-average cost — unlike a purchase receipt, a sales return
   * doesn't represent a new purchase at a new price, it's the same goods
   * coming back at whatever cost they left at. Under FIFO, creates a new
   * lot dated now at `unitCost` (the exact Cost of Sales amount the
   * credit note reversed, so the lot ledger and the GL never disagree) —
   * falls back to the product's current `costPrice` if the caller doesn't
   * supply one. Call ONLY after the GL entry it contributes to has
   * posted successfully.
   */
  recordReturnMovement(productId: ID, quantity: number, reference: string, warehouseId?: ID, unitCost?: number): Promise<void>;
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
  }): Promise<{ id: ID }>;
}
export interface DefaultWarehouseLookup {
  getDefaultWarehouse(): Promise<Warehouse | undefined>;
  /** Resolves an explicit `DocumentLineItem.warehouseId`. Returns undefined for an id that doesn't exist. */
  getWarehouse(id: string): Promise<Warehouse | undefined>;
}
/** Minimal surface of StockLotService this adapter depends on — see stockLotService.ts. */
export interface StockLotMover {
  previewFifoCost(productId: ID, warehouseId: ID, quantity: number): Promise<number>;
  consumeFifoLots(productId: ID, warehouseId: ID, quantity: number): Promise<number>;
  createLot(input: {
    productId: ID;
    warehouseId: ID;
    unitCost: number;
    quantity: number;
    receivedAt: string;
    sourceMovementId: ID;
  }): Promise<unknown>;
}

export class InventoryPostingAdapter implements InventoryPoster {
  constructor(
    private readonly products: ProductLookup,
    private readonly stock: StockMover,
    private readonly warehouses: DefaultWarehouseLookup,
    private readonly stockLots: StockLotMover,
  ) {}

  async isTrackedInventory(productId: ID): Promise<boolean> {
    const product = await this.products.getProduct(productId);
    return Boolean(product?.trackInventory);
  }

  async calculateCogs(productId: ID, quantity: number, warehouseId?: ID): Promise<number> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return 0;
    if (product.valuationMethod === 'fifo') {
      const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);
      if (!resolvedWarehouseId) return 0; // no default warehouse configured — nothing to cost against
      return this.stockLots.previewFifoCost(productId, resolvedWarehouseId, quantity);
    }
    return quantity * product.costPrice;
  }

  /**
   * Resolves which warehouse a movement should post against: the
   * explicitly-requested one if it exists, else the single default —
   * never a hard failure, since a bad/missing id shouldn't block a sale
   * or receipt from posting.
   */
  private async resolveWarehouseId(warehouseId?: ID): Promise<ID | undefined> {
    if (warehouseId) {
      const warehouse = await this.warehouses.getWarehouse(warehouseId);
      if (warehouse) return warehouse.id;
    }
    const fallback = await this.warehouses.getDefaultWarehouse();
    return fallback?.id;
  }

  async recordSaleMovement(productId: ID, quantity: number, reference: string, warehouseId?: ID): Promise<void> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return;
    const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);
    if (!resolvedWarehouseId) return; // no default warehouse configured — nothing to record against
    await this.stock.recordStockMovement({
      productId,
      warehouseId: resolvedWarehouseId,
      type: 'sale',
      quantityDelta: -Math.abs(quantity),
      reference,
    });
    if (product.valuationMethod === 'fifo') {
      await this.stockLots.consumeFifoLots(productId, resolvedWarehouseId, Math.abs(quantity));
    }
  }

  async recordReceiptMovement(
    productId: ID,
    quantity: number,
    unitCost: number,
    reference: string,
    warehouseId?: ID,
  ): Promise<void> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return;
    const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);
    if (!resolvedWarehouseId) return;

    const movement = await this.stock.recordStockMovement({
      productId,
      warehouseId: resolvedWarehouseId,
      type: 'goods_received',
      quantityDelta: Math.abs(quantity),
      reference,
    });

    if (product.valuationMethod === 'fifo') {
      await this.stockLots.createLot({
        productId,
        warehouseId: resolvedWarehouseId,
        unitCost,
        quantity: Math.abs(quantity),
        receivedAt: new Date().toISOString(),
        sourceMovementId: movement.id,
      });
      // Informational only under FIFO — the "most recently received cost",
      // never consulted by calculateCogs()'s FIFO branch. Kept so
      // ProductsTable/ProductForm still show a sensible number instead of
      // a stale or zero costPrice.
      await this.products.updateProduct(productId, { costPrice: unitCost });
      return;
    }

    const existingQty = product.quantityOnHand;
    const newQty = existingQty + quantity;
    const newAverageCost =
      newQty > 0 ? (existingQty * product.costPrice + quantity * unitCost) / newQty : product.costPrice;
    await this.products.updateProduct(productId, { costPrice: newAverageCost });
  }

  async recordReturnMovement(
    productId: ID,
    quantity: number,
    reference: string,
    warehouseId?: ID,
    unitCost?: number,
  ): Promise<void> {
    const product = await this.products.getProduct(productId);
    if (!product || !product.trackInventory) return;
    const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);
    if (!resolvedWarehouseId) return;
    const movement = await this.stock.recordStockMovement({
      productId,
      warehouseId: resolvedWarehouseId,
      type: 'sales_return',
      quantityDelta: Math.abs(quantity),
      reference,
    });

    if (product.valuationMethod === 'fifo') {
      await this.stockLots.createLot({
        productId,
        warehouseId: resolvedWarehouseId,
        unitCost: unitCost ?? product.costPrice,
        quantity: Math.abs(quantity),
        receivedAt: new Date().toISOString(),
        sourceMovementId: movement.id,
      });
    }
    // WAC: deliberately no costPrice change — see class doc.
  }
}

/** Singleton wired to Inventory's real shared services (see ../repositories/instances.ts). */
export const inventoryPoster: InventoryPoster = new InventoryPostingAdapter(
  productService,
  stockService,
  warehouseService,
  stockLotService,
);
