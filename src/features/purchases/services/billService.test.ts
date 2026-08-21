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
import { taxRateService } from '@/features/tax/services';
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
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    repository = new MockBillRepository();
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(
      journalRepository,
      accountRepository,
      periodRepository,
      auditLog,
    );
    billService = new BillService(repository, journalEntryService, taxRateService);
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

    it('posts the full VAT to VAT Input when every line is deductible', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-STD',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Standard-rated supplies', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std_v2', taxAmount: 150, lineTotal: 1000 },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await billService.postBill(bill.id);
      const entry = await journalEntryService.getAccountLedger('acc_2110');
      const vatInputLine = entry.find((row) => row.entryId === posted.journalEntryId);
      expect(vatInputLine?.debit).toBe(150);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(1000);
    });

    it('folds non-deductible VAT into the expense line instead of posting it to VAT Input', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-NODEDUCT',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Client entertainment', quantity: 1, unitPrice: 400, taxRateId: 'tax_nondeductible', taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await billService.postBill(bill.id);

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      expect(vatInputLedger.some((row) => row.entryId === posted.journalEntryId)).toBe(false);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(460); // subtotal (400) + non-deductible VAT (60), never claimed
    });

    it('splits a mixed bill correctly between deductible and non-deductible VAT', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-MIXED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Supplies', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std_v2', taxAmount: 150, lineTotal: 1000 },
          { id: 'li_2', description: 'Client entertainment', quantity: 1, unitPrice: 400, taxRateId: 'tax_nondeductible', taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 1400,
        taxTotal: 210,
        total: 1610,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await billService.postBill(bill.id);

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      const vatInputLine = vatInputLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(vatInputLine?.debit).toBe(150); // only the deductible portion

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(1460); // subtotal (1400) + non-deductible VAT (60)

      const apLedger = await journalEntryService.getAccountLedger('acc_2000');
      const apLine = apLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(apLine?.credit).toBe(1610); // still the full bill total, unaffected by the split
    });

    it('conservatively treats VAT with no resolvable tax rate as non-deductible rather than claiming it', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-UNRESOLVED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Mystery supplies', quantity: 1, unitPrice: 500, taxRateId: 'tax_does_not_exist', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await billService.postBill(bill.id);

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      expect(vatInputLedger.some((row) => row.entryId === posted.journalEntryId)).toBe(false);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(575);
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
