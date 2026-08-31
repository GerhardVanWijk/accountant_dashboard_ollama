import { describe, it, expect, beforeEach } from 'vitest';
import { OpeningStockBatchService, type CreateOpeningStockBatchDTO } from './openingStockBatchService';
import { MockOpeningStockBatchRepository } from '../repositories/MockOpeningStockBatchRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { OpeningStockLine } from '@/types';
import { makePostingTestKit, makeProduct } from './inventoryPostingEngine.testkit';

function makeLine(overrides: Partial<OpeningStockLine> = {}): OpeningStockLine {
  return { id: 'line-1', openingStockBatchId: 'osb_1', productId: 'prod-1', warehouseId: 'wh-1', quantity: 10, unitCost: 5, totalCost: 50, ...overrides };
}

function makeBatch(overrides: Partial<CreateOpeningStockBatchDTO> = {}): CreateOpeningStockBatchDTO {
  return {
    effectiveDate: '2026-08-30',
    warehouseId: 'wh-1',
    lineItems: [makeLine()],
    offsetAccountId: 'acc-3950',
    ...overrides,
  };
}

describe('OpeningStockBatchService', () => {
  let service: OpeningStockBatchService;
  let repository: MockOpeningStockBatchRepository;
  let auditRepo: MockAuditLogRepository;

  beforeEach(() => {
    repository = new MockOpeningStockBatchRepository([]);
    auditRepo = new MockAuditLogRepository();
    service = new OpeningStockBatchService(repository, new AuditLogService(auditRepo));
  });

  describe('createOpeningStockBatch', () => {
    it('creates a draft with an OSB-0001 number and Σ totalCost', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch({ lineItems: [makeLine(), makeLine({ id: 'line-2', totalCost: 30 })] }));
      expect(batch.status).toBe('draft');
      expect(batch.batchNumber).toBe('OSB-0001');
      expect(batch.totalCost).toBe(80);
    });

    it('increments the batch number', async () => {
      await service.createOpeningStockBatch(makeBatch());
      const second = await service.createOpeningStockBatch(makeBatch());
      expect(second.batchNumber).toBe('OSB-0002');
    });
  });

  describe('edit / delete guards', () => {
    it('recomputes totalCost on a draft edit', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      const updated = await service.updateOpeningStockBatch(batch.id, { lineItems: [makeLine({ totalCost: 120 })] });
      expect(updated.totalCost).toBe(120);
    });

    it('rejects editing / deleting once confirmed', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      await service.confirmBatch(batch.id, { confirmed: true });
      await expect(service.updateOpeningStockBatch(batch.id, { notes: 'x' })).rejects.toThrow(/only a draft/i);
      await expect(service.deleteOpeningStockBatch(batch.id)).rejects.toThrow(/only a draft/i);
    });
  });

  describe('previewAccountingEffect', () => {
    it('returns a balanced DR INVENTORY / CR offset pair from hydrated persistent lines', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch({ lineItems: [makeLine({ totalCost: 50 }), makeLine({ id: 'line-2', totalCost: 25 })] }));
      const preview = await service.previewAccountingEffect(batch.id);

      expect(preview.balanced).toBe(true);
      expect(preview.lines).toHaveLength(2);
      const debit = preview.lines.find((l) => l.debit > 0)!;
      const credit = preview.lines.find((l) => l.credit > 0)!;
      expect(debit.accountId).toBe('INVENTORY');
      expect(debit.debit).toBe(75);
      expect(credit.accountId).toBe('acc-3950');
      expect(credit.credit).toBe(75);
    });
  });

  describe('confirmBatch', () => {
    it('throws without explicit { confirmed: true }', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      await expect(service.confirmBatch(batch.id, { confirmed: false })).rejects.toThrow(/explicit confirmation/i);
      expect((await service.getOpeningStockBatch(batch.id))!.status).toBe('draft');
    });

    it('confirms with explicit consent, stamps confirmedBy/confirmedAt and writes an audit row', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      const confirmed = await service.confirmBatch(batch.id, { confirmed: true }, 'user-3');

      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedBy).toBe('user-3');
      expect(confirmed.confirmedAt).toBeTruthy();

      const audit = await auditRepo.getByRecord('OpeningStockBatch', batch.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('opening_stock_set');
    });

    it('rejects confirming a second time', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      await service.confirmBatch(batch.id, { confirmed: true });
      await expect(service.confirmBatch(batch.id, { confirmed: true })).rejects.toThrow(/only a draft/i);
    });
  });

  describe('cancelBatch', () => {
    it('cancels a draft', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      expect((await service.cancelBatch(batch.id)).status).toBe('cancelled');
    });

    it('refuses to cancel a confirmed batch', async () => {
      const batch = await service.createOpeningStockBatch(makeBatch());
      await service.confirmBatch(batch.id, { confirmed: true });
      await expect(service.cancelBatch(batch.id)).rejects.toThrow(/immutable/i);
    });
  });

  describe('Phase 3 — GL posting via the inventory posting engine', () => {
    let kit: ReturnType<typeof makePostingTestKit>;
    let posting: OpeningStockBatchService;

    beforeEach(() => {
      kit = makePostingTestKit();
      posting = new OpeningStockBatchService(repository, new AuditLogService(auditRepo), kit.engine, kit.resolver, kit.products);
    });

    it('confirmBatch posts DR inventory / CR offset, WAC = entered cost, no VAT, one opening movement', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 0, costPrice: 0 });
      const batch = await posting.createOpeningStockBatch(makeBatch()); // qty 10 @ 5, offset acc-3950
      const confirmed = await posting.confirmBatch(batch.id, { confirmed: true }, 'user-3');

      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.journalEntryId).toBeDefined();
      expect(kit.store.products.get('prod-1')!.costPrice).toBe(5);
      expect(kit.store.products.get('prod-1')!.quantityOnHand).toBe(10);
      expect(kit.store.movements).toHaveLength(1);
      expect(kit.store.movements[0].type).toBe('opening');

      const je = kit.store.journalEntries[0];
      expect(je.lines).toHaveLength(2);
      expect(je.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 50, credit: 0 });
      expect(je.lines.find((l) => l.accountId === 'acc-3950')).toEqual({ accountId: 'acc-3950', debit: 0, credit: 50 });
      expect(kit.store.auditLog[0].action).toBe('opening_stock_set');
    });

    it('falls back to OPENING_BALANCE_EQUITY when the batch has no offsetAccountId', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 0, costPrice: 0 });
      const batch = await posting.createOpeningStockBatch(makeBatch({ offsetAccountId: undefined }));
      await posting.confirmBatch(batch.id, { confirmed: true });
      const je = kit.store.journalEntries[0];
      expect(je.lines.find((l) => l.accountId === 'acc-OPENING_BALANCE_EQUITY')).toEqual({ accountId: 'acc-OPENING_BALANCE_EQUITY', debit: 0, credit: 50 });
    });

    it('previewAccountingEffect now resolves real account ids via the resolver', async () => {
      const batch = await posting.createOpeningStockBatch(makeBatch({ offsetAccountId: undefined }));
      const preview = await posting.previewAccountingEffect(batch.id);
      expect(preview.balanced).toBe(true);
      expect(preview.lines.find((l) => l.debit > 0)!.accountId).toBe('acc-INVENTORY');
      expect(preview.lines.find((l) => l.credit > 0)!.accountId).toBe('acc-OPENING_BALANCE_EQUITY');
    });

    it('a second confirm is rejected and never double-posts', async () => {
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 0, costPrice: 0 });
      const batch = await posting.createOpeningStockBatch(makeBatch());
      await posting.confirmBatch(batch.id, { confirmed: true });
      await expect(posting.confirmBatch(batch.id, { confirmed: true })).rejects.toThrow(/only a draft/i);
      expect(kit.store.movements).toHaveLength(1);
      expect(kit.store.journalEntries).toHaveLength(1);
    });
  });
});
