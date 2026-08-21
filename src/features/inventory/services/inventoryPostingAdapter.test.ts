import { describe, it, expect } from 'vitest';
import { InventoryPostingAdapter } from './inventoryPostingAdapter';
import { ProductService } from './productService';
import { StockService } from './stockService';
import { WarehouseService } from './warehouseService';
import { MockProductRepository } from '../repositories/MockProductRepository';
import { MockStockMovementRepository } from '../repositories/MockStockMovementRepository';
import { MockWarehouseRepository } from '../repositories/MockWarehouseRepository';
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

  const productService = new ProductService(productRepo);
  const stockService = new StockService(stockRepo, productRepo);
  const warehouseService = new WarehouseService(warehouseRepo);

  const adapter = new InventoryPostingAdapter(productService, stockService, warehouseService);
  return { adapter, productService, stockService };
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
});
