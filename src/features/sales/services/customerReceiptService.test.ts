import { describe, it, expect } from 'vitest';
import { CustomerReceiptService } from './customerReceiptService';
import { FakeDepositAllocationExecutor, type DepositAllocationRequest } from './depositAllocationExecutor';
import { MockCustomerReceiptRepository } from '@/repositories/mock/MockCustomerReceiptRepository';
import { InvoiceService } from '@/services/invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
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
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));

  const invoiceRepository = new MockInvoiceRepository([]);
  const inertEngine = {
    applyInventoryTransaction: async () => ({
      idempotent: false,
      transactionLogId: 't',
      journalEntryId: undefined,
      movementIds: [],
      warnings: [],
    }),
  };
  const inertResolver = { resolveForProduct: async () => 'acc_x', resolveKey: async () => 'acc_x' };
  const inertProducts = { getProduct: async () => undefined };
  const inertWarehouses = { getWarehouse: async () => undefined, getDefaultWarehouse: async () => undefined };
  const invoiceService = new InvoiceService(
    invoiceRepository,
    inertEngine,
    inertResolver,
    accountMapper,
    inertProducts,
    inertWarehouses,
  );
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
  const depositExecutor = new FakeDepositAllocationExecutor({
    journal: journalEntryService,
    invoices: invoiceService,
    receipts: receiptRepository,
    accounts: accountMapper,
  });
  const service = new CustomerReceiptService(
    receiptRepository,
    journalEntryService,
    invoiceService,
    accountMapper,
    depositExecutor,
  );

  return { service, journalEntryService, invoiceService, invoiceRepository, receiptRepository, depositExecutor, invoice };
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

  describe('Increment 4A — customer deposit split', () => {
    it('credits Customer Deposits (2600), not AR, for a completely unapplied receipt', async () => {
      const { service, journalEntryService } = await setup();
      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-DEP-1',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'eft',
        amount: 5000,
        allocations: [],
        unallocatedAmount: 5000,
        currency: 'ZAR',
      });
      const entry = await journalEntryService.getEntry(receipt.journalEntryId!);
      const cash = entry!.lines.find((l) => l.accountId === 'acc_1000');
      const ar = entry!.lines.find((l) => l.accountId === 'acc_1100');
      const deposits = entry!.lines.find((l) => l.accountId === 'acc_2600');
      expect(cash?.debit).toBeCloseTo(5000);
      expect(ar).toBeUndefined();
      expect(deposits?.credit).toBeCloseTo(5000);
    });

    it('splits a mixed receipt into one cash debit + AR credit (allocated) + Customer Deposits credit (unapplied)', async () => {
      const { service, journalEntryService, invoice } = await setup();
      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-DEP-2',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'eft',
        amount: 1150,
        allocations: [{ invoiceId: invoice.id, amount: 700 }],
        unallocatedAmount: 450,
        currency: 'ZAR',
      });
      const entry = await journalEntryService.getEntry(receipt.journalEntryId!);
      expect(entry!.lines.filter((l) => l.accountId === 'acc_1000')).toHaveLength(1);
      expect(entry!.lines.find((l) => l.accountId === 'acc_1000')?.debit).toBeCloseTo(1150);
      expect(entry!.lines.find((l) => l.accountId === 'acc_1100')?.credit).toBeCloseTo(700);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2600')?.credit).toBeCloseTo(450);
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    });

    it('allocateToInvoice posts DR Customer Deposits / CR AR with no cash line, and records the journal id on the allocation', async () => {
      const { service, journalEntryService, invoice } = await setup();
      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-DEP-3',
        customerId: 'cust_test',
        date: '2026-08-10T00:00:00.000Z',
        method: 'eft',
        amount: 800,
        allocations: [],
        unallocatedAmount: 800,
        currency: 'ZAR',
      });
      const updated = await service.allocateToInvoice(receipt.id, invoice.id, 300);
      const alloc = updated.allocations[updated.allocations.length - 1];
      expect(alloc.journalEntryId).toBeDefined();
      expect(updated.unallocatedAmount).toBeCloseTo(500);

      const entry = await journalEntryService.getEntry(alloc.journalEntryId!);
      expect(entry!.source).toBe('customer_receipt_allocation');
      expect(entry!.lines.find((l) => l.accountId === 'acc_1000')).toBeUndefined();
      expect(entry!.lines.find((l) => l.accountId === 'acc_2600')?.debit).toBeCloseTo(300);
      expect(entry!.lines.find((l) => l.accountId === 'acc_1100')?.credit).toBeCloseTo(300);
    });

    it('every new allocation carries a stable id equal to the one submitted', async () => {
      const { service, invoice } = await setup();
      const receipt = await service.recordReceipt({
        receiptNumber: 'RCT-DEP-4', customerId: 'cust_test', date: '2026-08-10T00:00:00.000Z',
        method: 'eft', amount: 800, allocations: [], unallocatedAmount: 800, currency: 'ZAR',
      });
      const updated = await service.allocateToInvoice(receipt.id, invoice.id, 300, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(updated.allocations[updated.allocations.length - 1].id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    });
  });

  describe('Increment 4A — deposit-allocation concurrency (stable allocation id)', () => {
    const req = (over: Partial<DepositAllocationRequest>): DepositAllocationRequest => ({
      allocationId: 'id-x', receiptId: 'r', invoiceId: 'i', amount: 100, date: '2026-08-11', createdBy: 'system', ...over,
    });

    async function seededReceipt(amount: number) {
      const ctx = await setup();
      const receipt = await ctx.service.recordReceipt({
        receiptNumber: `RCT-C-${Math.round(amount)}`, customerId: 'cust_test', date: '2026-08-10T00:00:00.000Z',
        method: 'eft', amount, allocations: [], unallocatedAmount: amount, currency: 'ZAR',
      });
      return { ...ctx, receipt };
    }

    it('same allocation id retried (lost response / double-click) → one JE, one allocation, one amountPaid change; second returns the first result', async () => {
      const { journalEntryService, invoiceRepository, receiptRepository, depositExecutor, receipt, invoice } = await seededReceipt(400);
      const before = (await journalEntryService.getEntries()).length;
      const r = req({ allocationId: 'alloc-1', receiptId: receipt.id, invoiceId: invoice.id, amount: 200 });

      const first = await depositExecutor.apply(r);
      const second = await depositExecutor.apply(r); // exact retry

      expect(first.idempotent).toBe(false);
      expect(second.idempotent).toBe(true);
      expect(second.journalEntryId).toBe(first.journalEntryId);
      expect((await journalEntryService.getEntries()).length).toBe(before + 1);
      expect((await receiptRepository.getById(receipt.id))?.allocations).toHaveLength(1);
      expect((await receiptRepository.getById(receipt.id))?.unallocatedAmount).toBeCloseTo(200);
      expect((await invoiceRepository.getById(invoice.id))?.amountPaid).toBeCloseTo(200);
    });

    it('two genuinely separate allocation ids, same receipt + invoice → both succeed sequentially; 2 JEs, 2 allocations', async () => {
      const { journalEntryService, invoiceRepository, receiptRepository, depositExecutor, receipt, invoice } = await seededReceipt(1000);
      const before = (await journalEntryService.getEntries()).length;

      await depositExecutor.apply(req({ allocationId: 'A', receiptId: receipt.id, invoiceId: invoice.id, amount: 400 }));
      await depositExecutor.apply(req({ allocationId: 'B', receiptId: receipt.id, invoiceId: invoice.id, amount: 300 }));

      expect((await journalEntryService.getEntries()).length).toBe(before + 2);
      const fr = await receiptRepository.getById(receipt.id);
      expect(fr?.allocations).toHaveLength(2);
      expect(fr?.allocations.map((a) => a.id)).toEqual(['A', 'B']);
      expect(fr?.unallocatedAmount).toBeCloseTo(300);
      expect((await invoiceRepository.getById(invoice.id))?.amountPaid).toBeCloseTo(700);
    });

    it('overdraw race: two different ids each want R700 of a R1,000 deposit → one succeeds, the second fails on re-validation; never negative / never double JE', async () => {
      const { journalEntryService, receiptRepository, depositExecutor, receipt, invoice } = await seededReceipt(1000);
      const before = (await journalEntryService.getEntries()).length;

      await depositExecutor.apply(req({ allocationId: 'A', receiptId: receipt.id, invoiceId: invoice.id, amount: 700 }));
      await expect(
        depositExecutor.apply(req({ allocationId: 'B', receiptId: receipt.id, invoiceId: invoice.id, amount: 700 })),
      ).rejects.toThrow(/remains unapplied/i);

      const fr = await receiptRepository.getById(receipt.id);
      expect(fr?.unallocatedAmount).toBeCloseTo(300);
      expect(fr?.unallocatedAmount).toBeGreaterThanOrEqual(0);
      expect((await journalEntryService.getEntries()).length).toBe(before + 1);
    });

    it('same receipt, different invoices → both allowed, deposit drawn down correctly', async () => {
      const ctx = await seededReceipt(1000);
      const invoice2 = await ctx.invoiceService.createInvoice({
        invoiceNumber: 'INV-C2', customerId: 'cust_test', issueDate: '2026-08-01T00:00:00.000Z',
        dueDate: '2026-08-31T00:00:00.000Z', lineItems: [], subtotal: 600, taxTotal: 0, total: 600,
        amountPaid: 0, currency: 'ZAR', status: 'sent',
      });
      await ctx.depositExecutor.apply(req({ allocationId: 'A', receiptId: ctx.receipt.id, invoiceId: ctx.invoice.id, amount: 400 }));
      await ctx.depositExecutor.apply(req({ allocationId: 'B', receiptId: ctx.receipt.id, invoiceId: invoice2.id, amount: 500 }));
      expect((await ctx.receiptRepository.getById(ctx.receipt.id))?.unallocatedAmount).toBeCloseTo(100);
      expect((await ctx.invoiceRepository.getById(invoice2.id))?.amountPaid).toBeCloseTo(500);
    });

    it('different receipts, same invoice → invoice outstanding cannot be exceeded', async () => {
      const ctx = await setup(); // invoice total 1150, outstanding 1150
      const mk = async (n: string) =>
        ctx.service.recordReceipt({
          receiptNumber: n, customerId: 'cust_test', date: '2026-08-10T00:00:00.000Z',
          method: 'eft', amount: 1000, allocations: [], unallocatedAmount: 1000, currency: 'ZAR',
        });
      const rc1 = await mk('RCT-D1');
      const rc2 = await mk('RCT-D2');

      await ctx.depositExecutor.apply(req({ allocationId: 'A', receiptId: rc1.id, invoiceId: ctx.invoice.id, amount: 1000 }));
      // invoice now has R150 outstanding — a R1,000 draw from the second receipt must fail
      await expect(
        ctx.depositExecutor.apply(req({ allocationId: 'B', receiptId: rc2.id, invoiceId: ctx.invoice.id, amount: 1000 })),
      ).rejects.toThrow(/only .* outstanding/i);
      expect((await ctx.invoiceRepository.getById(ctx.invoice.id))?.amountPaid).toBeCloseTo(1000);
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
