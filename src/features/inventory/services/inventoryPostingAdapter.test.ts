import { describe, it, expect } from 'vitest';
import { InventoryPostingAdapter } from './inventoryPostingAdapter';
import { ProductService } from './productService';
import { StockService } from './stockService';
import { WarehouseService } from './warehouseService';
import { StockLotService } from './stockLotService';
import { MockProductRepository } from '../repositories/MockProductRepository';
import { MockStockMovementRepository } from '../repositories/MockStockMovementRepository';
import { MockWarehouseRepository } from '../repositories/MockWarehouseRepository';
import { MockStockLotRepository } from '../repositories/MockStockLotRepository';
import type { Product, StockMovement, Warehouse } from '@/types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'TST-001',
    name: 'Test Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'wh_1',
    name: 'Main Warehouse',
    code: 'MAIN',
    isDefault: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * quantityOnHand is never authoritative on its own — stockService derives
 * it from the movement ledger and overwrites it on every recorded
 * movement (docs/DO_NOT_BREAK.md § Inventory & Stock). So a product
 * fixture with a non-zero starting quantityOnHand needs a matching
 * 'opening' movement seeded here, or the first real movement this
 * adapter records would silently reset quantityOnHand to just that one
 * movement's delta.
 */
function openingMovementFor(product: Product, warehouseId: string): StockMovement[] {
  if (product.quantityOnHand === 0) return [];
  return [
    {
      id: `stkmv_opening_${product.id}`,
      productId: product.id,
      warehouseId,
      type: 'opening',
      quantityDelta: product.quantityOnHand,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

function setup(products: Product[], warehouses: Warehouse[] = [makeWarehouse()]) {
  const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? 'wh_1';
  const productRepo = new MockProductRepository(products);
  const stockRepo = new MockStockMovementRepository(products.flatMap((p) => openingMovementFor(p, defaultWarehouseId)));
  const warehouseRepo = new MockWarehouseRepository(warehouses);
  const stockLotRepo = new MockStockLotRepository();

  const productService = new ProductService(productRepo);
  const stockService = new StockService(stockRepo, productRepo);
  const warehouseService = new WarehouseService(warehouseRepo);
  const stockLotService = new StockLotService(stockLotRepo);

  const adapter = new InventoryPostingAdapter(productService, stockService, warehouseService, stockLotService);
  return { adapter, productService, stockService, stockLotService };
}

describe('InventoryPostingAdapter', () => {
  describe('isTrackedInventory', () => {
    it('is true for a tracked product and false for a non-tracked/unknown one', async () => {
      const { adapter } = setup([makeProduct({ id: 'prod_tracked', trackInventory: true }), makeProduct({ id: 'prod_service', trackInventory: false })]);
      expect(await adapter.isTrackedInventory('prod_tracked')).toBe(true);
      expect(await adapter.isTrackedInventory('prod_service')).toBe(false);
      expect(await adapter.isTrackedInventory('prod_unknown')).toBe(false);
    });
  });

  describe('calculateCogs', () => {
    it('returns quantity * costPrice for a tracked product', async () => {
      const { adapter } = setup([makeProduct({ id: 'prod_1', costPrice: 40 })]);
      expect(await adapter.calculateCogs('prod_1', 5)).toBe(200);
    });

    it('returns 0 for a non-tracked product', async () => {
      const { adapter } = setup([makeProduct({ id: 'prod_1', costPrice: 40, trackInventory: false })]);
      expect(await adapter.calculateCogs('prod_1', 5)).toBe(0);
    });

    it('returns 0 and does not throw for an unknown product', async () => {
      const { adapter } = setup([]);
      expect(await adapter.calculateCogs('prod_missing', 5)).toBe(0);
    });
  });

  describe('recordSaleMovement', () => {
    it('reduces stock at the default warehouse for a tracked product', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20 })]);
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(15);
    });

    it('does nothing for a non-tracked product', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20, trackInventory: false })]);
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(20);
    });

    it('does nothing (does not throw) when there is no default warehouse', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20 })], [makeWarehouse({ isDefault: false })]);
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(20); // unchanged, no default warehouse to post against
    });

    it('posts against an explicit warehouseId instead of the default when one is given', async () => {
      const secondWarehouse = makeWarehouse({ id: 'wh_2', name: 'Branch', code: 'BR', isDefault: false });
      const { adapter, stockService } = setup(
        [makeProduct({ id: 'prod_1', quantityOnHand: 20 })],
        [makeWarehouse(), secondWarehouse],
      );
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001', 'wh_2');
      const movements = (await stockService.getMovements()).filter((m) => m.productId === 'prod_1' && m.type === 'sale');
      expect(movements).toHaveLength(1);
      expect(movements[0].warehouseId).toBe('wh_2');
    });

    it('falls back to the default warehouse when the given warehouseId does not resolve', async () => {
      const { adapter, stockService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20 })]);
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001', 'wh_does_not_exist');
      const movements = (await stockService.getMovements()).filter((m) => m.productId === 'prod_1' && m.type === 'sale');
      expect(movements).toHaveLength(1);
      expect(movements[0].warehouseId).toBe('wh_1'); // the real default
    });
  });

  describe('recordReceiptMovement', () => {
    it('increases stock and recalculates the weighted-average cost', async () => {
      // 20 on hand @ R40, receiving 10 @ R70 -> (20*40 + 10*70) / 30 = 50
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20, costPrice: 40 })]);
      await adapter.recordReceiptMovement('prod_1', 10, 70, 'Bill BILL-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(30);
      expect(product?.costPrice).toBe(50);
    });

    it('sets costPrice to the receipt unit cost when there was no prior stock', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 0, costPrice: 0 })]);
      await adapter.recordReceiptMovement('prod_1', 10, 70, 'Bill BILL-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(10);
      expect(product?.costPrice).toBe(70);
    });

    it('does nothing for a non-tracked product', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20, costPrice: 40, trackInventory: false })]);
      await adapter.recordReceiptMovement('prod_1', 10, 70, 'Bill BILL-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(20);
      expect(product?.costPrice).toBe(40);
    });
  });

  describe('recordReturnMovement', () => {
    it('restores stock without changing the weighted-average cost', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 10, costPrice: 40 })]);
      await adapter.recordReturnMovement('prod_1', 3, 'Credit Note CN-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(13);
      expect(product?.costPrice).toBe(40); // unchanged — a return is not a new purchase at a new price
    });

    it('does nothing for a non-tracked product', async () => {
      const { adapter, productService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 10, trackInventory: false })]);
      await adapter.recordReturnMovement('prod_1', 3, 'Credit Note CN-0001');
      const product = await productService.getProduct('prod_1');
      expect(product?.quantityOnHand).toBe(10);
    });
  });

  describe('FIFO valuation (Product.valuationMethod === "fifo")', () => {
    it('calculateCogs previews cost from open lots instead of quantity * costPrice', async () => {
      const { adapter, stockLotService } = setup([
        makeProduct({ id: 'prod_1', costPrice: 999, valuationMethod: 'fifo' }), // costPrice deliberately wrong/stale to prove it's ignored
      ]);
      await stockLotService.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 10, receivedAt: '2026-08-01', sourceMovementId: 'seed_1' });

      expect(await adapter.calculateCogs('prod_1', 5, 'wh_1')).toBe(200); // 5 * 40, NOT 5 * 999
    });

    it('calculateCogs throws for a FIFO product whose open lots cannot cover the quantity', async () => {
      const { adapter } = setup([makeProduct({ id: 'prod_1', valuationMethod: 'fifo' })]);
      await expect(adapter.calculateCogs('prod_1', 5, 'wh_1')).rejects.toThrow(/insufficient/i);
    });

    it('recordSaleMovement consumes the oldest lot first and leaves the remainder open', async () => {
      const { adapter, stockLotService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 15, valuationMethod: 'fifo' })]);
      await stockLotService.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 5, receivedAt: '2026-08-01T00:00:00.000Z', sourceMovementId: 'seed_1' });
      await stockLotService.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 70, quantity: 10, receivedAt: '2026-08-05T00:00:00.000Z', sourceMovementId: 'seed_2' });

      await adapter.recordSaleMovement('prod_1', 8, 'Invoice INV-0001', 'wh_1');

      const open = await stockLotService.getOpenLots('prod_1', 'wh_1');
      expect(open).toHaveLength(1);
      expect(open[0].unitCost).toBe(70);
      expect(open[0].quantityRemaining).toBe(7); // 5 fully consumed from the oldest lot, 3 from this one
    });

    it('recordSaleMovement does nothing to lots for a WAC (non-FIFO) product', async () => {
      const { adapter, stockLotService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 20, costPrice: 40 })]); // default valuationMethod
      await adapter.recordSaleMovement('prod_1', 5, 'Invoice INV-0001', 'wh_1');
      expect(await stockLotService.getOpenLots('prod_1', 'wh_1')).toEqual([]); // no lots ever created/touched for WAC
    });

    it('recordReceiptMovement creates a new lot instead of recalculating weighted-average cost', async () => {
      const { adapter, productService, stockLotService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 10, costPrice: 40, valuationMethod: 'fifo' })]);
      await adapter.recordReceiptMovement('prod_1', 5, 70, 'Bill BILL-0001', 'wh_1');

      const open = await stockLotService.getOpenLots('prod_1', 'wh_1');
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ unitCost: 70, quantityReceived: 5, quantityRemaining: 5 });

      // costPrice is updated to the received cost — informational only under FIFO, never WAC-blended.
      const product = await productService.getProduct('prod_1');
      expect(product?.costPrice).toBe(70);
    });

    it('recordReturnMovement creates a new lot at the given unitCost', async () => {
      const { adapter, stockLotService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 5, costPrice: 999, valuationMethod: 'fifo' })]);
      await adapter.recordReturnMovement('prod_1', 3, 'Credit Note CN-0001', 'wh_1', 55);

      const open = await stockLotService.getOpenLots('prod_1', 'wh_1');
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ unitCost: 55, quantityReceived: 3, quantityRemaining: 3 }); // NOT 999
    });

    it('recordReturnMovement falls back to the product costPrice when no unitCost is given', async () => {
      const { adapter, stockLotService } = setup([makeProduct({ id: 'prod_1', quantityOnHand: 5, costPrice: 62, valuationMethod: 'fifo' })]);
      await adapter.recordReturnMovement('prod_1', 3, 'Credit Note CN-0001', 'wh_1');

      const open = await stockLotService.getOpenLots('prod_1', 'wh_1');
      expect(open[0].unitCost).toBe(62);
    });
  });
});
