import { describe, it, expect, beforeEach } from 'vitest';
import { StockTakeService, type CreateStockTakeDTO, type StockTakeFreezeExecutor } from './stockTakeService';
import { MockStockTakeRepository } from '../repositories/MockStockTakeRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { makePostingTestKit, makeProduct } from './inventoryPostingEngine.testkit';

/**
 * Phase 3C: `freeze()` is no longer a status flip that trusts caller-supplied
 * line values — it calls an atomic `StockTakeFreezeExecutor` (production:
 * `public.freeze_stock_take`, migration 0036) that OWNS the line set, deriving
 * `expectedQty` from the per-warehouse balance and `unitCost` from the product
 * WAC for the whole SCOPE in one coherent snapshot. Every test wires the fake
 * executor from the shared posting kit and seeds the products it counts.
 */

function makeStockTake(overrides: Partial<CreateStockTakeDTO> = {}): CreateStockTakeDTO {
  return {
    warehouseId: 'wh-1',
    scope: 'all',
    scopeRef: {},
    countDate: '2026-08-30',
    lineItems: [],
    ...overrides,
  };
}

describe('StockTakeService', () => {
  let service: StockTakeService;
  let repository: MockStockTakeRepository;
  let auditRepo: MockAuditLogRepository;
  let kit: ReturnType<typeof makePostingTestKit>;
  let freezeExecutor: StockTakeFreezeExecutor;

  beforeEach(() => {
    repository = new MockStockTakeRepository([]);
    auditRepo = new MockAuditLogRepository();
    kit = makePostingTestKit();
    freezeExecutor = kit.freezeExecutor(repository);
    service = new StockTakeService(
      repository,
      new AuditLogService(auditRepo),
      kit.engine,
      kit.resolver,
      kit.products,
      freezeExecutor,
    );
  });

  /** Freeze, count the (single, first) line to `countedQty`, mark ready. */
  async function drive(id: string, countedQty = 7): Promise<void> {
    await service.freeze(id);
    const frozen = await service.getStockTake(id);
    await service.enterCounts(id, [{ lineId: frozen!.lineItems[0].id, countedQty }]);
    await service.markReadyForReview(id);
  }

  describe('createStockTake', () => {
    it('creates a draft with a generated STK-0001 number and no journal entry', async () => {
      const st = await service.createStockTake(makeStockTake());
      expect(st.status).toBe('draft');
      expect(st.stockTakeNumber).toBe('STK-0001');
      expect(st.journalEntryId).toBeUndefined();
      expect(st.totalVarianceValue).toBe(0);
    });

    it('increments the number for each stock take', async () => {
      await service.createStockTake(makeStockTake());
      const second = await service.createStockTake(makeStockTake());
      expect(second.stockTakeNumber).toBe('STK-0002');
    });
  });

  describe('edit / delete guards', () => {
    it('allows editing a draft', async () => {
      const st = await service.createStockTake(makeStockTake());
      const updated = await service.updateStockTake(st.id, { notes: 'Q3 count' });
      expect(updated.notes).toBe('Q3 count');
    });

    it('rejects editing once counting', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      await expect(service.updateStockTake(st.id, { notes: 'nope' })).rejects.toThrow(/only a draft/i);
    });

    it('rejects deleting once counting', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      await expect(service.deleteStockTake(st.id)).rejects.toThrow(/only a draft/i);
    });

    it('deletes a draft', async () => {
      const st = await service.createStockTake(makeStockTake());
      await service.deleteStockTake(st.id);
      expect(await service.getStockTake(st.id)).toBeUndefined();
    });
  });

  describe('freeze — atomic snapshot (item 6)', () => {
    it('derives expectedQty from the per-warehouse balance and unitCost from the product WAC', async () => {
      kit.seed(makeProduct({ id: 'prod-1', sku: 'A' }), { quantityOnHand: 12, costPrice: 25, warehouseId: 'wh-1' });
      kit.seed(makeProduct({ id: 'prod-2', sku: 'B' }), { quantityOnHand: 4, costPrice: 9.5, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());

      const frozen = await service.freeze(st.id);
      expect(frozen.status).toBe('counting');
      expect(frozen.frozenAt).toBeTruthy();
      expect(frozen.lineItems).toHaveLength(2);
      const a = frozen.lineItems.find((l) => l.productId === 'prod-1')!;
      expect(a.expectedQty).toBe(12);
      expect(a.unitCost).toBe(25);
      const b = frozen.lineItems.find((l) => l.productId === 'prod-2')!;
      expect(b.expectedQty).toBe(4);
      expect(b.unitCost).toBe(9.5);
    });

    it('IGNORES caller-supplied draft line values — the snapshot is authoritative', async () => {
      kit.seed(makeProduct({ id: 'prod-1', sku: 'A' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      // Caller tries to spoof expectedQty 999 / unitCost 0.01 on a draft line.
      const st = await service.createStockTake(
        makeStockTake({
          lineItems: [
            {
              id: 'spoof',
              stockTakeId: 'x',
              productId: 'prod-1',
              warehouseId: 'wh-1',
              expectedQty: 999,
              unitCost: 0.01,
              varianceQty: 0,
              varianceValue: 0,
            },
          ],
        }),
      );
      const frozen = await service.freeze(st.id);
      expect(frozen.lineItems).toHaveLength(1);
      expect(frozen.lineItems[0].expectedQty).toBe(10); // not 999
      expect(frozen.lineItems[0].unitCost).toBe(25); // not 0.01
      expect(frozen.lineItems.some((l) => l.id === 'spoof')).toBe(false);
    });

    it('honours scope "items"', async () => {
      kit.seed(makeProduct({ id: 'p1', sku: 'A' }), { quantityOnHand: 5, costPrice: 1, warehouseId: 'wh-1' });
      kit.seed(makeProduct({ id: 'p2', sku: 'B' }), { quantityOnHand: 6, costPrice: 2, warehouseId: 'wh-1' });
      kit.seed(makeProduct({ id: 'p3', sku: 'C' }), { quantityOnHand: 7, costPrice: 3, warehouseId: 'wh-1' });
      const st = await service.createStockTake(
        makeStockTake({ scope: 'items', scopeRef: { productIds: ['p1', 'p3'] } }),
      );
      const frozen = await service.freeze(st.id);
      expect(frozen.lineItems.map((l) => l.productId).sort()).toEqual(['p1', 'p3']);
    });

    it('a frozen quantity is immutable — a later movement does not rewrite the snapshot', async () => {
      kit.seed(makeProduct({ id: 'prod-1', sku: 'A' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);

      // A receipt lands after the freeze: balance + WAC move.
      kit.store.setBalance('prod-1', 'wh-1', 18);
      kit.store.products.get('prod-1')!.costPrice = 30;

      const frozen = await service.getStockTake(st.id);
      expect(frozen!.lineItems[0].expectedQty).toBe(10); // still the frozen value
      expect(frozen!.lineItems[0].unitCost).toBe(25);
    });

    it('rejects freezing anything past draft, and rejects a double freeze', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      await expect(service.freeze(st.id)).rejects.toThrow(/must be draft|already frozen/i);
    });
  });

  describe('enterCounts', () => {
    it('recomputes varianceQty, varianceValue and totalVarianceValue against the frozen data', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      const frozen = await service.getStockTake(st.id);
      const counted = await service.enterCounts(st.id, [{ lineId: frozen!.lineItems[0].id, countedQty: 7 }]);
      expect(counted.lineItems[0].varianceQty).toBe(-3);
      expect(counted.lineItems[0].varianceValue).toBe(-75);
      expect(counted.totalVarianceValue).toBe(-75);
    });

    it('rejects entering counts before the sheet is frozen', async () => {
      const st = await service.createStockTake(makeStockTake());
      await expect(service.enterCounts(st.id, [{ lineId: 'x', countedQty: 7 }])).rejects.toThrow(/frozen for counting/i);
    });
  });

  describe('lifecycle transitions', () => {
    it('rejects markReadyForReview from draft', async () => {
      const st = await service.createStockTake(makeStockTake());
      await expect(service.markReadyForReview(st.id)).rejects.toThrow(/must be counting/i);
    });

    it('rejects posting before ready_for_review', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      await expect(service.postStockTake(st.id)).rejects.toThrow(/ready_for_review/i);
    });
  });

  describe('postStockTake', () => {
    it('moves ready_for_review -> posted, stamps postedBy/postedAt and writes an audit row', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await drive(st.id);
      const posted = await service.postStockTake(st.id, 'user-9');

      expect(posted.status).toBe('posted');
      expect(posted.postedBy).toBe('user-9');
      expect(posted.postedAt).toBeTruthy();

      expect(kit.store.auditLog[0].action).toBe('stock_take_posted');
    });

    it('rejects posting a second time', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await drive(st.id);
      await service.postStockTake(st.id);
      await expect(service.postStockTake(st.id)).rejects.toThrow(/ready_for_review/i);
    });
  });

  describe('cancelStockTake', () => {
    it('cancels a draft', async () => {
      const st = await service.createStockTake(makeStockTake());
      const cancelled = await service.cancelStockTake(st.id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('refuses to cancel a posted stock take', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await drive(st.id);
      await service.postStockTake(st.id);
      await expect(service.cancelStockTake(st.id)).rejects.toThrow(/immutable/i);
    });
  });

  describe('GL posting via the inventory posting engine', () => {
    it('single negative variance: DR INVENTORY_ADJUSTMENT / CR inventory, one stock_take movement, journalEntryId set', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await drive(st.id); // counted 7 → -3
      const posted = await service.postStockTake(st.id, 'user-9');

      expect(posted.journalEntryId).toBeDefined();
      expect(kit.store.products.get('prod-1')!.quantityOnHand).toBe(7);
      expect(kit.store.movements).toHaveLength(1);
      expect(kit.store.movements[0].type).toBe('stock_take');
      const je = kit.store.journalEntries[0];
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')).toEqual({ accountId: 'acc-INVENTORY_ADJUSTMENT', debit: 75, credit: 0 });
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 75 });
    });

    it('nets positive + negative variances into ONE entry and omits zero-variance lines', async () => {
      kit.seed(makeProduct({ id: 'p1', sku: 'A' }), { quantityOnHand: 10, costPrice: 4, warehouseId: 'wh-1' });
      kit.seed(makeProduct({ id: 'p2', sku: 'B' }), { quantityOnHand: 50, costPrice: 9, warehouseId: 'wh-1' });
      kit.seed(makeProduct({ id: 'p3', sku: 'C' }), { quantityOnHand: 10, costPrice: 2, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id);
      const frozen = await service.getStockTake(st.id);
      const byProduct = new Map(frozen!.lineItems.map((l) => [l.productId, l.id]));
      await service.enterCounts(st.id, [
        { lineId: byProduct.get('p1')!, countedQty: 13 }, // +3 → +12
        { lineId: byProduct.get('p2')!, countedQty: 48 }, // -2 → -18
        { lineId: byProduct.get('p3')!, countedQty: 10 }, // 0
      ]);
      await service.markReadyForReview(st.id);
      await service.postStockTake(st.id);

      expect(kit.store.journalEntries).toHaveLength(1);
      expect(kit.store.movements).toHaveLength(2); // zero-variance p3 omitted
      const je = kit.store.journalEntries[0];
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')).toEqual({ accountId: 'acc-INVENTORY_ADJUSTMENT', debit: 6, credit: 0 });
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 6 });
    });

    it('posts the variance at the count sheet FROZEN unit cost, not the product live WAC', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await service.freeze(st.id); // frozen unitCost 25

      // WAC moves after the freeze.
      kit.store.products.get('prod-1')!.costPrice = 40;

      const frozen = await service.getStockTake(st.id);
      await service.enterCounts(st.id, [{ lineId: frozen!.lineItems[0].id, countedQty: 7 }]); // -3
      await service.markReadyForReview(st.id);
      await service.postStockTake(st.id, 'user-9');

      // 3 × frozen 25 = 75  (NOT 3 × 40 = 120)
      const je = kit.store.journalEntries[0];
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 75 });
      expect(kit.store.movements[0].unitCost).toBe(25);
      expect(kit.store.products.get('prod-1')!.costPrice).toBe(40); // WAC never moved by a stock take
    });

    it('a second post is rejected by the status guard and never double-posts', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 10, costPrice: 25, warehouseId: 'wh-1' });
      const st = await service.createStockTake(makeStockTake());
      await drive(st.id);
      await service.postStockTake(st.id);
      await expect(service.postStockTake(st.id)).rejects.toThrow(/ready_for_review/i);
      expect(kit.store.movements).toHaveLength(1);
      expect(kit.store.journalEntries).toHaveLength(1);
    });
  });
});
