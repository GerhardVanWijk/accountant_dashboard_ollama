import type { ID, Product, StockMovement, StockMovementType } from '@/types';
import type { IStockMovementRepository } from '../repositories/IStockMovementRepository';
import type { IProductRepository } from '../repositories/IProductRepository';
import { productRepository, stockMovementRepository } from '../repositories/instances';
import {
  commitmentKey,
  getCommittedForProduct,
  stockCommitmentService,
  type StockCommitmentLookup,
} from './stockCommitmentService';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `stkmv_${Math.random().toString(36).slice(2, 10)}`;
}

export interface RecordStockMovementInput {
  productId: ID;
  warehouseId: ID;
  type: StockMovementType;
  /** Signed quantity change. Positive = stock in, negative = stock out. */
  quantityDelta: number;
  reference?: string;
  notes?: string;
}

export interface TransferStockInput {
  productId: ID;
  fromWarehouseId: ID;
  toWarehouseId: ID;
  /** Unsigned quantity to move. */
  quantity: number;
  reference?: string;
  notes?: string;
}

export interface AdjustStockInput {
  productId: ID;
  warehouseId: ID;
  /** Signed quantity change (negative for write-off/damage/shrinkage, positive for a found-stock correction). */
  quantityDelta: number;
  /** Required — an adjustment must always explain itself (docs/DO_NOT_BREAK.md: never a bare quantity edit). */
  reason: string;
  reference?: string;
}

export interface OpeningStockInput {
  productId: ID;
  warehouseId: ID;
  quantity: number;
  reference?: string;
  notes?: string;
}

export interface StockLevel {
  productId: ID;
  warehouseId: ID;
  quantityOnHand: number;
}

export interface StockValuation {
  productId: ID;
  quantityOnHand: number;
  /** Weighted Average Cost per unit — see calculateValuation() doc comment. */
  averageUnitCost: number;
  totalValue: number;
}

