import { describe, expect, it } from 'vitest';
import type { StockBalance, StockMovement } from '@/types';
import { MockStockBalanceRepository } from '../repositories/MockStockBalanceRepository';
import { StockBalanceService } from './stockBalanceService';

function nowISO(): string {
  return new Date().toISOString();
}

function makeBalance(overrides: Partial<StockBalance> = {}): StockBalance {
  return {
    id: `stkbal_${Math.random().toString(36).slice(2, 8)}`,
    productId: 'prod_1',
    warehouseId: 'wh_1',
    quantityOnHand: 0,
    quantityCommitted: 0,
    quantityOnOrder: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: `stkmv_${Math.random().toString(36).slice(2, 8)}`,
    productId: 'prod_1',
    warehouseId: 'wh_1',
    type: 'opening',
    quantityDelta: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function setup(seed: StockBalance[] = []) {
  const repository = new MockStockBalanceRepository(seed);
  const service = new StockBalanceService(repository);
  return { service, repository };
}

describe('StockBalanceService', () => {
  describe('applyDelta', () => {
    it('creates a row on first delta, then increments it in place', async () => {
      const { service } = setup();

      const created = await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 25 });
      expect(created.quantityOnHand).toBe(25);
      expect(created.quantityCommitted).toBe(0);
      expect(created.quantityOnOrder).toBe(0);

      const incremented = await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: -10 });
      expect(incremented.quantityOnHand).toBe(15);
      expect(incremented.id).toBe(created.id);

      await expect(service.getBalances()).resolves.toHaveLength(1);
      await expect(service.getBalance('prod_1', 'wh_1')).resolves.toMatchObject({ quantityOnHand: 15 });
    });

    it('keeps (product, warehouse) rows isolated', async () => {
      const { service } = setup();
      await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 30 });
      await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_2', quantityDelta: 5 });
      await service.applyDelta({ productId: 'prod_2', warehouseId: 'wh_1', quantityDelta: 7 });

      await expect(service.getBalance('prod_1', 'wh_1')).resolves.toMatchObject({ quantityOnHand: 30 });
      await expect(service.getBalance('prod_1', 'wh_2')).resolves.toMatchObject({ quantityOnHand: 5 });
      await expect(service.getBalancesForProduct('prod_1')).resolves.toHaveLength(2);
    });

    it('allows the on-hand quantity to go negative without throwing', async () => {
      const { service } = setup();
      await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 5 });
      const result = await service.applyDelta({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: -12 });
      expect(result.quantityOnHand).toBe(-7);
    });
  });

  describe('getAvailable', () => {
    it('is onHand - derived committed + onOrder (Phase 5A — the row committed field is ignored)', async () => {
      const repository = new MockStockBalanceRepository([
        // quantityCommitted on the row is 0 in real storage; even a stale
        // non-zero value here must be ignored in favour of the derived map.
        makeBalance({ productId: 'prod_1', warehouseId: 'wh_1', quantityOnHand: 100, quantityCommitted: 999, quantityOnOrder: 12 }),
      ]);
      const service = new StockBalanceService(repository, {
        getCommitmentMap: async () => new Map<string, number>([['prod_1__wh_1', 30]]),
      });
      await expect(service.getAvailable('prod_1', 'wh_1')).resolves.toBe(82); // 100 - 30 + 12
    });

    it('returns 0 when no balance row exists for the pair', async () => {
      const { service } = setup();
      await expect(service.getAvailable('prod_1', 'wh_1')).resolves.toBe(0);
    });
  });

  describe('rebuildFromMovements', () => {
    it('reproduces every balance by summing quantityDelta, with multi-warehouse isolation', async () => {
      const { service } = setup();
      const movements: StockMovement[] = [
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 50 }),
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_1', type: 'sale', quantityDelta: -15 }),
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_2', quantityDelta: 20 }),
        makeMovement({ productId: 'prod_2', warehouseId: 'wh_1', quantityDelta: 8 }),
      ];

      const rebuilt = service.rebuildFromMovements(movements);
      const byKey = new Map(rebuilt.map((b) => [`${b.productId}__${b.warehouseId}`, b.quantityOnHand]));

      expect(rebuilt).toHaveLength(3);
      expect(byKey.get('prod_1__wh_1')).toBe(35);
      expect(byKey.get('prod_1__wh_2')).toBe(20);
      expect(byKey.get('prod_2__wh_1')).toBe(8);
      expect(rebuilt.every((b) => b.quantityCommitted === 0 && b.quantityOnOrder === 0)).toBe(true);
    });

    it('matches the maintained cache built by applyDelta (reconciliation invariant)', async () => {
      const { service } = setup();
      const movements: StockMovement[] = [
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 40 }),
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_2', quantityDelta: 10 }),
        makeMovement({ productId: 'prod_1', warehouseId: 'wh_1', type: 'sale', quantityDelta: -25 }),
      ];
      for (const m of movements) {
        await service.applyDelta({ productId: m.productId, warehouseId: m.warehouseId, quantityDelta: m.quantityDelta });
      }

      const cached = await service.getBalances();
      const rebuilt = service.rebuildFromMovements(movements);

      const norm = (rows: { productId: string; warehouseId: string; quantityOnHand: number }[]) =>
        rows
          .map((r) => `${r.productId}__${r.warehouseId}=${r.quantityOnHand}`)
          .sort();

      expect(norm(cached)).toEqual(norm(rebuilt));
    });

    it('returns an empty list for no movements', () => {
      const { service } = setup();
      expect(service.rebuildFromMovements([])).toEqual([]);
    });
  });
});
