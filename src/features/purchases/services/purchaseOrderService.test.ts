import { describe, it, expect, beforeEach } from 'vitest';
import { PurchaseOrderService } from './purchaseOrderService';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';
import { seedPurchaseOrders } from '@/mock-data/purchaseOrders';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';

/** A single accounting period wide open enough to cover every date these tests use. */
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

/**
 * Configurable stub InventoryReceiver — `trackedProductIds` controls which
 * products isTrackedInventory() reports as tracked, and `recordedReceipts`
 * lets tests assert recordReceiptMovement() was only called AFTER a
 * successful post, matching the real InventoryPostingAdapter's contract —
 * same pattern as billService.test.ts's stub.
 */
function makeInventoryReceiverStub(trackedProductIds: string[] = []) {
  const recordedReceipts: { productId: string; quantity: number; unitCost: number; reference: string; warehouseId?: string }[] = [];
  return {
    isTrackedInventory: async (productId: string) => trackedProductIds.includes(productId),
    recordReceiptMovement: async (
      productId: string,
      quantity: number,
      unitCost: number,
      reference: string,
      warehouseId?: string,
    ) => {
      recordedReceipts.push({ productId, quantity, unitCost, reference, warehouseId });
    },
    recordedReceipts,
  };
}

/**
 * Wires a REAL JournalEntryService so recordReceipt() tests prove a
 * genuinely balanced GRNI journal entry is produced, not a mocked
 * assertion — mirrors billService.test.ts/creditNoteService.test.ts.
 */
function setup(trackedProductIds: string[] = [], seed = true) {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));

  const repository = seed ? new MockPurchaseOrderRepository() : new MockPurchaseOrderRepository([]);
  const inventoryReceiver = makeInventoryReceiverStub(trackedProductIds);
  const poService = new PurchaseOrderService(repository, journalEntryService, inventoryReceiver, accountMapper);

  return { poService, repository, journalEntryService, inventoryReceiver };
}

