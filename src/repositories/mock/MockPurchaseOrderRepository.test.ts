import { describe, it, expect, beforeEach } from 'vitest';
import { MockPurchaseOrderRepository } from './MockPurchaseOrderRepository';
import { seedPurchaseOrders } from '@/mock-data/purchaseOrders';
import type { PurchaseOrder } from '@/types';

describe('MockPurchaseOrderRepository', () => {
  let repository: MockPurchaseOrderRepository;

  beforeEach(() => {
    repository = new MockPurchaseOrderRepository();
  });

  describe('getAll', () => {
    it('should return all purchase orders', async () => {
      const pos = await repository.getAll();
      expect(pos).toBeDefined();
      expect(pos.length).toBe(seedPurchaseOrders.length);
    });

    it('should return a copy, not the original', async () => {
      const pos = await repository.getAll();
      expect(pos).not.toBe(seedPurchaseOrders);
    });
  });

  describe('getById', () => {
    it('should return a purchase order by ID', async () => {
      const po = await repository.getById(seedPurchaseOrders[0].id);
      expect(po).toBeDefined();
      expect(po?.id).toBe(seedPurchaseOrders[0].id);
    });

    it('should return undefined for non-existent PO', async () => {
      const po = await repository.getById('non-existent-id');
      expect(po).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a new purchase order', async () => {
      const newPO: PurchaseOrder = {
        id: '',
        poNumber: 'PO-TEST-001',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        expectedDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newPO);
      expect(created.id).toBeDefined();
      expect(created.id).not.toBe('');
      expect(created.poNumber).toBe('PO-TEST-001');
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('should add PO to repository', async () => {
      const newPO: PurchaseOrder = {
        id: '',
        poNumber: 'PO-TEST-002',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        expectedDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newPO);
      const retrieved = await repository.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.poNumber).toBe('PO-TEST-002');
    });
  });

  describe('update', () => {
    it('should update a purchase order', async () => {
      const poToUpdate = seedPurchaseOrders[0];
      const updated = await repository.update(poToUpdate.id, {
        status: 'sent',
      });

      expect(updated.status).toBe('sent');
    });

    it('should throw error for non-existent PO', async () => {
      await expect(
        repository.update('non-existent-id', { status: 'sent' }),
      ).rejects.toThrow('not found');
    });

    it('should preserve original ID', async () => {
      const poToUpdate = seedPurchaseOrders[0];
      const originalId = poToUpdate.id;
      const updated = await repository.update(originalId, { status: 'sent' });
      expect(updated.id).toBe(originalId);
    });
  });

  describe('delete', () => {
    it('should delete a purchase order', async () => {
      const newPO: PurchaseOrder = {
        id: '',
        poNumber: 'PO-TEST-DELETE',
        supplierId: 'sup_test',
        orderDate: '2026-08-21',
        expectedDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newPO);
      await repository.delete(created.id);

      const deleted = await repository.getById(created.id);
      expect(deleted).toBeUndefined();
    });

    it('should not throw error when deleting non-existent PO', async () => {
      await expect(repository.delete('non-existent-id')).resolves.toBeUndefined();
    });
  });
});
