import { describe, it, expect, beforeEach } from 'vitest';
import { MockBillRepository } from './MockBillRepository';
import { seedBills } from '@/mock-data/bills';
import type { Bill } from '@/types';

describe('MockBillRepository', () => {
  let repository: MockBillRepository;

  beforeEach(() => {
    repository = new MockBillRepository();
  });

  describe('getAll', () => {
    it('should return all bills', async () => {
      const bills = await repository.getAll();
      expect(bills).toBeDefined();
      expect(bills.length).toBe(seedBills.length);
    });

    it('should return a copy, not the original', async () => {
      const bills = await repository.getAll();
      expect(bills).not.toBe(seedBills);
    });
  });

  describe('getById', () => {
    it('should return a bill by ID', async () => {
      const bill = await repository.getById(seedBills[0].id);
      expect(bill).toBeDefined();
      expect(bill?.id).toBe(seedBills[0].id);
    });

    it('should return undefined for non-existent bill', async () => {
      const bill = await repository.getById('non-existent-id');
      expect(bill).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a new bill', async () => {
      const newBill: Bill = {
        id: '',
        billNumber: 'BILL-TEST-001',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newBill);
      expect(created.id).toBeDefined();
      expect(created.id).not.toBe('');
      expect(created.billNumber).toBe('BILL-TEST-001');
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('should add bill to repository', async () => {
      const newBill: Bill = {
        id: '',
        billNumber: 'BILL-TEST-002',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newBill);
      const retrieved = await repository.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.billNumber).toBe('BILL-TEST-002');
    });
  });

  describe('update', () => {
    it('should update a bill', async () => {
      const billToUpdate = seedBills[0];
      const updated = await repository.update(billToUpdate.id, {
        status: 'paid',
        amountPaid: billToUpdate.total,
      });

      expect(updated.status).toBe('paid');
      expect(updated.amountPaid).toBe(billToUpdate.total);
    });

    it('should throw error for non-existent bill', async () => {
      await expect(
        repository.update('non-existent-id', { status: 'paid' }),
      ).rejects.toThrow('not found');
    });

    it('should preserve original ID', async () => {
      const billToUpdate = seedBills[0];
      const originalId = billToUpdate.id;
      const updated = await repository.update(originalId, { status: 'paid' });
      expect(updated.id).toBe(originalId);
    });
  });

  describe('delete', () => {
    it('should delete a bill', async () => {
      const newBill: Bill = {
        id: '',
        billNumber: 'BILL-TEST-DELETE',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(newBill);
      await repository.delete(created.id);

      const deleted = await repository.getById(created.id);
      expect(deleted).toBeUndefined();
    });

    it('should not throw error when deleting non-existent bill', async () => {
      await expect(repository.delete('non-existent-id')).resolves.toBeUndefined();
    });
  });
});
