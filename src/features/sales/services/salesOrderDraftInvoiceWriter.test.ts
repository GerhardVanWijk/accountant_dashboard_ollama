import { describe, expect, it, vi } from 'vitest';
import type { Invoice, SalesOrder } from '@/types';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import {
  LocalSalesOrderDraftInvoiceWriter,
  RpcSalesOrderDraftInvoiceWriter,
} from './salesOrderDraftInvoiceWriter';
import { buildInvoiceFromSelections } from '../utils/salesOrderFulfilment';

function so(): SalesOrder {
  return {
    id: 'so_1',
    orderNumber: 'SO-2026-0001',
    customerId: 'cust_1',
    orderDate: '2026-09-01',
    lineItems: [
      { id: 'L1', productId: 'p1', warehouseId: 'wh1', description: 'Printer', quantity: 10, unitPrice: 2000, taxRateId: 'v15', taxAmount: 3000, lineTotal: 20000 },
    ],
    subtotal: 20000,
    taxTotal: 3000,
    total: 23000,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: '',
    updatedAt: '',
  };
}

describe('LocalSalesOrderDraftInvoiceWriter', () => {
  it('assembles a draft invoice from the built result and writes it through the repository', async () => {
    const repo = new MockInvoiceRepository([]);
    const order = so();
    const built = buildInvoiceFromSelections(order, [], [{ salesOrderLineId: 'L1', quantity: 3 }]);
    const writer = new LocalSalesOrderDraftInvoiceWriter(repo);

    const invoice = await writer.write({ order, existingInvoices: [], built, selections: [{ salesOrderLineId: 'L1', quantity: 3 }] });

    expect(invoice.status).toBe('draft');
    expect(invoice.salesOrderId).toBe('so_1');
    expect(invoice.lineItems).toHaveLength(1);
    expect(invoice.lineItems[0].id).not.toBe('L1');
    expect(invoice.lineItems[0].salesOrderLineId).toBe('L1');
    expect(invoice.lineItems[0].productId).toBe('p1');
    expect(invoice.lineItems[0].quantity).toBe(3);
    expect(invoice.lineItems[0].lineTotal).toBeCloseTo(6000, 2);
    expect(invoice.total).toBeCloseTo(6900, 2);
    expect((await repo.getById(invoice.id))).toBeDefined();
  });
});

describe('RpcSalesOrderDraftInvoiceWriter', () => {
  function fakeInvoice(): Invoice {
    return {
      id: 'inv_new', invoiceNumber: 'INV-2026-0007', customerId: 'cust_1', salesOrderId: 'so_1',
      issueDate: '2026-09-05', dueDate: '2026-10-05',
      lineItems: [{ id: 'il', salesOrderLineId: 'L1', description: 'Printer', quantity: 3, unitPrice: 2000, taxAmount: 900, lineTotal: 6000 }],
      subtotal: 6000, taxTotal: 900, total: 6900, amountPaid: 0, currency: 'ZAR', status: 'draft', createdAt: '', updatedAt: '',
    };
  }

  it('calls the RPC with only { salesOrderLineId, quantity } and re-reads the created invoice', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { invoice_id: 'inv_new', invoice_number: 'INV-2026-0007' }, error: null });
    const repo = { getById: vi.fn().mockResolvedValue(fakeInvoice()) } as never;
    const writer = new RpcSalesOrderDraftInvoiceWriter({ rpc } as never, repo);

    const invoice = await writer.write({
      order: so(),
      existingInvoices: [],
      built: buildInvoiceFromSelections(so(), [], [{ salesOrderLineId: 'L1', quantity: 3 }]),
      selections: [{ salesOrderLineId: 'L1', quantity: 3, productId: 'HACK', unitPrice: 1 } as never],
      createdBy: 'user-9',
    });

    expect(rpc).toHaveBeenCalledWith('create_invoice_from_sales_order', {
      p_sales_order_id: 'so_1',
      p_selections: [{ salesOrderLineId: 'L1', quantity: 3 }], // stripped to just the two keys
      p_created_by: 'user-9',
      p_issue_date: null,
      // NORMALIZED_DOCUMENT_LINES_ENABLED is false, so the RPC's own
      // invoice_lines projection (migration 0062) stays off, mirroring the
      // TS projector.
      p_project_lines: false,
    });
    expect(invoice.id).toBe('inv_new');
  });

  it('surfaces the RPC error message (prefix stripped)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'create_invoice_from_sales_order: only 2 remain to invoice' } });
    const writer = new RpcSalesOrderDraftInvoiceWriter({ rpc } as never, {} as never);
    await expect(
      writer.write({ order: so(), existingInvoices: [], built: buildInvoiceFromSelections(so(), [], [{ salesOrderLineId: 'L1', quantity: 3 }]), selections: [{ salesOrderLineId: 'L1', quantity: 3 }] }),
    ).rejects.toThrow(/^only 2 remain to invoice$/);
  });
});
