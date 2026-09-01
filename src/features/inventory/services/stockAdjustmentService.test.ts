import { describe, it, expect, beforeEach } from 'vitest';
import { StockAdjustmentService, type CreateStockAdjustmentDTO } from './stockAdjustmentService';
import { MockStockAdjustmentRepository } from '../repositories/MockStockAdjustmentRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { StockAdjustmentLine } from '@/types';
import { makePostingTestKit, makeProduct } from './inventoryPostingEngine.testkit';

function line(overrides: Partial<StockAdjustmentLine> = {}): StockAdjustmentLine {
  const quantityDelta = overrides.quantityDelta ?? -5;
  const unitCost = overrides.unitCost ?? 100;
  return {
    id: overrides.id ?? 'sal_1',
    adjustmentId: overrides.adjustmentId ?? 'adj_1',
    productId: overrides.productId ?? 'prod_1',
    warehouseId: overrides.warehouseId ?? 'wh_00000001',
    quantityDelta,
    unitCost,
    costEffect: overrides.costEffect ?? quantityDelta * unitCost,
    notes: overrides.notes,
  };
}

function makeAdjustment(overrides: Partial<CreateStockAdjustmentDTO> = {}): CreateStockAdjustmentDTO {
  return {
    warehouseId: 'wh_00000001',
    adjustmentDate: '2026-06-01',
    reason: 'write_off',
    notes: 'Damaged in the aisle',
    lineItems: [line({ id: 'sal_1' }), line({ id: 'sal_2', quantityDelta: -3, unitCost: 100 })],
    ...overrides,
  };
}