describe('PurchaseOrderService', () => {
  let poService: PurchaseOrderService;

  beforeEach(() => {
    ({ poService } = setup());
  });

  describe('getPurchaseOrders', () => {
    it('should return all purchase orders', async () => {
      const pos = await poService.getPurchaseOrders();
      expect(pos).toBeDefined();
      expect(pos.length).toBeGreaterThan(0);
      expect(pos.length).toBe(seedPurchaseOrders.length);
    });
  });

  describe('getPurchaseOrder', () => {
    it('should return a purchase order by ID', async () => {
      const po = await poService.getPurchaseOrder(seedPurchaseOrders[0].id);
      expect(po).toBeDefined();
      expect(po?.id).toBe(seedPurchaseOrders[0].id);
      expect(po?.poNumber).toBe(seedPurchaseOrders[0].poNumber);
    });

    it('should return undefined for non-existent PO', async () => {
      const po = await poService.getPurchaseOrder('non-existent-id');
      expect(po).toBeUndefined();
    });
  });

  describe('createPurchaseOrder', () => {
    it('should create a new purchase order', async () => {
      const poData = {
        poNumber: 'PO-2026-TEST',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        expectedDate: '2026-09-21',
        lineItems: [
          {
            id: 'li_test',
            productId: 'prod_test',
            description: 'Test Item',
            quantity: 10,
            unitPrice: 100,
            taxRateId: 'tax_rate_15',
            taxAmount: 150,
            lineTotal: 1000,
          },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR' as const,
        status: 'draft' as const,
      };

      const po = await poService.createPurchaseOrder(poData);
      expect(po).toBeDefined();
      expect(po.id).toBeDefined();
      expect(po.poNumber).toBe('PO-2026-TEST');
      expect(po.total).toBe(1150);
      expect(po.status).toBe('draft');
    });
  });

  describe('updatePurchaseOrder', () => {
    it('should update a purchase order', async () => {
      const pos = await poService.getPurchaseOrders();
      const poToUpdate = pos[0];

      const updated = await poService.updatePurchaseOrder(poToUpdate.id, {
        status: 'sent',
      });

      expect(updated.status).toBe('sent');
    });

    it('should throw error for non-existent PO', async () => {
      await expect(
        poService.updatePurchaseOrder('non-existent-id', { status: 'sent' }),
      ).rejects.toThrow('not found');
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

      const deleted = await poService.getPurchaseOrder(draft.id);
      expect(deleted).toBeUndefined();
    });

    it('should refuse to delete a non-draft purchase order', async () => {
      const pos = await poService.getPurchaseOrders();
      const nonDraftPo = pos.find((po) => po.status !== 'draft');
      expect(nonDraftPo).toBeDefined();

      await expect(poService.deletePurchaseOrder(nonDraftPo!.id)).rejects.toThrow(/only a draft PO/i);

      const stillThere = await poService.getPurchaseOrder(nonDraftPo!.id);
      expect(stillThere).toBeDefined();
    });
  });

  describe('sendPurchaseOrder', () => {
    it('should change status from draft to sent', async () => {
      const pos = await poService.getPurchaseOrders();
      const draftPO = pos.find((po) => po.status === 'draft');

      if (draftPO) {
        const sent = await poService.sendPurchaseOrder(draftPO.id);
        expect(sent.status).toBe('sent');
      }
    });
  });

  describe('recordReceipt', () => {
    it('should mark a not-yet-received PO as received', async () => {
      const pos = await poService.getPurchaseOrders();
      const po = pos.find((p) => p.status === 'sent')!;
      expect(po).toBeDefined();

      const updated = await poService.recordReceipt(po.id);
      expect(updated.status).toBe('received');
      expect(updated.receivedDate).toBeDefined();
    });

    it('rejects receiving an already-received PO (idempotency — this posts a real GL entry)', async () => {
      const pos = await poService.getPurchaseOrders();
      const alreadyReceived = pos.find((p) => p.status === 'received')!;
      expect(alreadyReceived).toBeDefined();

      await expect(poService.recordReceipt(alreadyReceived.id)).rejects.toThrow(/already been received/i);
    });

    it('rejects receiving a cancelled PO', async () => {
      const { poService: svc } = setup();
      const pos = await svc.getPurchaseOrders();
      const po = pos.find((p) => p.status === 'sent')!;
      await svc.cancelPurchaseOrder(po.id);

      await expect(svc.recordReceipt(po.id)).rejects.toThrow(/cancelled/i);
    });

    it('posts DR Inventory / CR GRNI and records a stock receipt for a tracked-inventory line', async () => {
      const { poService: svc, journalEntryService, inventoryReceiver } = setup(['prod_tracked'], false);
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

      const entry = await journalEntryService.getEntry(received.journalEntryId!);
      const inventoryLine = entry!.lines.find((l) => l.accountId === 'acc_1200');
      const grniLine = entry!.lines.find((l) => l.accountId === 'acc_2050');
      expect(inventoryLine?.debit).toBe(500); // ex-VAT — receipt is not a tax invoice
      expect(grniLine?.credit).toBe(500);

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);

      expect(inventoryReceiver.recordedReceipts).toEqual([
        { productId: 'prod_tracked', quantity: 10, unitCost: 50, reference: 'PO PO-2026-GRNI-TEST', warehouseId: undefined },
      ]);
    });

    it('does not post a GL entry or touch stock for a PO with no tracked-inventory lines', async () => {
      const { poService: svc, inventoryReceiver } = setup([], false); // nothing tracked
      const created = await svc.createPurchaseOrder({
        poNumber: 'PO-2026-NO-STOCK',
        supplierId: 'sup_test',
        orderDate: '2026-08-22',
        lineItems: [
          { id: 'li_1', productId: 'prod_service', description: 'Consulting', quantity: 1, unitPrice: 500, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        currency: 'ZAR',
        status: 'sent',
      });

      const received = await svc.recordReceipt(created.id);
      expect(received.status).toBe('received');
      expect(received.journalEntryId).toBeUndefined();
      expect(inventoryReceiver.recordedReceipts).toEqual([]);
    });
  });

  describe('cancelPurchaseOrder', () => {
    it('should cancel a purchase order', async () => {
      const pos = await poService.getPurchaseOrders();
      const po = pos[0];

      const cancelled = await poService.cancelPurchaseOrder(po.id);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('convertToBill', () => {
    it('should convert PO to Bill', async () => {
      const pos = await poService.getPurchaseOrders();
      const po = pos[0];

      const bill = await poService.convertToBill(po.id);
      expect(bill).toBeDefined();
      expect(bill.billNumber).toContain('BILL-');
      expect(bill.supplierId).toBe(po.supplierId);
      expect(bill.total).toBe(po.total);
      expect(bill.status).toBe('awaiting_payment');
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

  describe('getPurchaseOrdersBySupplier', () => {
    it('should return POs for specific supplier', async () => {
      const pos = await poService.getPurchaseOrders();
      const supplierId = pos[0].supplierId;

      const supplierPOs = await poService.getPurchaseOrdersBySupplier(supplierId);
      expect(supplierPOs.every((po) => po.supplierId === supplierId)).toBe(true);
    });
  });

  describe('calculateOrderValue', () => {
    it('should calculate total order value', async () => {
      const total = await poService.calculateOrderValue();
      expect(total).toBeGreaterThanOrEqual(0);
      expect(typeof total).toBe('number');
    });

    it('should calculate value by status', async () => {
      const sentValue = await poService.calculateOrderValue('sent');
      expect(sentValue).toBeGreaterThanOrEqual(0);
      expect(typeof sentValue).toBe('number');
    });
  });
});