/**
 * Core stock-control business logic (docs/INVENTORY_DOMAIN.md). This is the
 * ONLY place quantities are computed or changed — components and other
 * services must go through here rather than touching
 * Product.quantityOnHand or the movement ledger directly
 * (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export class StockService {
  constructor(
    private readonly movementRepository: IStockMovementRepository,
    private readonly productRepository: IProductRepository,
    /**
     * Derived stock commitment (Phase 5A). Defaults to the shared singleton;
     * a test injects a fake so `getQuantityAvailable` can be exercised without
     * a Sales Order repository.
     */
    private readonly commitmentSource: StockCommitmentLookup = stockCommitmentService,
  ) {}

  /** The full append-only ledger, newest-independent order as stored (see docs/INVENTORY_DOMAIN.md). */
  async getMovements(): Promise<StockMovement[]> {
    return this.movementRepository.getAll();
  }

  /**
   * Sums the immutable movement ledger for a product, optionally scoped to
   * one warehouse. This IS the on-hand quantity — it is never stored
   * independently of the ledger it's derived from.
   */
  async getQuantityOnHand(productId: ID, warehouseId?: ID): Promise<number> {
    const movements = await this.movementRepository.getAll();
    return movements
      .filter((m) => m.productId === productId && (!warehouseId || m.warehouseId === warehouseId))
      .reduce((total, m) => total + m.quantityDelta, 0);
  }

  /**
   * Quantity Available = Quantity on Hand − Quantity Committed + Quantity
   * on Order (docs/INVENTORY_DOMAIN.md § Stock Quantity Attributes).
   *
   * Quantity Committed is the derived stock commitment (Phase 5A): the sum of
   * confirmed Sales Order line quantities for this product (scoped to
   * `warehouseId` when given, else across every warehouse). It is NOT stored
   * and NOT a stock movement. Quantity on Order (incoming against open
   * Purchase Orders) stays 0 until Phase 6.
   */
  async getQuantityAvailable(productId: ID, warehouseId?: ID): Promise<number> {
    const quantityOnHand = await this.getQuantityOnHand(productId, warehouseId);
    const commitments = await this.commitmentSource.getCommitmentMap();
    const quantityCommitted = warehouseId
      ? commitments.get(commitmentKey(productId, warehouseId)) ?? 0
      : getCommittedForProduct(commitments, productId);
    const quantityOnOrder = 0; // TODO(Phase 6): sum incoming quantity from open Purchase Orders
    return quantityOnHand - quantityCommitted + quantityOnOrder;
  }

  /**
   * Every product's quantity-on-hand at every warehouse, derived by
   * grouping the full ledger. Powers the Warehouses page's "stock by
   * warehouse" view — nothing there computes stock math itself
   * (docs/DO_NOT_BREAK.md § Inventory & Stock).
   */
  async getStockLevels(): Promise<StockLevel[]> {
    const movements = await this.movementRepository.getAll();
    const byKey = new Map<string, StockLevel>();
    for (const m of movements) {
      const key = `${m.productId}__${m.warehouseId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.quantityOnHand += m.quantityDelta;
      } else {
        byKey.set(key, { productId: m.productId, warehouseId: m.warehouseId, quantityOnHand: m.quantityDelta });
      }
    }
    return [...byKey.values()];
  }

  /**
   * The ONLY way stock quantities change. Appends an immutable ledger
   * entry, then recomputes the affected product's aggregate
   * quantityOnHand (summed across all warehouses, since Product is a
   * single-scalar quantityOnHand field, not a per-warehouse map) directly
   * from the ledger, so it can never drift from movement history.
   */
  async recordStockMovement(input: RecordStockMovementInput): Promise<StockMovement> {
    const now = nowISO();
    const movement = await this.movementRepository.create({
      id: generateId(),
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      reference: input.reference,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    });

    const totalOnHand = await this.getQuantityOnHand(input.productId);
    await this.productRepository.update(input.productId, { quantityOnHand: totalOnHand });

    return movement;
  }

  /**
   * Stock Transfer: moves quantity from one warehouse to another as a
   * paired transfer_out / transfer_in ledger entry sharing one reference
   * (docs/INVENTORY_DOMAIN.md). Net effect on the product's total
   * quantityOnHand is zero — only the per-warehouse split changes.
   */
  async transferStock(input: TransferStockInput): Promise<[StockMovement, StockMovement]> {
    const { productId, fromWarehouseId, toWarehouseId, quantity, reference, notes } = input;
    if (quantity <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }
    if (fromWarehouseId === toWarehouseId) {
      throw new Error('Transfer source and destination warehouses must differ.');
    }

    const transferOut = await this.recordStockMovement({
      productId,
      warehouseId: fromWarehouseId,
      type: 'transfer_out',
      quantityDelta: -Math.abs(quantity),
      reference,
      notes,
    });
    const transferIn = await this.recordStockMovement({
      productId,
      warehouseId: toWarehouseId,
      type: 'transfer_in',
      quantityDelta: Math.abs(quantity),
      reference,
      notes,
    });
    return [transferOut, transferIn];
  }

  /**
   * Stock Adjustment: write-off, damage, shrinkage, or a physical
   * stock-take correction. Always requires a reason — never a bare
   * quantity edit (docs/DO_NOT_BREAK.md § Inventory & Stock).
   */
  async adjustStock(input: AdjustStockInput): Promise<StockMovement> {
    if (!input.reason.trim()) {
      throw new Error('A reason is required to record a stock adjustment.');
    }
    if (input.quantityDelta === 0) {
      throw new Error('Adjustment quantity must be non-zero.');
    }
    return this.recordStockMovement({
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: 'adjustment',
      quantityDelta: input.quantityDelta,
      reference: input.reference,
      notes: input.reason,
    });
  }

  /** Opening Stock: initializes a product's balance at a warehouse (also requires notes/reference via the ledger). */
  async recordOpeningStock(input: OpeningStockInput): Promise<StockMovement> {
    if (input.quantity <= 0) {
      throw new Error('Opening stock quantity must be greater than zero.');
    }
    return this.recordStockMovement({
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: 'opening',
      quantityDelta: input.quantity,
      reference: input.reference,
      notes: input.notes,
    });
  }

  /**
   * Weighted Average Cost (WAC) valuation. docs/INVENTORY_DOMAIN.md's
   * Valuation Engine allows FIFO or WAC — WAC is chosen for Phase 1
   * because it needs only the product's current blended cost
   * (Product.costPrice) and its on-hand quantity, both of which the
   * Phase 1 data model already carries. FIFO would require tracking a
   * unit cost per individual goods-received lot/movement, which
   * StockMovement doesn't carry yet — that's a Phase 2 concern once
   * Purchase Orders/GRNs exist to source real landed costs per receipt.
   *
   * Conceptually this value represents the Inventory Asset (1400) debit
   * balance for the item; a valuation variance would post to Inventory
   * Variance / Adjustment Expense (5500) per docs/ACCOUNTING_DOMAIN.md —
   * no real GL posting exists yet, this only computes the number.
   */
  async calculateValuation(product: Product, warehouseId?: ID): Promise<StockValuation> {
    const quantityOnHand = warehouseId
      ? await this.getQuantityOnHand(product.id, warehouseId)
      : product.quantityOnHand;
    const averageUnitCost = product.costPrice;
    return {
      productId: product.id,
      quantityOnHand,
      averageUnitCost,
      totalValue: quantityOnHand * averageUnitCost,
    };
  }

  /** Total inventory valuation across every tracked product (optionally one warehouse). */
  async calculateTotalValuation(warehouseId?: ID): Promise<number> {
    const products = await this.productRepository.getAll();
    const valuations = await Promise.all(
      products.filter((p) => p.trackInventory).map((p) => this.calculateValuation(p, warehouseId)),
    );
    return valuations.reduce((total, v) => total + v.totalValue, 0);
  }

  /**
   * Items at or below their reorder level but still in stock. Exported as
   * a clean, standalone service function (not buried in a component) so
   * other features — e.g. the dashboard's low-stock widget — can call it
   * directly: `stockService.getLowStockItems()`.
   */
  async getLowStockItems(): Promise<Product[]> {
    const products = await this.productRepository.getAll();
    return products.filter(
      (p) =>
        p.trackInventory &&
        p.reorderLevel !== undefined &&
        p.quantityOnHand > 0 &&
        p.quantityOnHand <= p.reorderLevel,
    );
  }

  /** Tracked items with zero (or negative, e.g. an over-committed adjustment) quantity on hand. */
  async getOutOfStockItems(): Promise<Product[]> {
    const products = await this.productRepository.getAll();
    return products.filter((p) => p.trackInventory && p.quantityOnHand <= 0);
  }
}

/** Singleton wired to the shared mock repositories (see ../repositories/instances.ts). */
export const stockService = new StockService(stockMovementRepository, productRepository);