describe('StockAdjustmentService', () => {
  let service: StockAdjustmentService;
  let repository: MockStockAdjustmentRepository;
  let auditLog: AuditLogService;

  beforeEach(() => {
    repository = new MockStockAdjustmentRepository([]);
    auditLog = new AuditLogService(new MockAuditLogRepository());
    service = new StockAdjustmentService(repository, auditLog);
  });

  describe('createAdjustment', () => {
    it('creates a draft with a generated number, recomputed totalCostEffect and zero GL history', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      expect(adj.status).toBe('draft');
      expect(adj.adjustmentNumber).toBe('ADJ-0001');
      expect(adj.totalCostEffect).toBe(-800);
      expect(adj.journalEntryId).toBeUndefined();
      expect(adj.postedAt).toBeUndefined();
      expect(adj.postedBy).toBeUndefined();
    });

    it('ignores a caller-supplied totalCostEffect and always sums the lines', async () => {
      const adj = await service.createAdjustment(
        makeAdjustment({ lineItems: [line({ id: 'x', quantityDelta: 2, unitCost: 12.5, costEffect: 25 })] }),
      );
      expect(adj.totalCostEffect).toBe(25);
    });

    it('assigns sequential adjustment numbers', async () => {
      const first = await service.createAdjustment(makeAdjustment());
      const second = await service.createAdjustment(makeAdjustment());
      expect(first.adjustmentNumber).toBe('ADJ-0001');
      expect(second.adjustmentNumber).toBe('ADJ-0002');
    });
  });

  describe('updateAdjustment', () => {
    it('edits a draft and recomputes totalCostEffect from the new lines', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      const updated = await service.updateAdjustment(adj.id, {
        lineItems: [line({ id: 'sal_1', quantityDelta: -1, unitCost: 50, costEffect: -50 })],
      });
      expect(updated.totalCostEffect).toBe(-50);
    });

    it('rejects an edit once past draft', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.submitForApproval(adj.id);
      await expect(service.updateAdjustment(adj.id, { notes: 'nope' })).rejects.toThrow(/only a draft/i);
    });

    it('throws for an unknown id', async () => {
      await expect(service.updateAdjustment('missing', { notes: 'x' })).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteAdjustment', () => {
    it('deletes a draft', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.deleteAdjustment(adj.id);
      expect(await service.getAdjustment(adj.id)).toBeUndefined();
    });

    it('rejects deleting a posted adjustment', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.postAdjustment(adj.id);
      await expect(service.deleteAdjustment(adj.id)).rejects.toThrow(/only a draft/i);
    });
  });

  describe('lifecycle transitions', () => {
    it('submitForApproval moves draft → pending_approval', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      const submitted = await service.submitForApproval(adj.id);
      expect(submitted.status).toBe('pending_approval');
    });

    it('approve records an approval marker without changing status', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.submitForApproval(adj.id);
      const approved = await service.approve(adj.id, 'user_manager');
      expect(approved.status).toBe('pending_approval');
      expect(approved.approvedBy).toBe('user_manager');
      expect(approved.approvedAt).toBeDefined();
    });

    it('postAdjustment transitions draft → posted, stamps postedBy/postedAt, and does not throw', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      const posted = await service.postAdjustment(adj.id, 'user_1');
      expect(posted.status).toBe('posted');
      expect(posted.postedBy).toBe('user_1');
      expect(posted.postedAt).toBeDefined();
    });

    it('postAdjustment also accepts a pending_approval adjustment', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.submitForApproval(adj.id);
      const posted = await service.postAdjustment(adj.id);
      expect(posted.status).toBe('posted');
    });

    it('rejects posting an already-posted adjustment', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.postAdjustment(adj.id);
      await expect(service.postAdjustment(adj.id)).rejects.toThrow(/Cannot post/i);
    });

    it('cancels from draft and from pending_approval, but not from posted', async () => {
      const draftAdj = await service.createAdjustment(makeAdjustment());
      expect((await service.cancelAdjustment(draftAdj.id)).status).toBe('cancelled');

      const pendingAdj = await service.createAdjustment(makeAdjustment());
      await service.submitForApproval(pendingAdj.id);
      expect((await service.cancelAdjustment(pendingAdj.id)).status).toBe('cancelled');

      const postedAdj = await service.createAdjustment(makeAdjustment());
      await service.postAdjustment(postedAdj.id);
      await expect(service.cancelAdjustment(postedAdj.id)).rejects.toThrow(/only a draft or pending-approval/i);
    });
  });

  describe('audit trail on post', () => {
    it('writes a stock_written_off entry for a write-off reason', async () => {
      const adj = await service.createAdjustment(makeAdjustment({ reason: 'shrinkage' }));
      await service.postAdjustment(adj.id, 'user_7');
      const entries = await auditLog.getForRecord('StockAdjustment', adj.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('stock_written_off');
      expect(entries[0].userId).toBe('user_7');
      expect(entries[0].module).toBe('inventory');
    });

    it('writes a stock_adjusted entry for a gain/correction reason', async () => {
      const adj = await service.createAdjustment(makeAdjustment({ reason: 'correction' }));
      await service.postAdjustment(adj.id);
      const entries = await auditLog.getForRecord('StockAdjustment', adj.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('stock_adjusted');
    });

    it('does not write an audit entry before post', async () => {
      const adj = await service.createAdjustment(makeAdjustment());
      await service.submitForApproval(adj.id);
      expect(await auditLog.getForRecord('StockAdjustment', adj.id)).toHaveLength(0);
    });
  });

  describe('Phase 3 — GL posting via the inventory posting engine', () => {
    const WH = 'wh_00000001';
    let kit: ReturnType<typeof makePostingTestKit>;
    let posting: StockAdjustmentService;

    beforeEach(() => {
      kit = makePostingTestKit();
      posting = new StockAdjustmentService(repository, auditLog, kit.engine, kit.resolver, kit.products);
    });

    it('write-off: DR INVENTORY_ADJUSTMENT / CR inventory at WAC, records write_off movements, sets journalEntryId', async () => {
      kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 100, warehouseId: WH });
      const adj = await posting.createAdjustment(makeAdjustment()); // lines -5, -3 @ WH
      const posted = await posting.postAdjustment(adj.id, 'user_1');

      expect(posted.status).toBe('posted');
      expect(posted.journalEntryId).toBeDefined();
      expect(kit.store.products.get('prod_1')!.quantityOnHand).toBe(12);
      expect(kit.store.movements.map((m) => m.type)).toEqual(['write_off', 'write_off']);

      const je = kit.store.journalEntries[0];
      expect(je.id).toBe(posted.journalEntryId);
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')).toEqual({
        accountId: 'acc-INVENTORY_ADJUSTMENT',
        debit: 800,
        credit: 0,
      });
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({
        accountId: 'acc-INVENTORY',
        debit: 0,
        credit: 800,
      });
      expect(kit.store.auditLog[0].action).toBe('stock_written_off');
    });

    it('stock gain: DR inventory / CR INVENTORY_ADJUSTMENT, WAC unchanged', async () => {
      kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 10, costPrice: 6, warehouseId: WH });
      const adj = await posting.createAdjustment(
        makeAdjustment({ reason: 'stock_gain', lineItems: [line({ id: 'g1', quantityDelta: 2, unitCost: 6 })] }),
      );
      await posting.postAdjustment(adj.id);

      expect(kit.store.products.get('prod_1')!.quantityOnHand).toBe(12);
      expect(kit.store.products.get('prod_1')!.costPrice).toBe(6);
      expect(kit.store.movements[0].type).toBe('stock_gain');
      const je = kit.store.journalEntries[0];
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 12, credit: 0 });
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')).toEqual({ accountId: 'acc-INVENTORY_ADJUSTMENT', debit: 0, credit: 12 });
      expect(kit.store.auditLog[0].action).toBe('stock_adjusted');
    });

    it('a second post is idempotent — no duplicate movement or journal', async () => {
      kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 100, warehouseId: WH });
      const adj = await posting.createAdjustment(makeAdjustment());
      await posting.postAdjustment(adj.id);
      await expect(posting.postAdjustment(adj.id)).rejects.toThrow(/Cannot post/i);
      // re-run the engine call directly on the same key: still one result
      await kit.engine.applyInventoryTransaction({
        postingKey: `stock_adjustment:${adj.id}:post`,
        sourceType: 'stock_adjustment',
        sourceId: adj.id,
        movementDate: '2026-06-01',
        createdBy: 'user_1',
        lines: [{ productId: 'prod_1', warehouseId: WH, quantityDelta: -1, costingMode: 'issue', movementType: 'write_off', inventoryAccountId: 'acc-INVENTORY', contraAccountId: 'acc-INVENTORY_ADJUSTMENT' }],
      });
      expect(kit.store.movements).toHaveLength(2);
      expect(kit.store.journalEntries).toHaveLength(1);
    });

    it('a non-stock product line posts no movement and no inventory journal leg', async () => {
      kit.seed(makeProduct({ id: 'svc', trackInventory: false }), { quantityOnHand: 0, costPrice: 0, warehouseId: WH });
      const adj = await posting.createAdjustment(
        makeAdjustment({ reason: 'correction', lineItems: [line({ id: 'n1', productId: 'svc', quantityDelta: -1, unitCost: 5 })] }),
      );
      const posted = await posting.postAdjustment(adj.id);
      expect(kit.store.movements).toHaveLength(0);
      expect(kit.store.journalEntries).toHaveLength(0);
      expect(posted.status).toBe('posted');
    });

    it('reverseAdjustment restores quantity and moves the header to cancelled; posted stays otherwise immutable', async () => {
      kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 100, warehouseId: WH });
      const adj = await posting.createAdjustment(makeAdjustment());
      await posting.postAdjustment(adj.id);
      await expect(posting.updateAdjustment(adj.id, { notes: 'nope' })).rejects.toThrow(/only a draft/i);

      const reversed = await posting.reverseAdjustment(adj.id, 'wrong product', 'user_2');
      expect(reversed.status).toBe('cancelled');
      expect(kit.store.products.get('prod_1')!.quantityOnHand).toBe(20);
      expect(kit.store.journalEntries[0].status).toBe('reversed');
    });

    describe('previewAccountingEffect — built from the same line-builder as postAdjustment', () => {
      it('loss preview: Dr Inventory Adjustments / Cr Inventory, balanced, matches the posted entry exactly', async () => {
        kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 100, warehouseId: WH });
        const adj = await posting.createAdjustment(makeAdjustment()); // -5, -3 @ 100 = -800
        const preview = await posting.previewAccountingEffect(adj.id);

        expect(preview.balanced).toBe(true);
        const debit = preview.lines.filter((l) => l.debit > 0);
        const credit = preview.lines.filter((l) => l.credit > 0);
        expect(debit.every((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')).toBe(true);
        expect(credit.every((l) => l.accountId === 'acc-INVENTORY')).toBe(true);
        expect(debit.reduce((s, l) => s + l.debit, 0)).toBe(800);
        expect(credit.reduce((s, l) => s + l.credit, 0)).toBe(800);
        expect(preview.lines.every((l) => l.source.includes('Write-off'))).toBe(true);

        const posted = await posting.postAdjustment(adj.id);
        const je = kit.store.journalEntries.find((j) => j.id === posted.journalEntryId)!;
        expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY_ADJUSTMENT')!.debit).toBe(
          debit.reduce((s, l) => s + l.debit, 0),
        );
      });

      it('gain preview: Dr Inventory / Cr Inventory Adjustments, balanced', async () => {
        kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 10, costPrice: 6, warehouseId: WH });
        const adj = await posting.createAdjustment(
          makeAdjustment({ reason: 'stock_gain', lineItems: [line({ id: 'g1', quantityDelta: 2, unitCost: 6 })] }),
        );
        const preview = await posting.previewAccountingEffect(adj.id);

        expect(preview.balanced).toBe(true);
        expect(preview.lines.find((l) => l.debit > 0)!.accountId).toBe('acc-INVENTORY');
        expect(preview.lines.find((l) => l.credit > 0)!.accountId).toBe('acc-INVENTORY_ADJUSTMENT');
        expect(preview.lines.every((l) => l.source.includes('Stock gain'))).toBe(true);
      });

      it('posts nothing — no movement or journal entry is created by preview alone', async () => {
        kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 100, warehouseId: WH });
        const adj = await posting.createAdjustment(makeAdjustment());
        await posting.previewAccountingEffect(adj.id);
        expect(kit.store.movements).toHaveLength(0);
        expect(kit.store.journalEntries).toHaveLength(0);
      });

      it('throws when the posting engine is not wired (no account resolver/product lookup)', async () => {
        const adj = await service.createAdjustment(makeAdjustment());
        await expect(service.previewAccountingEffect(adj.id)).rejects.toThrow(/not available/i);
      });
    });
  });
});
