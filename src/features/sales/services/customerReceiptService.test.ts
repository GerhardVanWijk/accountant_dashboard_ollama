import { describe, it, expect } from 'vitest';
import { CustomerReceiptService } from './customerReceiptService';
import { MockCustomerReceiptRepository } from '@/repositories/mock/MockCustomerReceiptRepository';
import { InvoiceService } from '@/services/invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';

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
 * Wires REAL JournalEntryService and InvoiceService instances (not stubs)
 * so these tests prove CustomerReceiptService produces a genuinely
 * balanced journal entry and genuinely updates the allocated invoice via
 * InvoiceService.recordPayment() — mirrors
 * src/features/banking/services/bankTransactionService.test.ts.
 */
async function setup() {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

  const invoiceRepository = new MockInvoiceRepository([]);
  const noOpInventoryMover = { calculateCogs: async () => 0, recordSaleMovement: async () => {} };
  const invoiceService = new InvoiceService(invoiceRepository, journalEntryService, noOpInventoryMover);
  const invoice = await invoiceService.createInvoice({
    invoiceNumber: 'INV-2026-RCT-TEST',
    customerId: 'cust_test',
    issueDate: '2026-08-01T00:00:00.000Z',
    dueDate: '2026-08-31T00:00:00.000Z',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
  });

  const receiptRepository = new MockCustomerReceiptRepository([]);
  const service = new CustomerReceiptService(receiptRepository, journalEntryService, invoiceService);

  return { service, journalEntryService, invoiceService, invoiceRepository, receiptRepository, invoice };
}

describe('CustomerReceiptService', () => {
  describe('recordReceipt', () => {
    it('posts a balanced journal entry (debit Cash, credit AR) and applies allocations', async () => {
      const { service, journalEntryService, invoiceRepository, invoice } = await setup();

      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-2026-TEST-1',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'eft',
        amount: 1150,
        allocations: [{ invoiceId: invoice.id, amount: 1150 }],
        unallocatedAmount: 0,
        currency: 'ZAR',
      });

      expect(receipt.id).toBeDefined();
      expect(receipt.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(receipt.journalEntryId!);
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(1150);

      const cashLine = entry!.lines.find((l) => l.accountId === 'acc_1000');
      const arLine = entry!.lines.find((l) => l.accountId === 'acc_1100');
      expect(cashLine?.debit).toBeCloseTo(1150);
      expect(arLine?.credit).toBeCloseTo(1150);

      const updatedInvoice = await invoiceRepository.getById(invoice.id);
      expect(updatedInvoice?.amountPaid).toBe(1150);
      expect(updatedInvoice?.status).toBe('paid');
    });

    it('supports a receipt with no allocations (payment on account)', async () => {
      const { service } = await setup();

      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-2026-TEST-2',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'cash',
        amount: 500,
        allocations: [],
        unallocatedAmount: 500,
        currency: 'ZAR',
      });

      expect(receipt.journalEntryId).toBeDefined();
      expect(receipt.unallocatedAmount).toBe(500);
      expect(receipt.allocations).toHaveLength(0);
    });

    it('rejects a receipt whose allocations + unallocated do not sum to the amount', async () => {
      const { service, invoice } = await setup();

      await expect(
        service.recordReceipt({
          receiptNumber: 'RCT-2026-TEST-3',
          customerId: 'cust_test',
          date: '2026-08-10T00:00:00.000Z',
          method: 'eft',
          amount: 1000,
          allocations: [{ invoiceId: invoice.id, amount: 400 }],
          unallocatedAmount: 0,
          currency: 'ZAR',
        }),
      ).rejects.toThrow(/must equal the receipt amount/i);
    });

    it('rejects a non-positive receipt amount', async () => {
      const { service } = await setup();
      await expect(
        service.recordReceipt({
          receiptNumber: 'RCT-2026-TEST-4',
          customerId: 'cust_test',
          date: '2026-08-10T00:00:00.000Z',
          method: 'cash',
          amount: 0,
          allocations: [],
          unallocatedAmount: 0,
          currency: 'ZAR',
        }),
      ).rejects.toThrow(/greater than zero/i);
    });
  });

  describe('allocateToInvoice', () => {
    it('applies unallocated balance to an invoice', async () => {
      const { service, invoiceRepository, invoice } = await setup();

      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-2026-TEST-5',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'cash',
        amount: 500,
        allocations: [],
        unallocatedAmount: 500,
        currency: 'ZAR',
      });

      const allocated = await service.allocateToInvoice(receipt.id, invoice.id, 500);
      expect(allocated.unallocatedAmount).toBe(0);
      expect(allocated.allocations).toHaveLength(1);

      const updatedInvoice = await invoiceRepository.getById(invoice.id);
      expect(updatedInvoice?.amountPaid).toBe(500);
    });

    it('rejects allocating more than the unallocated balance', async () => {
      const { service, invoice } = await setup();
      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-2026-TEST-6',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'cash',
        amount: 100,
        allocations: [],
        unallocatedAmount: 100,
        currency: 'ZAR',
      });
      await expect(service.allocateToInvoice(receipt.id, invoice.id, 200)).rejects.toThrow(/remains unallocated/i);
    });
  });
});
