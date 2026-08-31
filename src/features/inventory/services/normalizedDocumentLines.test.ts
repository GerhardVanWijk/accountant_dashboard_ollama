import { describe, expect, it } from 'vitest';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { MockStockAdjustmentRepository } from '../repositories/MockStockAdjustmentRepository';
import { StockAdjustmentService } from './stockAdjustmentService';

describe('normalized inventory document lines', () => {
  it('creates a draft header independently and gives each line a stable identity', async () => {
    const repository = new MockStockAdjustmentRepository([]);
    const service = new StockAdjustmentService(repository, new AuditLogService(new MockAuditLogRepository()));
    const adjustment = await service.createAdjustment({
      warehouseId: 'wh-1', adjustmentDate: '2026-08-30', reason: 'correction', lineItems: [],
    });
    expect(adjustment.lineItems).toEqual([]);

    const withLine = await service.addLine(adjustment.id, {
      productId: 'prod-1', warehouseId: 'wh-1', quantityDelta: 2, unitCost: 10, costEffect: 20,
    });
    const lineId = withLine.lineItems[0].id;
    expect(lineId).toBeTruthy();
    expect(withLine.lineItems[0].adjustmentId).toBe(adjustment.id);

    const updated = await service.updateLine(adjustment.id, lineId, { notes: 'count recounted' });
    expect(updated.lineItems[0].id).toBe(lineId);
    expect(updated.totalCostEffect).toBe(20);
  });

  it('blocks normalized line mutations after the document is posted', async () => {
    const repository = new MockStockAdjustmentRepository([]);
    const service = new StockAdjustmentService(repository, new AuditLogService(new MockAuditLogRepository()));
    const adjustment = await service.createAdjustment({
      warehouseId: 'wh-1', adjustmentDate: '2026-08-30', reason: 'stock_gain',
      lineItems: [{ id: 'source-line-1', adjustmentId: '', productId: 'prod-1', warehouseId: 'wh-1', quantityDelta: 1, unitCost: 5, costEffect: 5 }],
    });
    await service.postAdjustment(adjustment.id);
    await expect(service.deleteLine(adjustment.id, 'source-line-1')).rejects.toThrow(/only a draft/i);
    expect((await repository.getLines(adjustment.id))[0].id).toBe('source-line-1');
  });
});
