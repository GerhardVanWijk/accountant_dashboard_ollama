import { describe, it, expect, beforeEach } from 'vitest';
import { PurchaseOrderService } from './purchaseOrderService';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';
import { seedPurchaseOrders } from '@/mock-data/purchaseOrders';

describe('PurchaseOrderService', () => {
  let poService: PurchaseOrderService;
  let repository: MockPurchaseOrderRepository;

  beforeEach(() => {
    repository = new MockPurchaseOrderRepository();
    poService = new PurchaseOrderService(repository);
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
    it('should mark PO as received', async () => {
      const pos = await poService.getPurchaseOrders();
      const po = pos[0];

      const updated = await poService.recordReceipt(po.id);
      expect(updated.status).toBe('received');
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
