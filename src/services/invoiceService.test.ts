import { describe, it, expect } from 'vitest';
import { InvoiceService } from './invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod, Invoice } from '@/types';

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
 * Wires a REAL JournalEntryService (the actual ledger posting engine, not a
 * stub) so postInvoice() tests prove a genuinely balanced journal entry is
 * produced, not a mocked assertion — mirrors
 * src/features/banking/services/bankTransactionService.test.ts.
 */
function setup(initialInvoices?: Invoice[]) {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

  const repo = initialInvoices ? new MockInvoiceRepository(initialInvoices) : new MockInvoiceRepository();
  const service = new InvoiceService(repo, journalEntryService);

  return { service, journalEntryService, repo };
}

describe('InvoiceService', () => {
  it('should get all invoices', async () => {
    const { service } = setup();
    const invoices = await service.getInvoices();
    expect(invoices.length).toBeGreaterThan(0);
  });

  it('should get an invoice by ID', async () => {
    const { service } = setup();
    const allInvoices = await service.getInvoices();

    const invoice = await service.getInvoice(allInvoices[0].id);
    expect(invoice).toBeDefined();
    expect(invoice?.invoiceNumber).toBe(allInvoices[0].invoiceNumber);
  });

  it('should create an invoice', async () => {
    const { service } = setup([]);

    const created = await service.createInvoice({
      invoiceNumber: 'INV-2026-0001',
      customerId: 'cust_test',
      issueDate: '2026-08-21T00:00:00.000Z',
      dueDate: '2026-09-21T00:00:00.000Z',
      lineItems: [],
      subtotal: 1000,
      taxTotal: 150,
      total: 1150,
      amountPaid: 0,
      currency: 'ZAR',
      status: 'draft',
    });

    expect(created.id).toBeDefined();
    expect(created.invoiceNumber).toBe('INV-2026-0001');
    expect(created.status).toBe('draft');
  });

  describe('postInvoice / markInvoiceAsSent', () => {
    it('posts a balanced journal entry and transitions draft -> sent', async () => {
      const { service, journalEntryService } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-1',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.markInvoiceAsSent(draft.id);
      expect(updated.status).toBe('sent');
      expect(updated.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(updated.journalEntryId!);
      expect(entry).toBeDefined();
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(1150);

      const arLine = entry!.lines.find((l) => l.accountId === 'acc_1100');
      const revenueLine = entry!.lines.find((l) => l.accountId === 'acc_4000');
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      expect(arLine?.debit).toBeCloseTo(1150);
      expect(revenueLine?.credit).toBeCloseTo(1000);
      expect(vatLine?.credit).toBeCloseTo(150);
    });

    it('omits the VAT Output line when taxTotal is zero', async () => {
      const { service, journalEntryService } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-2',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 500,
        taxTotal: 0,
        total: 500,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.postInvoice(draft.id);
      const entry = await journalEntryService.getEntry(updated.journalEntryId!);
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      expect(vatLine).toBeUndefined();

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(500);
    });

    it('rejects posting an invoice that is not draft', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const paidInvoice = allInvoices.find((inv) => inv.status === 'paid');
      expect(paidInvoice).toBeDefined();

      await expect(service.postInvoice(paidInvoice!.id)).rejects.toThrow(/draft/i);
    });

    it('does not update the invoice if GL posting fails (no open period for the date)', async () => {
      const { service, repo } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-3',
        customerId: 'cust_test',
        issueDate: '2027-06-01T00:00:00.000Z', // outside the test period (2026 only)
        dueDate: '2027-07-01T00:00:00.000Z',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      await expect(service.postInvoice(draft.id)).rejects.toThrow(/accounting period/i);

      const unchanged = await repo.getById(draft.id);
      expect(unchanged?.status).toBe('draft');
      expect(unchanged?.journalEntryId).toBeUndefined();
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices.find((inv) => inv.amountPaid < inv.total);

      if (invoice) {
        const amount = 100;
        const updated = await service.recordPayment(invoice.id, amount);

        expect(updated.amountPaid).toBe(invoice.amountPaid + amount);
        if (updated.amountPaid >= updated.total) {
          expect(updated.status).toBe('paid');
        } else if (updated.amountPaid > 0) {
          expect(updated.status).toBe('partially_paid');
        }
      }
    });
  });

  describe('getOutstandingAmount', () => {
    it('should calculate outstanding amount', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices[0];

      const outstanding = service.getOutstandingAmount(invoice);
      expect(outstanding).toBe(invoice.total - invoice.amountPaid);
    });
  });

  describe('getCollectionPercentage', () => {
    it('should calculate collection percentage', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices[0];

      const percentage = service.getCollectionPercentage(invoice);
      expect(percentage).toBe((invoice.amountPaid / invoice.total) * 100);
    });
  });

  describe('isOverdue', () => {
    it('should check if invoice is overdue', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      const overdueInvoice = allInvoices.find((inv) => inv.status === 'overdue');
      if (overdueInvoice) {
        expect(service.isOverdue(overdueInvoice)).toBe(true);
      }

      const paidInvoice = allInvoices.find((inv) => inv.status === 'paid');
      if (paidInvoice) {
        expect(service.isOverdue(paidInvoice)).toBe(false);
      }
    });
  });

  describe('getInvoicesByStatus', () => {
    it('should get invoices by status', async () => {
      const { service } = setup();
      const draftInvoices = await service.getInvoicesByStatus('draft');
      expect(draftInvoices.every((inv) => inv.status === 'draft')).toBe(true);
    });
  });

  describe('getInvoicesByCustomer', () => {
    it('should get invoices by customer', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      if (allInvoices.length > 0) {
        const customerId = allInvoices[0].customerId;
        const customerInvoices = await service.getInvoicesByCustomer(customerId);
        expect(customerInvoices.every((inv) => inv.customerId === customerId)).toBe(true);
      }
    });
  });

  describe('searchInvoices', () => {
    it('should search invoices', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      if (allInvoices.length > 0) {
        const invoiceNumber = allInvoices[0].invoiceNumber;
        const results = await service.searchInvoices(invoiceNumber);
        expect(results.some((inv) => inv.invoiceNumber === invoiceNumber)).toBe(true);
      }
    });
  });
});
