import { describe, it, expect, beforeEach } from 'vitest';
import { SupplierReturnService, type CreateSupplierReturnDTO } from './supplierReturnService';
import { MockSupplierReturnRepository } from '../repositories/MockSupplierReturnRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { SupplierReturnLine } from '@/types';
import { makePostingTestKit, makeProduct } from './inventoryPostingEngine.testkit';

/**
 * `lineTotal` is ex-VAT (`quantity × unitPrice`); `taxAmount` is the supplier's
 * actual VAT on that line. `subtotal = Σ lineTotal`, `taxTotal = Σ taxAmount`.
 */
function makeLine(overrides: Partial<SupplierReturnLine> = {}): SupplierReturnLine {
  const quantity = overrides.quantity ?? 2;
  const unitPrice = overrides.unitPrice ?? 100;
  return {
    supplierReturnId: overrides.supplierReturnId ?? 'srt_1',
    id: 'line-1',
    productId: 'prod-1',
    description: 'Widget',
    quantity,
    unitPrice,
    taxAmount: overrides.taxAmount ?? 30,
    lineTotal: overrides.lineTotal ?? quantity * unitPrice,
    ...overrides,
  };
}

function makeReturn(overrides: Partial<CreateSupplierReturnDTO> = {}): CreateSupplierReturnDTO {
  return {
    supplierId: 'sup-1',
    returnDate: '2026-08-30',
    reason: 'Damaged on arrival',
    lineItems: [makeLine()],
    ...overrides,
  };
}

const lineOf = (je: { lines: { accountId: string; debit: number; credit: number }[] }, acct: string) =>
  je.lines.find((l) => l.accountId === acct);

