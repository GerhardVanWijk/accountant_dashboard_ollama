import { describe, it, expect } from 'vitest';
import { InvoiceService } from './invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';

describe('InvoiceService', () => {
  it('should get all invoices', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);

    const invoices = await service.getInvoices();
    expect(invoices.length).toBeGreaterThan(0);
  });

  it('should get an invoice by ID', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();

    const invoice = await service.getInvoice(allInvoices[0].id);
    expect(invoice).toBeDefined();
    expect(invoice?.invoiceNumber).toBe(allInvoices[0].invoiceNumber);
  });

  it('should create an invoice', async () => {
    const repo = new MockInvoiceRepository([]);
    const service = new InvoiceService(repo);

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

  it('should mark invoice as sent', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();
    const invoiceId = allInvoices[0].id;

    const updated = await service.markInvoiceAsSent(invoiceId);
    expect(updated.status).toBe('sent');
  });

  it('should record payment and update status', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
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

  it('should calculate outstanding amount', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();
    const invoice = allInvoices[0];

    const outstanding = service.getOutstandingAmount(invoice);
    expect(outstanding).toBe(invoice.total - invoice.amountPaid);
  });

  it('should calculate collection percentage', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();
    const invoice = allInvoices[0];

    const percentage = service.getCollectionPercentage(invoice);
    expect(percentage).toBe((invoice.amountPaid / invoice.total) * 100);
  });

  it('should check if invoice is overdue', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();

    // Find an overdue invoice
    const overdueInvoice = allInvoices.find((inv) => inv.status === 'overdue');
    if (overdueInvoice) {
      const isOverdue = service.isOverdue(overdueInvoice);
      expect(isOverdue).toBe(true);
    }

    // Paid invoices should not be overdue
    const paidInvoice = allInvoices.find((inv) => inv.status === 'paid');
    if (paidInvoice) {
      const isOverdue = service.isOverdue(paidInvoice);
      expect(isOverdue).toBe(false);
    }
  });

  it('should get invoices by status', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);

    const draftInvoices = await service.getInvoicesByStatus('draft');
    expect(draftInvoices.every((inv) => inv.status === 'draft')).toBe(true);
  });

  it('should get invoices by customer', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();

    if (allInvoices.length > 0) {
      const customerId = allInvoices[0].customerId;
      const customerInvoices = await service.getInvoicesByCustomer(customerId);
      expect(customerInvoices.every((inv) => inv.customerId === customerId)).toBe(true);
    }
  });

  it('should search invoices', async () => {
    const repo = new MockInvoiceRepository();
    const service = new InvoiceService(repo);
    const allInvoices = await service.getInvoices();

    if (allInvoices.length > 0) {
      const invoiceNumber = allInvoices[0].invoiceNumber;
      const results = await service.searchInvoices(invoiceNumber);
      expect(results.some((inv) => inv.invoiceNumber === invoiceNumber)).toBe(true);
    }
  });
});
