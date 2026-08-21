import { describe, it, expect } from 'vitest';
import { MockInvoiceRepository } from './MockInvoiceRepository';
import type { Invoice } from '@/types';

describe('MockInvoiceRepository', () => {
  it('should get all invoices', async () => {
    const repo = new MockInvoiceRepository();
    const invoices = await repo.getAll();
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices[0]).toHaveProperty('id');
    expect(invoices[0]).toHaveProperty('invoiceNumber');
  });

  it('should get an invoice by ID', async () => {
    const repo = new MockInvoiceRepository();
    const allInvoices = await repo.getAll();
    const firstId = allInvoices[0].id;

    const invoice = await repo.getById(firstId);
    expect(invoice).toBeDefined();
    expect(invoice?.id).toBe(firstId);
  });

  it('should return undefined for non-existent invoice', async () => {
    const repo = new MockInvoiceRepository();
    const invoice = await repo.getById('non-existent-id');
    expect(invoice).toBeUndefined();
  });

  it('should create a new invoice', async () => {
    const repo = new MockInvoiceRepository([]);
    const newInvoice: Invoice = {
      id: '',
      invoiceNumber: 'INV-2026-9999',
      customerId: 'cust_test',
      issueDate: '2026-08-21T00:00:00.000Z',
      dueDate: '2026-09-21T00:00:00.000Z',
      lineItems: [
        {
          id: 'li_test',
          description: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          taxAmount: 15,
          lineTotal: 100,
        },
      ],
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      amountPaid: 0,
      currency: 'ZAR',
      status: 'draft',
      createdAt: '',
      updatedAt: '',
    };

    const created = await repo.create(newInvoice);
    expect(created.id).toBeDefined();
    expect(created.invoiceNumber).toBe('INV-2026-9999');
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    const fetched = await repo.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it('should update an invoice', async () => {
    const repo = new MockInvoiceRepository();
    const allInvoices = await repo.getAll();
    const firstId = allInvoices[0].id;

    const updated = await repo.update(firstId, { status: 'sent' });
    expect(updated.status).toBe('sent');
    expect(updated.updatedAt).toBeDefined();

    const fetched = await repo.getById(firstId);
    expect(fetched?.status).toBe('sent');
  });

  it('should throw error when updating non-existent invoice', async () => {
    const repo = new MockInvoiceRepository();
    await expect(repo.update('non-existent-id', { status: 'sent' })).rejects.toThrow();
  });

  it('should delete an invoice', async () => {
    const repo = new MockInvoiceRepository();
    const allInvoices = await repo.getAll();
    const firstId = allInvoices[0].id;

    await repo.delete(firstId);
    const deleted = await repo.getById(firstId);
    expect(deleted).toBeUndefined();
  });

  it('should not mutate seed data', async () => {
    const repo1 = new MockInvoiceRepository();
    const repo2 = new MockInvoiceRepository();

    const all1Before = await repo1.getAll();
    const all2Before = await repo2.getAll();

    expect(all1Before.length).toBe(all2Before.length);

    if (all1Before.length > 0) {
      await repo1.delete(all1Before[0].id);
      const all1After = await repo1.getAll();
      const all2After = await repo2.getAll();

      expect(all1After.length).toBeLessThan(all1Before.length);
      expect(all2After.length).toBe(all2Before.length);
    }
  });
});