describe('SupplierReturnService', () => {
  let service: SupplierReturnService;
  let repository: MockSupplierReturnRepository;
  let auditRepo: MockAuditLogRepository;

  beforeEach(() => {
    repository = new MockSupplierReturnRepository([]);
    auditRepo = new MockAuditLogRepository();
    service = new SupplierReturnService(repository, new AuditLogService(auditRepo));
  });

  describe('createSupplierReturn', () => {
    it('creates a draft with an SRET-0001 number and recomputed totals', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      expect(ret.status).toBe('draft');
      expect(ret.returnNumber).toBe('SRET-0001');
      expect(ret.subtotal).toBe(200);
      expect(ret.taxTotal).toBe(30);
      expect(ret.total).toBe(230);
    });

    it('increments the return number', async () => {
      await service.createSupplierReturn(makeReturn());
      const second = await service.createSupplierReturn(makeReturn());
      expect(second.returnNumber).toBe('SRET-0002');
    });
  });

  describe('edit / delete guards', () => {
    it('recomputes totals on a draft edit', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      const updated = await service.updateSupplierReturn(ret.id, {
        lineItems: [makeLine({ lineTotal: 400, taxAmount: 60 })],
      });
      expect(updated.subtotal).toBe(400);
      expect(updated.taxTotal).toBe(60);
      expect(updated.total).toBe(460);
    });

    it('rejects editing / deleting once posted', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      await service.postSupplierReturn(ret.id);
      await expect(service.updateSupplierReturn(ret.id, { reason: 'x' })).rejects.toThrow(/only a draft/i);
      await expect(service.deleteSupplierReturn(ret.id)).rejects.toThrow(/only a draft/i);
    });

    it('deletes a draft', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      await service.deleteSupplierReturn(ret.id);
      expect(await service.getSupplierReturn(ret.id)).toBeUndefined();
    });
  });

  describe('postSupplierReturn (no engine)', () => {
    it('moves draft -> posted and writes an audit row', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      const posted = await service.postSupplierReturn(ret.id, 'user-2');
      expect(posted.status).toBe('posted');
      const audit = await auditRepo.getByRecord('SupplierReturn', ret.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('supplier_return_posted');
    });

    it('rejects posting a second time', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      await service.postSupplierReturn(ret.id);
      await expect(service.postSupplierReturn(ret.id)).rejects.toThrow(/only a draft/i);
    });
  });

  describe('cancelSupplierReturn', () => {
    it('cancels a draft', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      expect((await service.cancelSupplierReturn(ret.id)).status).toBe('cancelled');
    });

    it('refuses to cancel a posted return', async () => {
      const ret = await service.createSupplierReturn(makeReturn());
      await service.postSupplierReturn(ret.id);
      await expect(service.cancelSupplierReturn(ret.id)).rejects.toThrow(/immutable/i);
    });
  });

  describe('GL posting — inventory leaves at WAC, variance to Purchase Price Variance (5060)', () => {
    const WH = 'wh-1';
    let kit: ReturnType<typeof makePostingTestKit>;
    let posting: SupplierReturnService;

    beforeEach(() => {
      kit = makePostingTestKit();
      posting = new SupplierReturnService(repository, new AuditLogService(auditRepo), kit.engine, kit.resolver, kit.products);
      // 10 units carried at WAC R9.00.
      kit.seed(makeProduct({ id: 'prod-1' }), { quantityOnHand: 40, costPrice: 9, warehouseId: WH });
    });

    async function post(overrides: Partial<SupplierReturnLine> = {}, retOverrides: Partial<CreateSupplierReturnDTO> = {}) {
      const line = makeLine({ productId: 'prod-1', warehouseId: WH, quantity: 10, taxAmount: 0, ...overrides });
      const ret = await posting.createSupplierReturn(makeReturn({ lineItems: [line], ...retOverrides }));
      const posted = await posting.postSupplierReturn(ret.id, 'user-2');
      return { ret, posted, je: kit.store.journalEntries[0] };
    }

    it('refund == WAC: Dr AP / Cr Inventory, no PPV line; WAC unchanged; movement is purchase_return', async () => {
      const { posted, je } = await post({ unitPrice: 9 }); // net credit 90 == carrying 90
      expect(posted.journalEntryId).toBeDefined();
      expect(kit.store.products.get('prod-1')!.costPrice).toBe(9);
      expect(kit.store.products.get('prod-1')!.quantityOnHand).toBe(30);
      expect(kit.store.movements[0].type).toBe('purchase_return');
      expect(lineOf(je, 'acc-AP')).toEqual({ accountId: 'acc-AP', debit: 90, credit: 0 });
      expect(lineOf(je, 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 90 });
      expect(lineOf(je, 'acc-PURCHASE_PRICE_VARIANCE')).toBeUndefined();
    });

    it('refund > WAC: Dr AP 100 / Cr Inventory 90 / Cr PPV 10 (purchasing gain)', async () => {
      const { je } = await post({ unitPrice: 10 }); // net credit 100
      expect(lineOf(je, 'acc-AP')).toEqual({ accountId: 'acc-AP', debit: 100, credit: 0 });
      expect(lineOf(je, 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 90 });
      expect(lineOf(je, 'acc-PURCHASE_PRICE_VARIANCE')).toEqual({ accountId: 'acc-PURCHASE_PRICE_VARIANCE', debit: 0, credit: 10 });
    });

    it('refund < WAC: Dr AP 80 / Dr PPV 10 / Cr Inventory 90 (purchasing loss)', async () => {
      const { je } = await post({ unitPrice: 8 }); // net credit 80
      expect(lineOf(je, 'acc-AP')).toEqual({ accountId: 'acc-AP', debit: 80, credit: 0 });
      expect(lineOf(je, 'acc-PURCHASE_PRICE_VARIANCE')).toEqual({ accountId: 'acc-PURCHASE_PRICE_VARIANCE', debit: 10, credit: 0 });
      expect(lineOf(je, 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 90 });
    });

    it('with VAT: Dr AP 115 / Cr Inventory 90 / Cr VAT_INPUT 15 / Cr PPV 10; entry balances', async () => {
      const { je } = await post({ unitPrice: 10, taxAmount: 15 }); // net 100 + 15% VAT, total 115
      expect(lineOf(je, 'acc-AP')).toEqual({ accountId: 'acc-AP', debit: 115, credit: 0 });
      expect(lineOf(je, 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 90 });
      expect(lineOf(je, 'acc-VAT_INPUT')).toEqual({ accountId: 'acc-VAT_INPUT', debit: 0, credit: 15 });
      expect(lineOf(je, 'acc-PURCHASE_PRICE_VARIANCE')).toEqual({ accountId: 'acc-PURCHASE_PRICE_VARIANCE', debit: 0, credit: 10 });
      const dr = je.lines.reduce((a, l) => a + l.debit, 0);
      const cr = je.lines.reduce((a, l) => a + l.credit, 0);
      expect(dr).toBe(cr);
    });

    it('un-billed PO: settles GRNI at net credit (no VAT leg), variance to PPV', async () => {
      const { je } = await post({ unitPrice: 10, taxAmount: 0 }, { purchaseOrderId: 'po-1' });
      expect(lineOf(je, 'acc-GRNI')).toEqual({ accountId: 'acc-GRNI', debit: 100, credit: 0 });
      expect(lineOf(je, 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 90 });
      expect(lineOf(je, 'acc-PURCHASE_PRICE_VARIANCE')).toEqual({ accountId: 'acc-PURCHASE_PRICE_VARIANCE', debit: 0, credit: 10 });
      expect(lineOf(je, 'acc-VAT_INPUT')).toBeUndefined();
      expect(lineOf(je, 'acc-AP')).toBeUndefined();
    });

    it('is idempotent — a re-post is blocked and the engine never double-posts', async () => {
      const { ret } = await post({ unitPrice: 10 });
      await expect(posting.postSupplierReturn(ret.id)).rejects.toThrow(/only a draft/i);
      expect(kit.store.movements).toHaveLength(1);
      expect(kit.store.journalEntries).toHaveLength(1);
      // engine-level: the posting key is recorded, a replay returns the first result
      const replay = await kit.engine.applyInventoryTransaction({
        postingKey: `supplier_return:${ret.id}:post`,
        sourceType: 'supplier_return',
        sourceId: ret.id,
        movementDate: '2026-08-30',
        createdBy: 'user-2',
        lines: [],
      });
      expect(replay.idempotent).toBe(true);
      expect(kit.store.journalEntries).toHaveLength(1);
    });

    it('a reversal balances, restores stock, and its idempotent replay carries movement ids', async () => {
      const { ret } = await post({ unitPrice: 10 });
      const rev = await kit.engine.reverseInventoryTransaction({
        postingKey: `supplier_return:${ret.id}:reverse`,
        originalPostingKey: `supplier_return:${ret.id}:post`,
        movementDate: '2026-08-31',
        createdBy: 'user-2',
        reason: 'return cancelled',
      });
      expect(rev.movementIds).toHaveLength(1);
      expect(kit.store.products.get('prod-1')!.quantityOnHand).toBe(40); // 30 + 10 restored
      const revJe = kit.store.journalEntries.find((e) => e.reversalOfEntryId);
      expect(revJe).toBeDefined();
      const dr = revJe!.lines.reduce((a, l) => a + l.debit, 0);
      const cr = revJe!.lines.reduce((a, l) => a + l.credit, 0);
      expect(dr).toBe(cr);

      const replay = await kit.engine.reverseInventoryTransaction({
        postingKey: `supplier_return:${ret.id}:reverse`,
        originalPostingKey: `supplier_return:${ret.id}:post`,
        movementDate: '2026-08-31',
        createdBy: 'user-2',
      });
      expect(replay.idempotent).toBe(true);
      expect(replay.movementIds).toEqual(rev.movementIds);
    });
  });
});
