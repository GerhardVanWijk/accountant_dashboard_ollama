import { describe, it, expect, beforeEach } from 'vitest';
import { BillService } from './billService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { seedBills } from '@/mock-data/bills';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
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

describe('BillService', () => {
  let billService: BillService;
  let repository: MockBillRepository;

  beforeEach(() => {
    repository = new MockBillRepository();
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    const journalEntryService = new JournalEntryService(
      journalRepository,
      accountRepository,
      periodRepository,
      auditLog,
    );
    billService = new BillService(repository, journalEntryService);
  });

  describe('getBills', () => {
    it('should return all bills', async () => {
      const bills = await billService.getBills();
      expect(bills).toBeDefined();
      expect(bills.length).toBeGreaterThan(0);
      expect(bills.length).toBe(seedBills.length);
    });
  });

  describe('getBill', () => {
    it('should return a bill by ID', async () => {
      const bill = await billService.getBill(seedBills[0].id);
      expect(bill).toBeDefined();
      expect(bill?.id).toBe(seedBills[0].id);
      expect(bill?.billNumber).toBe(seedBills[0].billNumber);
    });

    it('should return undefined for non-existent bill', async () => {
      const bill = await billService.getBill('non-existent-id');
      expect(bill).toBeUndefined();
    });
  });

  describe('createBill', () => {
    it('should create a new bill', async () => {
      const billData = {
        billNumber: 'BILL-2026-TEST',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
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
        amountPaid: 0,
        currency: 'ZAR' as const,
        status: 'draft' as const,
      };

      const bill = await billService.createBill(billData);
      expect(bill).toBeDefined();
      expect(bill.id).toBeDefined();
      expect(bill.billNumber).toBe('BILL-2026-TEST');
      expect(bill.total).toBe(1150);
      expect(bill.status).toBe('draft');
    });
  });

  describe('updateBill', () => {
    it('should update a bill', async () => {
      const bills = await billService.getBills();
      const billToUpdate = bills[0];

      const updated = await billService.updateBill(billToUpdate.id, {
        status: 'paid',
        amountPaid: billToUpdate.total,
      });

      expect(updated.status).toBe('paid');
      expect(updated.amountPaid).toBe(billToUpdate.total);
    });

    it('should throw error for non-existent bill', async () => {
      await expect(
        billService.updateBill('non-existent-id', { status: 'paid' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteBill', () => {
    it('should delete a draft bill', async () => {
      const draft = await billService.createBill({
        billNumber: 'BILL-2026-DRAFT-DELETE',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      await billService.deleteBill(draft.id);

      const deleted = await billService.getBill(draft.id);
      expect(deleted).toBeUndefined();
    });

    it('should refuse to delete a posted (non-draft) bill', async () => {
      const bills = await billService.getBills();
      const postedBill = bills.find((b) => b.status !== 'draft');
      expect(postedBill).toBeDefined();

      await expect(billService.deleteBill(postedBill!.id)).rejects.toThrow(/only a draft bill/i);

      const stillThere = await billService.getBill(postedBill!.id);
      expect(stillThere).toBeDefined();
    });
  });

  describe('postBill', () => {
    it('should change status from draft to awaiting_payment', async () => {
      const bills = await billService.getBills();
      const draftBill = bills.find((b) => b.status === 'draft');

      if (!draftBill) {
        // Create one
        const newBill = await billService.createBill({
          billNumber: 'BILL-2026-DRAFT',
          supplierId: 'sup_test',
          issueDate: '2026-08-21',
          dueDate: '2026-09-21',
          lineItems: [],
          subtotal: 0,
          taxTotal: 0,
          total: 0,
          amountPaid: 0,
          currency: 'ZAR',
          status: 'draft',
        });

        const posted = await billService.postBill(newBill.id);
        expect(posted.status).toBe('awaiting_payment');
      }
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const bills = await billService.getBills();
      const bill = bills.find((b) => b.amountPaid === 0) || bills[3];

      const paymentAmount = bill.total / 2;
      const updated = await billService.recordPayment(bill.id, paymentAmount);

      expect(updated.amountPaid).toBe(bill.amountPaid + paymentAmount);
      if (updated.amountPaid < updated.total) {
        expect(updated.status).toBe('partially_paid');
      }
    });

    it('should mark bill as paid when fully paid', async () => {
      const bills = await billService.getBills();
      const unpaidBill = bills.find((b) => b.amountPaid === 0 && b.status !== 'paid');

      if (unpaidBill) {
        const updated = await billService.recordPayment(unpaidBill.id, unpaidBill.total);
        expect(updated.amountPaid).toBe(unpaidBill.total);
        expect(updated.status).toBe('paid');
      }
    });
  });

  describe('getBillsByStatus', () => {
    it('should return bills with specific status', async () => {
      const paidBills = await billService.getBillsByStatus('paid');
      expect(paidBills.every((b) => b.status === 'paid')).toBe(true);
    });
  });

  describe('getBillsBySupplier', () => {
    it('should return bills for specific supplier', async () => {
      const bills = await billService.getBills();
      const supplierId = bills[0].supplierId;

      const supplierBills = await billService.getBillsBySupplier(supplierId);
      expect(supplierBills.every((b) => b.supplierId === supplierId)).toBe(true);
    });
  });

  describe('getOutstandingBills', () => {
    it('should return bills not fully paid', async () => {
      const outstanding = await billService.getOutstandingBills();
      expect(outstanding.every((b) => b.amountPaid < b.total)).toBe(true);
    });
  });

  describe('calculateTotalOutstanding', () => {
    it('should calculate total outstanding amount', async () => {
      const total = await billService.calculateTotalOutstanding();
      expect(total).toBeGreaterThanOrEqual(0);
      expect(typeof total).toBe('number');
    });
  });
});
