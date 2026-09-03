import { describe, it, expect, beforeEach } from 'vitest';
import { PurchaseOrderService } from './purchaseOrderService';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';
import { seedPurchaseOrders } from '@/mock-data/purchaseOrders';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { AccountingPeriodService } from '@/features/accounting/services/accountingPeriodService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { InventoryPostingEngine } from '@/features/inventory/services/inventoryPostingEngine';
import {
  FakeInventoryStore,
  FakeInventoryTransactionExecutor,
} from '@/features/inventory/services/inventoryPostingEngine.fake';
import { InventoryAccountResolverService } from '@/features/inventory/services/inventoryAccountResolver';
import { periodGuardFrom } from '@/features/inventory/services/documentInventoryPosting';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';
import type { AccountingPeriod, DocumentLineItem, ID, Product, ProductCategory, Warehouse } from '@/types';

/** Records every sync() call — the spy used by the Phase 9B projection test. */
class SpyLineProjector implements IDocumentLineProjector {
  calls: { documentId: ID; lines: readonly DocumentLineItem[] }[] = [];
  async sync(documentId: ID, lines: readonly DocumentLineItem[]): Promise<void> {
    this.calls.push({ documentId, lines });
  }
}

function makeOpenPeriod(): AccountingPeriod {
  return {
    id: 'period_test_open',
    companyId: 'comp_test',
    financialYearId: 'fy_test',
    name: '2026 (test)',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    sku: id,
    name: id,
    type: 'good',
    unitPrice: 100,
    costPrice: 0,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWarehouse(id: string, isDefault = false): Warehouse {
  return { id, name: id, code: id, isDefault, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

function setup(
  trackedProducts: Record<string, Partial<Product>> = {},
  opts: { seed?: boolean; categories?: Record<string, Partial<ProductCategory>>; lineProjector?: IDocumentLineProjector } = {},
) {
  const accountRepository = new MockAccountRepository(seedAccounts);
  const journalRepository = new MockJournalEntryRepository([]);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  const periodService = new AccountingPeriodService(periodRepository, auditLog);

  const store = new FakeInventoryStore();
  const engine = new InventoryPostingEngine(
    new FakeInventoryTransactionExecutor(store),
    periodGuardFrom(periodService),
  );

  const categoryMap = new Map<string, ProductCategory>();
  for (const [id, partial] of Object.entries(opts.categories ?? {})) {
    categoryMap.set(id, { id, name: id, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...partial });
  }
  const resolver = new InventoryAccountResolverService(accountMapper, { getCategory: async (id: string) => categoryMap.get(id) });

  const productStore = new Map<string, Product>();
  for (const [id, partial] of Object.entries(trackedProducts)) {
    const product = makeProduct(id, partial);
    productStore.set(id, product);
    store.addProduct(id, product.quantityOnHand, product.costPrice);
  }
  const products = { getProduct: async (id: string) => productStore.get(id) };

  const warehouseList = [makeWarehouse('wh_default', true)];
  const warehouses = {
    getWarehouse: async (id: string) => warehouseList.find((w) => w.id === id),
    getDefaultWarehouse: async () => warehouseList.find((w) => w.isDefault),
  };

  const repository = opts.seed === false ? new MockPurchaseOrderRepository([]) : new MockPurchaseOrderRepository();
  const poService = new PurchaseOrderService(
    repository,
    engine,
    resolver,
    products,
    warehouses,
    opts.lineProjector,
    auditLog,
  );

  const getJE = (id: string | undefined) => store.journalEntries.find((e) => e.id === id);
  return { poService, repository, store, getJE, auditLog };
}

describe('PurchaseOrderService', () => {
  let poService: PurchaseOrderService;

  beforeEach(() => {
    ({ poService } = setup());
  });

  describe('getPurchaseOrders', () => {
    it('should return all purchase orders', async () => {
      const pos = await poService.getPurchaseOrders();
      expect(pos.length).toBe(seedPurchaseOrders.length);
    });
  });

  describe('getPurchaseOrder', () => {
    it('should return a purchase order by ID', async () => {
      const po = await poService.getPurchaseOrder(seedPurchaseOrders[0].id);
      expect(po?.id).toBe(seedPurchaseOrders[0].id);
    });

    it('should return undefined for non-existent PO', async () => {
      expect(await poService.getPurchaseOrder('non-existent-id')).toBeUndefined();
    });
  });

  describe('createPurchaseOrder', () => {
    it('should create a new purchase order', async () => {
      const po = await poService.createPurchaseOrder({
        poNumber: 'PO-2026-TEST',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        expectedDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(po.poNumber).toBe('PO-2026-TEST');
      expect(po.status).toBe('draft');
    });

    it('projects lineItems into the normalized-line projector (Phase 9B — docs/ACCOUNTING_RELATIONSHIPS.md §17-18)', async () => {
      const projector = new SpyLineProjector();
      const { poService: withProjector } = setup({}, { seed: false, lineProjector: projector });
      const po = await withProjector.createPurchaseOrder({
        poNumber: 'PO-2026-PROJ',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        lineItems: [{ id: 'pol_1', description: 'Widget', quantity: 5, unitPrice: 10, taxAmount: 7.5, lineTotal: 50 }],
        subtotal: 50,
        taxTotal: 7.5,
        total: 57.5,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(projector.calls).toEqual([{ documentId: po.id, lines: po.lineItems }]);
    });
  });

  describe('updatePurchaseOrder', () => {
    it('should update a purchase order', async () => {
      const pos = await poService.getPurchaseOrders();
      const updated = await poService.updatePurchaseOrder(pos[0].id, { status: 'sent' });
      expect(updated.status).toBe('sent');
    });

    it('should throw error for non-existent PO', async () => {
      await expect(poService.updatePurchaseOrder('non-existent-id', { status: 'sent' })).rejects.toThrow('not found');
    });
  });

  describe('deletePurchaseOrder', () => {
    it('should delete a draft purchase order', async () => {
      const draft = await poService.createPurchaseOrder({
        poNumber: 'PO-2026-DRAFT-DELETE',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await poService.deletePurchaseOrder(draft.id);
      expect(await poService.getPurchaseOrder(draft.id)).toBeUndefined();
    });

    it('should refuse to delete a non-draft purchase order', async () => {
      const nonDraftPo = (await poService.getPurchaseOrders()).find((po) => po.status !== 'draft')!;
      await expect(poService.deletePurchaseOrder(nonDraftPo.id)).rejects.toThrow(/only a draft PO/i);
    });
  });

  describe('recordReceipt', () => {
    it('should mark a not-yet-received PO as received', async () => {
      const po = (await poService.getPurchaseOrders()).find((p) => p.status === 'sent')!;
      const updated = await poService.recordReceipt(po.id);
      expect(updated.status).toBe('received');
      expect(updated.receivedDate).toBeDefined();
    });

    it('rejects receiving an already-received PO', async () => {
      const alreadyReceived = (await poService.getPurchaseOrders()).find((p) => p.status === 'received')!;
      await expect(poService.recordReceipt(alreadyReceived.id)).rejects.toThrow(/already been received/i);
    });

    it('rejects receiving a cancelled PO', async () => {
      const { poService: svc } = setup();
      const po = (await svc.getPurchaseOrders()).find((p) => p.status === 'sent')!;
      await svc.cancelPurchaseOrder(po.id);
      await expect(svc.recordReceipt(po.id)).rejects.toThrow(/cancelled/i);
    });

    it('posts DR Inventory / CR GRNI and records a stock receipt for a tracked-inventory line', async () => {
      const { poService: svc, store, getJE } = setup({ prod_tracked: {} }, { seed: false });
      const created = await svc.createPurchaseOrder({
        poNumber: 'PO-2026-GRNI-TEST',
        supplierId: 'sup_test',
        orderDate: '2026-08-22',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        currency: 'ZAR',
        status: 'sent',
      });

      const received = await svc.recordReceipt(created.id);
      expect(received.status).toBe('received');
      expect(received.journalEntryId).toBeDefined();

      const entry = getJE(received.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.debit).toBe(500);
      expect(entry.lines.find((l) => l.accountId === 'acc_2050')?.credit).toBe(500);
      expect(entry.lines.reduce((s, l) => s + l.debit, 0)).toBe(entry.lines.reduce((s, l) => s + l.credit, 0));

      const receipts = store.movements.filter((m) => m.type === 'goods_received');
      expect(receipts).toHaveLength(1);
      expect(receipts[0].quantityDelta).toBe(10);
      expect(receipts[0].unitCost).toBe(50);
      expect(store.products.get('prod_tracked')!.costPrice).toBe(50);
    });

    it('routes the Inventory debit through the product category account', async () => {
      const { poService: svc, getJE } = setup(
        { prod_fur: { categoryId: 'cat_fur' } },
        { seed: false, categories: { cat_fur: { inventoryAccountId: 'acc_1500' } } },
      );
      const created = await svc.createPurchaseOrder({
        poNumber: 'PO-CAT',
        supplierId: 'sup_test',
        orderDate: '2026-08-22',
        lineItems: [{ id: 'li_1', productId: 'prod_fur', description: 'Desk', quantity: 4, unitPrice: 100, taxAmount: 60, lineTotal: 400 }],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        currency: 'ZAR',
        status: 'sent',
      });
      const received = await svc.recordReceipt(created.id);
      const entry = getJE(received.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_1500')?.debit).toBe(400);
      expect(entry.lines.find((l) => l.accountId === 'acc_2050')?.credit).toBe(400);
    });

    it('does not post a GL entry or touch stock for a PO with no tracked-inventory lines', async () => {
      const { poService: svc, store } = setup({}, { seed: false });
      const created = await svc.createPurchaseOrder({
        poNumber: 'PO-2026-NO-STOCK',
        supplierId: 'sup_test',
        orderDate: '2026-08-22',
        lineItems: [{ id: 'li_1', productId: 'prod_service', description: 'Consulting', quantity: 1, unitPrice: 500, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        currency: 'ZAR',
        status: 'sent',
      });
      const received = await svc.recordReceipt(created.id);
      expect(received.status).toBe('received');
      expect(received.journalEntryId).toBeUndefined();
      expect(store.movements).toHaveLength(0);
    });

    it('is idempotent on retry — no duplicate GRNI entry or movement', async () => {
      const { poService: svc, repository, store } = setup({ prod_tracked: {} }, { seed: false });
      const created = await svc.createPurchaseOrder({
        poNumber: 'PO-RETRY',
        supplierId: 'sup_test',
        orderDate: '2026-08-22',
        lineItems: [{ id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        currency: 'ZAR',
        status: 'sent',
      });
      const first = await svc.recordReceipt(created.id);
      await repository.update(created.id, { status: 'sent' });
      const second = await svc.recordReceipt(created.id);
      expect(second.journalEntryId).toBe(first.journalEntryId);
      expect(store.journalEntries).toHaveLength(1);
      expect(store.movements.filter((m) => m.type === 'goods_received')).toHaveLength(1);
    });
  });

  describe('convertToBill', () => {
    it('should convert PO to Bill', async () => {
      const po = (await poService.getPurchaseOrders())[0];
      const bill = await poService.convertToBill(po.id);
      expect(bill.billNumber).toContain('BILL-');
      expect(bill.total).toBe(po.total);
    });

    it('should throw error for non-existent PO', async () => {
      await expect(poService.convertToBill('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('getPurchaseOrdersByStatus', () => {
    it('should return POs with specific status', async () => {
      const sentPOs = await poService.getPurchaseOrdersByStatus('sent');
      expect(sentPOs.every((po) => po.status === 'sent')).toBe(true);
    });
  });

  describe('calculateOrderValue', () => {
    it('should calculate total order value', async () => {
      expect(typeof (await poService.calculateOrderValue())).toBe('number');
    });
  });

  describe('duplicatePurchaseOrder (Phase 4B)', () => {
    it('produces an independent DRAFT — new number, today, fresh line ids, no billId/journalEntryId/receivedDate', async () => {
      const { poService: svc, repository } = setup({}, { seed: false });
      const source = await svc.createPurchaseOrder({
        poNumber: 'PO-2026-0100',
        supplierId: 'supp_x',
        orderDate: '2026-01-01T00:00:00.000Z',
        expectedDate: '2026-01-15T00:00:00.000Z',
        lineItems: [
          { id: 'orig-line-1', description: 'Paper', quantity: 3, unitPrice: 40, taxAmount: 18, lineTotal: 120 },
        ],
        subtotal: 120,
        taxTotal: 18,
        total: 138,
        currency: 'ZAR',
        status: 'received',
        notes: 'keep me',
      });
      await repository.update(source.id, {
        billId: 'bill-1',
        journalEntryId: 'je-1',
        receivedDate: '2026-01-10T00:00:00.000Z',
      });

      const copy = await svc.duplicatePurchaseOrder(source.id);

      expect(copy.id).not.toBe(source.id);
      expect(copy.status).toBe('draft');
      expect(copy.billId).toBeUndefined();
      expect(copy.journalEntryId).toBeUndefined();
      expect(copy.receivedDate).toBeUndefined();
      expect(copy.expectedDate).toBeUndefined();
      expect(copy.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
      expect(copy.poNumber).not.toBe(source.poNumber);
      expect(copy.notes).toBe('keep me');
      expect(copy.lineItems[0].id).not.toBe('orig-line-1');
    });

    it('writes a "created" audit row naming the source PO number', async () => {
      const { poService: svc, auditLog } = setup({}, { seed: false });
      const source = await svc.createPurchaseOrder({
        poNumber: 'PO-2026-0200',
        supplierId: 'supp_x',
        orderDate: '2026-01-01T00:00:00.000Z',
        lineItems: [{ id: 'l1', description: 'Paper', quantity: 1, unitPrice: 40, taxAmount: 6, lineTotal: 40 }],
        subtotal: 40,
        taxTotal: 6,
        total: 46,
        currency: 'ZAR',
        status: 'draft',
      });
      const copy = await svc.duplicatePurchaseOrder(source.id);
      const logs = await auditLog.getForRecord('PurchaseOrder', copy.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('created');
      expect(logs[0].module).toBe('purchases');
      expect(logs[0].reason).toContain('PO-2026-0200');
    });

    it('throws when the source does not exist', async () => {
      const { poService: svc } = setup({}, { seed: false });
      await expect(svc.duplicatePurchaseOrder('nope')).rejects.toThrow(/not found/i);
    });
  });
});
