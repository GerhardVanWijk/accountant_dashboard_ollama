import { describe, expect, it } from 'vitest';
import type { Product, StockMovement } from '@/types';
import { MockProductRepository } from '../repositories/MockProductRepository';
import { MockStockMovementRepository } from '../repositories/MockStockMovementRepository';
import { StockService } from './stockService';

function nowISO(): string {
  return new Date().toISOString();
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_test_1',
    sku: 'TST-001',
    name: 'Test Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 0,
    reorderLevel: 10,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: `stkmv_${Math.random().toString(36).slice(2, 8)}`,
    productId: 'prod_test_1',
    warehouseId: 'wh_test_1',
    type: 'opening',
    quantityDelta: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function setup(products: Product[] = [], movements: StockMovement[] = []) {
  const productRepository = new MockProductRepository(products);
  const movementRepository = new MockStockMovementRepository(movements);
  const stockService = new StockService(movementRepository, productRepository);
  return { stockService, productRepository, movementRepository };
}

describe('StockService', () => {
  describe('getQuantityOnHand', () => {
    it('sums the ledger for a product across all warehouses', async () => {
      const { stockService } = setup(
        [],
        [
          makeMovement({ warehouseId: 'wh_1', quantityDelta: 50 }),
          makeMovement({ warehouseId: 'wh_2', quantityDelta: 20 }),
          makeMovement({ warehouseId: 'wh_1', type: 'sale', quantityDelta: -15 }),
        ],
      );

      await expect(stockService.getQuantityOnHand('prod_test_1')).resolves.toBe(55);
      await expect(stockService.getQuantityOnHand('prod_test_1', 'wh_1')).resolves.toBe(35);
      await expect(stockService.getQuantityOnHand('prod_test_1', 'wh_2')).resolves.toBe(20);
    });
  });

  describe('getQuantityAvailable', () => {
    it('equals Quantity on Hand (Committed and On Order are 0 pending Phase 2)', async () => {
      const { stockService } = setup([], [makeMovement({ warehouseId: 'wh_1', quantityDelta: 30 })]);

      await expect(stockService.getQuantityAvailable('prod_test_1', 'wh_1')).resolves.toBe(30);
    });
  });

  describe('recordStockMovement', () => {
    it('appends a ledger entry and recomputes the product quantityOnHand from the ledger', async () => {
      const product = makeProduct({ quantityOnHand: 0 });
      const { stockService, productRepository } = setup([product], []);

      await stockService.recordStockMovement({
        productId: product.id,
        warehouseId: 'wh_1',
        type: 'goods_received',
        quantityDelta: 25,
        reference: 'GRN-1',
      });

      const updated = await productRepository.getById(product.id);
      expect(updated?.quantityOnHand).toBe(25);

      const movements = await stockService.getMovements();
      expect(movements).toHaveLength(1);
      expect(movements[0].quantityDelta).toBe(25);
    });
  });

  describe('transferStock', () => {
    it('records a paired transfer_out/transfer_in with zero net effect on total quantity', async () => {
      const product = makeProduct();
      const { stockService, productRepository } = setup(
        [product],
        [makeMovement({ warehouseId: 'wh_1', quantityDelta: 50 })],
      );

      const [outMove, inMove] = await stockService.transferStock({
        productId: product.id,
        fromWarehouseId: 'wh_1',
        toWarehouseId: 'wh_2',
        quantity: 20,
      });

      expect(outMove.type).toBe('transfer_out');
      expect(outMove.quantityDelta).toBe(-20);
      expect(inMove.type).toBe('transfer_in');
      expect(inMove.quantityDelta).toBe(20);

      const updated = await productRepository.getById(product.id);
      expect(updated?.quantityOnHand).toBe(50); // unchanged total

      await expect(stockService.getQuantityOnHand(product.id, 'wh_1')).resolves.toBe(30);
      await expect(stockService.getQuantityOnHand(product.id, 'wh_2')).resolves.toBe(20);
    });

    it('rejects a non-positive quantity', async () => {
      const { stockService } = setup([makeProduct()], []);
      await expect(
        stockService.transferStock({
          productId: 'prod_test_1',
          fromWarehouseId: 'wh_1',
          toWarehouseId: 'wh_2',
          quantity: 0,
        }),
      ).rejects.toThrow();
    });
  });

  describe('adjustStock', () => {
    it('requires a reason and records a signed adjustment movement', async () => {
      const product = makeProduct();
      const { stockService, productRepository } = setup(
        [product],
        [makeMovement({ warehouseId: 'wh_1', quantityDelta: 40 })],
      );

      await expect(
        stockService.adjustStock({
          productId: product.id,
          warehouseId: 'wh_1',
          quantityDelta: -5,
          reason: '   ',
        }),
      ).rejects.toThrow();

      const movement = await stockService.adjustStock({
        productId: product.id,
        warehouseId: 'wh_1',
        quantityDelta: -5,
        reason: 'Damaged in transit',
      });

      expect(movement.type).toBe('adjustment');
      expect(movement.notes).toBe('Damaged in transit');

      const updated = await productRepository.getById(product.id);
      expect(updated?.quantityOnHand).toBe(35);
    });
  });

  describe('calculateValuation', () => {
    it('uses Weighted Average Cost: quantityOnHand * costPrice', async () => {
      const product = makeProduct({ quantityOnHand: 10, costPrice: 40 });
      const { stockService } = setup([product], []);

      const valuation = await stockService.calculateValuation(product);
      expect(valuation.averageUnitCost).toBe(40);
      expect(valuation.quantityOnHand).toBe(10);
      expect(valuation.totalValue).toBe(400);
    });
  });

  describe('getLowStockItems / getOutOfStockItems', () => {
    it('classifies items by quantityOnHand vs reorderLevel', async () => {
      const healthy = makeProduct({ id: 'p_healthy', quantityOnHand: 50, reorderLevel: 10 });
      const low = makeProduct({ id: 'p_low', quantityOnHand: 5, reorderLevel: 10 });
      const out = makeProduct({ id: 'p_out', quantityOnHand: 0, reorderLevel: 10 });
      const untracked = makeProduct({ id: 'p_untracked', quantityOnHand: 0, trackInventory: false });

      const { stockService } = setup([healthy, low, out, untracked], []);

      const lowStock = await stockService.getLowStockItems();
      const outOfStock = await stockService.getOutOfStockItems();

      expect(lowStock.map((p) => p.id)).toEqual(['p_low']);
      expect(outOfStock.map((p) => p.id)).toEqual(['p_out']);
    });
  });
});
