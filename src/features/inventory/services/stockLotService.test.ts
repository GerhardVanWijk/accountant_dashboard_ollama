import { describe, it, expect } from 'vitest';
import { StockLotService } from './stockLotService';
import { MockStockLotRepository } from '../repositories/MockStockLotRepository';

function setup() {
  const repository = new MockStockLotRepository();
  const service = new StockLotService(repository);
  return { service, repository };
}

describe('StockLotService', () => {
  describe('createLot', () => {
    it('creates a lot with quantityRemaining equal to the received quantity', async () => {
      const { service } = setup();
      const lot = await service.createLot({
        productId: 'prod_1',
        warehouseId: 'wh_1',
        unitCost: 40,
        quantity: 10,
        receivedAt: '2026-08-01T00:00:00.000Z',
        sourceMovementId: 'stkmv_1',
      });
      expect(lot.quantityReceived).toBe(10);
      expect(lot.quantityRemaining).toBe(10);
      expect(lot.unitCost).toBe(40);
    });

    it('rejects a zero or negative quantity', async () => {
      const { service } = setup();
      await expect(
        service.createLot({
          productId: 'prod_1',
          warehouseId: 'wh_1',
          unitCost: 40,
          quantity: 0,
          receivedAt: '2026-08-01T00:00:00.000Z',
          sourceMovementId: 'stkmv_1',
        }),
      ).rejects.toThrow(/greater than zero/i);
    });
  });

  describe('previewFifoCost / consumeFifoLots', () => {
    it('costs a sale entirely from a single lot when it covers the full quantity', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 20, receivedAt: '2026-08-01', sourceMovementId: 'm1' });

      const previewed = await service.previewFifoCost('prod_1', 'wh_1', 5);
      expect(previewed).toBe(200); // 5 * 40

      const consumed = await service.consumeFifoLots('prod_1', 'wh_1', 5);
      expect(consumed).toBe(200);

      const open = await service.getOpenLots('prod_1', 'wh_1');
      expect(open).toHaveLength(1);
      expect(open[0].quantityRemaining).toBe(15);
    });

    it('consumes the OLDEST lot first, spanning multiple lots at different costs', async () => {
      const { service } = setup();
      // Oldest lot: 5 units @ 40. Newer lot: 10 units @ 70.
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 5, receivedAt: '2026-08-01T00:00:00.000Z', sourceMovementId: 'm1' });
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 70, quantity: 10, receivedAt: '2026-08-05T00:00:00.000Z', sourceMovementId: 'm2' });

      // Selling 8: all 5 from the oldest lot (@40) + 3 from the newer lot (@70).
      const cost = await service.consumeFifoLots('prod_1', 'wh_1', 8);
      expect(cost).toBe(5 * 40 + 3 * 70); // 200 + 210 = 410

      const open = await service.getOpenLots('prod_1', 'wh_1');
      expect(open).toHaveLength(1); // the oldest lot is now fully consumed and excluded
      expect(open[0].unitCost).toBe(70);
      expect(open[0].quantityRemaining).toBe(7); // 10 - 3
    });

    it('never selects a lot from a different warehouse or a different product', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 10, receivedAt: '2026-08-01', sourceMovementId: 'm1' });
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_2', unitCost: 999, quantity: 10, receivedAt: '2026-08-01', sourceMovementId: 'm2' });
      await service.createLot({ productId: 'prod_2', warehouseId: 'wh_1', unitCost: 999, quantity: 10, receivedAt: '2026-08-01', sourceMovementId: 'm3' });

      const cost = await service.previewFifoCost('prod_1', 'wh_1', 10);
      expect(cost).toBe(400); // only the wh_1/prod_1 lot at 40/unit, never the 999-cost lots
    });

    it('throws, and consumes nothing, when open lots cannot cover the requested quantity', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 5, receivedAt: '2026-08-01', sourceMovementId: 'm1' });

      await expect(service.previewFifoCost('prod_1', 'wh_1', 10)).rejects.toThrow(/insufficient/i);
      await expect(service.consumeFifoLots('prod_1', 'wh_1', 10)).rejects.toThrow(/insufficient/i);

      // Nothing was consumed by the failed attempt — the lot is untouched.
      const open = await service.getOpenLots('prod_1', 'wh_1');
      expect(open[0].quantityRemaining).toBe(5);
    });

    it('throws for a product with no lots at all rather than silently returning 0', async () => {
      const { service } = setup();
      await expect(service.previewFifoCost('prod_missing', 'wh_1', 1)).rejects.toThrow(/insufficient/i);
    });

    it('excludes a fully-consumed lot from later FIFO consumption', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 5, receivedAt: '2026-08-01T00:00:00.000Z', sourceMovementId: 'm1' });
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 70, quantity: 5, receivedAt: '2026-08-05T00:00:00.000Z', sourceMovementId: 'm2' });

      await service.consumeFifoLots('prod_1', 'wh_1', 5); // fully drains the oldest lot
      const cost = await service.consumeFifoLots('prod_1', 'wh_1', 5); // must now come from the second lot
      expect(cost).toBe(5 * 70);
    });

    it('previewing does not mutate lot state — two consecutive previews return the same cost', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 10, receivedAt: '2026-08-01', sourceMovementId: 'm1' });

      const first = await service.previewFifoCost('prod_1', 'wh_1', 5);
      const second = await service.previewFifoCost('prod_1', 'wh_1', 5);
      expect(first).toBe(second);

      const open = await service.getOpenLots('prod_1', 'wh_1');
      expect(open[0].quantityRemaining).toBe(10); // still untouched
    });
  });

  describe('getOpenLots', () => {
    it('returns lots oldest-received first', async () => {
      const { service } = setup();
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 70, quantity: 5, receivedAt: '2026-08-10T00:00:00.000Z', sourceMovementId: 'm2' });
      await service.createLot({ productId: 'prod_1', warehouseId: 'wh_1', unitCost: 40, quantity: 5, receivedAt: '2026-08-01T00:00:00.000Z', sourceMovementId: 'm1' });

      const open = await service.getOpenLots('prod_1', 'wh_1');
      expect(open.map((l) => l.unitCost)).toEqual([40, 70]);
    });
  });
});
