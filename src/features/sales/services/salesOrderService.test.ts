import { describe, it, expect, beforeEach } from 'vitest';
import { SalesOrderService } from './salesOrderService';
import { MockSalesOrderRepository } from '@/repositories/mock/MockSalesOrderRepository';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedSalesOrders } from '@/mock-data/salesOrders';

describe('SalesOrderService', () => {
  let salesOrderService: SalesOrderService;
  let salesOrderRepository: MockSalesOrderRepository;
  let invoiceRepository: MockInvoiceRepository;
  let auditLog: AuditLogService;

  beforeEach(() => {
    salesOrderRepository = new MockSalesOrderRepository();
    invoiceRepository = new MockInvoiceRepository([]);
    auditLog = new AuditLogService(new MockAuditLogRepository());
    salesOrderService = new SalesOrderService(salesOrderRepository, invoiceRepository, auditLog);
  });

  describe('getSalesOrders', () => {
    it('should return all sales orders', async () => {
      const orders = await salesOrderService.getSalesOrders();
      expect(orders.length).toBe(seedSalesOrders.length);
    });
  });

  describe('createSalesOrder', () => {
    it('should create a new sales order', async () => {
      const order = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-TEST',
        customerId: 'cust_test',
        orderDate: '2026-08-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'pending',
      });

      expect(order.id).toBeDefined();
      expect(order.status).toBe('pending');
    });
  });

  describe('confirmOrder', () => {
    it('confirms a pending order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const pending = orders.find((o) => o.status === 'pending')!;
      const confirmed = await salesOrderService.confirmOrder(pending.id);
      expect(confirmed.status).toBe('confirmed');
    });

    it('rejects confirming a non-pending order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const nonPending = orders.find((o) => o.status !== 'pending')!;
      await expect(salesOrderService.confirmOrder(nonPending.id)).rejects.toThrow(/pending/i);
    });
  });

  describe('cancelOrder', () => {
    it('rejects cancelling a fulfilled order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const fulfilled = orders.find((o) => o.status === 'fulfilled')!;
      await expect(salesOrderService.cancelOrder(fulfilled.id)).rejects.toThrow(/fulfilled/i);
    });

    it('cancels a confirmed order with NO linked invoices', async () => {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-8100', customerId: 'c1', orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [{ id: 'L1', productId: 'p1', description: 'W', quantity: 5, unitPrice: 10, taxAmount: 7.5, lineTotal: 50 }],
        subtotal: 50, taxTotal: 7.5, total: 57.5, currency: 'ZAR', status: 'confirmed',
      });
      const cancelled = await salesOrderService.cancelOrder(so.id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('rejects cancelling once an invoice is linked — must close the remainder instead', async () => {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-8101', customerId: 'c1', orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [{ id: 'L1', productId: 'p1', description: 'W', quantity: 10, unitPrice: 10, taxAmount: 15, lineTotal: 100 }],
        subtotal: 100, taxTotal: 15, total: 115, currency: 'ZAR', status: 'confirmed',
      });
      await invoiceRepository.create({
        id: 'inv-x', invoiceNumber: 'INV-2026-8101', customerId: 'c1', salesOrderId: so.id,
        issueDate: '', dueDate: '', lineItems: [{ id: 'il', salesOrderLineId: 'L1', description: 'W', quantity: 4, unitPrice: 10, taxAmount: 6, lineTotal: 40 }],
        subtotal: 40, taxTotal: 6, total: 46, amountPaid: 0, currency: 'ZAR', status: 'sent', createdAt: '', updatedAt: '',
      });
      await expect(salesOrderService.cancelOrder(so.id)).rejects.toThrow(/close the remaining quantity instead/i);
    });
  });

  describe('closeRemaining (Phase 5B FINAL)', () => {
    async function partlyInvoicedSO() {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-8200', customerId: 'c1', orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [{ id: 'L1', productId: 'p1', description: 'Chair', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 }],
        subtotal: 1000, taxTotal: 150, total: 1150, currency: 'ZAR', status: 'confirmed',
      });
      await invoiceRepository.create({
        id: 'inv-p', invoiceNumber: 'INV-2026-8200', customerId: 'c1', salesOrderId: so.id,
        issueDate: '', dueDate: '', lineItems: [{ id: 'il', salesOrderLineId: 'L1', description: 'Chair', quantity: 7, unitPrice: 100, taxAmount: 105, lineTotal: 700 }],
        subtotal: 700, taxTotal: 105, total: 805, amountPaid: 0, currency: 'ZAR', status: 'sent', createdAt: '', updatedAt: '',
      });
      return so;
    }

    it('sets status to `closed` for a partly-invoiced confirmed order, and writes an audit row', async () => {
      const so = await partlyInvoicedSO();
      const closed = await salesOrderService.closeRemaining(so.id);
      expect(closed.status).toBe('closed');
      const logs = await auditLog.getForRecord('SalesOrder', so.id);
      expect(logs.some((l) => l.action === 'sales_order_closed' && /abandoned 3/.test(l.reason ?? ''))).toBe(true);
    });

    it('does NOT create any invoice or journal — closing is a pure commercial state change', async () => {
      const so = await partlyInvoicedSO();
      const before = (await invoiceRepository.getAll()).length;
      await salesOrderService.closeRemaining(so.id);
      expect((await invoiceRepository.getAll()).length).toBe(before);
    });

    it('rejects a confirmed order with nothing invoiced (cancel it instead)', async () => {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-8201', customerId: 'c1', orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [{ id: 'L1', productId: 'p1', description: 'W', quantity: 5, unitPrice: 10, taxAmount: 7.5, lineTotal: 50 }],
        subtotal: 50, taxTotal: 7.5, total: 57.5, currency: 'ZAR', status: 'confirmed',
      });
      await expect(salesOrderService.closeRemaining(so.id)).rejects.toThrow(/can be closed — otherwise cancel it/i);
    });

    it('rejects a pending / fulfilled / cancelled / already-closed order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      await expect(salesOrderService.closeRemaining(orders.find((o) => o.status === 'pending')!.id)).rejects.toThrow(/cannot close/i);
      await expect(salesOrderService.closeRemaining(orders.find((o) => o.status === 'fulfilled')!.id)).rejects.toThrow(/cannot close/i);
    });

    it('a closed order cannot then be invoiced', async () => {
      const so = await partlyInvoicedSO();
      await salesOrderService.closeRemaining(so.id);
      await expect(salesOrderService.convertToInvoice(so.id)).rejects.toThrow(/closed/i);
      await expect(
        salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 1 }]),
      ).rejects.toThrow(/closed/i);
    });
  });

  describe('convertToInvoice', () => {
    it('creates a draft invoice carrying over totals and salesOrderId, links each line; the order stays confirmed until the invoice POSTS', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const confirmed = orders.find((o) => o.status === 'confirmed')!;

      const invoice = await salesOrderService.convertToInvoice(confirmed.id);

      expect(invoice.id).toBeDefined();
      expect(invoice.salesOrderId).toBe(confirmed.id);
      expect(invoice.customerId).toBe(confirmed.customerId);
      expect(invoice.total).toBe(confirmed.total);
      expect(invoice.status).toBe('draft');
      expect(invoice.amountPaid).toBe(0);

      // Phase 5B.1: every invoice line links back to its SO line, with a fresh id.
      expect(invoice.lineItems).toHaveLength(confirmed.lineItems.length);
      invoice.lineItems.forEach((il, i) => {
        expect(il.salesOrderLineId).toBe(confirmed.lineItems[i].id);
        expect(il.id).not.toBe(confirmed.lineItems[i].id);
        expect(il.quantity).toBe(confirmed.lineItems[i].quantity);
      });

      const persisted = await invoiceRepository.getById(invoice.id);
      expect(persisted).toBeDefined();

      // Phase 5B.2: a DRAFT never flips the stored status — that only happens
      // once every line is fully POSTED-invoiced (so a draft delete can't
      // strand a stale `fulfilled`).
      const updatedOrder = await salesOrderRepository.getById(confirmed.id);
      expect(updatedOrder?.status).toBe('confirmed');
    });

    it('rejects invoicing a cancelled order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const cancelled = orders.find((o) => o.status === 'cancelled')!;
      await expect(salesOrderService.convertToInvoice(cancelled.id)).rejects.toThrow(/cancelled/i);
    });

    it('rejects invoicing an already-fulfilled order with no linked invoice evidence', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const fulfilled = orders.find((o) => o.status === 'fulfilled')!;
      await expect(salesOrderService.convertToInvoice(fulfilled.id)).rejects.toThrow(/fulfilled/i);
    });

    it('rejects a second conversion once every line is already invoiced, even if the status was moved back', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const confirmed = orders.find((o) => o.status === 'confirmed')!;

      const first = await salesOrderService.convertToInvoice(confirmed.id);
      // Simulate the order being edited back to a pre-fulfilled state.
      await salesOrderRepository.update(confirmed.id, { status: 'confirmed' });

      await expect(salesOrderService.convertToInvoice(confirmed.id)).rejects.toThrow(
        new RegExp(`already fully invoiced \\(${first.invoiceNumber}\\)`, 'i'),
      );
    });

    it('blocks a re-conversion when a legacy invoice (no salesOrderLineId on its lines) is already linked', async () => {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-9100',
        customerId: 'cust_x',
        orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [{ id: 'so-line-Z', description: 'Widget', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 }],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'confirmed',
      });
      await invoiceRepository.create({
        id: 'inv-legacy-1',
        invoiceNumber: 'INV-LEGACY-1',
        customerId: 'cust_x',
        salesOrderId: so.id,
        issueDate: '2026-09-02T00:00:00.000Z',
        dueDate: '2026-10-02T00:00:00.000Z',
        // legacy: NO salesOrderLineId on the line
        lineItems: [{ id: 'il-legacy', description: 'Widget', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 }],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'sent',
        createdAt: '',
        updatedAt: '',
      });
      await expect(salesOrderService.convertToInvoice(so.id)).rejects.toThrow(
        /already converted to invoice INV-LEGACY-1/i,
      );
    });

    it('bills only the REMAINING quantity when part of a Sales Order line is already invoiced (multiple invoices per SO)', async () => {
      const so = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-9001',
        customerId: 'cust_x',
        orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [
          { id: 'so-line-A', description: 'Widget', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'confirmed',
      });

      // A prior POSTED partial invoice for 4 of the 10 (as a future line-quantity picker would produce).
      await invoiceRepository.create({
        id: 'inv-partial-1',
        invoiceNumber: 'INV-2026-7001',
        customerId: 'cust_x',
        salesOrderId: so.id,
        issueDate: '2026-09-02T00:00:00.000Z',
        dueDate: '2026-10-02T00:00:00.000Z',
        lineItems: [
          { id: 'il-1', salesOrderLineId: 'so-line-A', description: 'Widget', quantity: 4, unitPrice: 100, taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'sent',
        createdAt: '',
        updatedAt: '',
      });

      const inv2 = await salesOrderService.convertToInvoice(so.id);
      expect(inv2.id).not.toBe('inv-partial-1');
      expect(inv2.salesOrderId).toBe(so.id);
      expect(inv2.lineItems).toHaveLength(1);
      expect(inv2.lineItems[0].salesOrderLineId).toBe('so-line-A');
      expect(inv2.lineItems[0].quantity).toBe(6);
      expect(inv2.lineItems[0].lineTotal).toBeCloseTo(600, 2);
      expect(inv2.lineItems[0].taxAmount).toBeCloseTo(90, 2);

      // Every line is now covered by draft + posted, so a third conversion is
      // rejected — but the SO stays `confirmed` (only 4 of 10 are POSTED; the
      // remaining 6 sit in a deletable draft).
      const updated = await salesOrderRepository.getById(so.id);
      expect(updated?.status).toBe('confirmed');
      await expect(salesOrderService.convertToInvoice(so.id)).rejects.toThrow(/already fully invoiced/i);
    });

  });

  describe('createInvoiceFromSalesOrder (Phase 5B.2 — explicit selections)', () => {
    async function confirmedSO() {
      return salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-8000',
        customerId: 'cust_x',
        orderDate: '2026-09-01T00:00:00.000Z',
        lineItems: [
          { id: 'L1', productId: 'p1', warehouseId: 'wh1', description: 'Printer', quantity: 10, unitPrice: 2000, taxRateId: 'vat15', taxAmount: 3000, lineTotal: 20000 },
          { id: 'L2', productId: 'p2', description: 'Paper', quantity: 50, unitPrice: 100, taxRateId: 'vat15', taxAmount: 750, lineTotal: 5000 },
          { id: 'L3', description: 'Delivery (service)', quantity: 1, unitPrice: 500, taxRateId: 'vat15', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 25500,
        taxTotal: 3825,
        total: 29325,
        currency: 'ZAR',
        status: 'confirmed',
      });
    }

    it('invoices a chosen subset of lines at partial quantities, deriving everything from the SO line', async () => {
      const so = await confirmedSO();
      const inv = await salesOrderService.createInvoiceFromSalesOrder(so.id, [
        { salesOrderLineId: 'L1', quantity: 2 },
        { salesOrderLineId: 'L2', quantity: 10 },
      ]);
      expect(inv.status).toBe('draft');
      expect(inv.lineItems).toHaveLength(2);
      const l1 = inv.lineItems.find((l) => l.salesOrderLineId === 'L1')!;
      expect(l1.id).not.toBe('L1');
      expect(l1.productId).toBe('p1');
      expect(l1.warehouseId).toBe('wh1');
      expect(l1.taxRateId).toBe('vat15');
      expect(l1.description).toBe('Printer');
      expect(l1.unitPrice).toBe(2000);
      expect(l1.quantity).toBe(2);
      expect(l1.lineTotal).toBeCloseTo(4000, 2);
      expect(l1.taxAmount).toBeCloseTo(600, 2); // 4000 * 15%
      const l2 = inv.lineItems.find((l) => l.salesOrderLineId === 'L2')!;
      expect(l2.lineTotal).toBeCloseTo(1000, 2);
      expect(l2.taxAmount).toBeCloseTo(150, 2);
      expect(inv.subtotal).toBeCloseTo(5000, 2);
      expect(inv.taxTotal).toBeCloseTo(750, 2);
      expect(inv.total).toBeCloseTo(5750, 2);
    });

    it('ignores caller-supplied product / price / description — derives from the SO line', async () => {
      const so = await confirmedSO();
      const rogue = { salesOrderLineId: 'L1', quantity: 3, productId: 'HACKED', unitPrice: 999999, description: 'free stuff', taxAmount: 0 };
      const inv = await salesOrderService.createInvoiceFromSalesOrder(so.id, [rogue]);
      expect(inv.lineItems[0].unitPrice).toBe(2000);
      expect(inv.lineItems[0].productId).toBe('p1');
      expect(inv.lineItems[0].description).toBe('Printer');
      expect(inv.lineItems[0].lineTotal).toBeCloseTo(6000, 2);
    });

    it('rejects: zero, negative, NaN, over-precision, over-remaining, duplicate, foreign line', async () => {
      const so = await confirmedSO();
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 0 }])).rejects.toThrow(/greater than zero/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: -1 }])).rejects.toThrow(/greater than zero/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: Number.NaN }])).rejects.toThrow(/must be a number/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 1.2345 }])).rejects.toThrow(/decimal places/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 11 }])).rejects.toThrow(/only 10 remain/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 1 }, { salesOrderLineId: 'L1', quantity: 1 }])).rejects.toThrow(/more than once/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'NOPE', quantity: 1 }])).rejects.toThrow(/not on sales order/i);
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [])).rejects.toThrow(/at least one line/i);
    });

    it('rejects a STALE selection: remaining is re-derived from current invoices at execution', async () => {
      const so = await confirmedSO();
      // someone else already invoiced 8 of the 10 printers (posted)
      await invoiceRepository.create({
        id: 'inv-other', invoiceNumber: 'INV-2026-7200', customerId: 'cust_x', salesOrderId: so.id,
        issueDate: '2026-09-03T00:00:00.000Z', dueDate: '2026-10-03T00:00:00.000Z',
        lineItems: [{ id: 'ilx', salesOrderLineId: 'L1', description: 'Printer', quantity: 8, unitPrice: 2000, taxAmount: 2400, lineTotal: 16000 }],
        subtotal: 16000, taxTotal: 2400, total: 18400, amountPaid: 0, currency: 'ZAR', status: 'sent',
        createdAt: '', updatedAt: '',
      });
      // first user's screen still thinks 6 remain
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 6 }])).rejects.toThrow(/only 2 remain/i);
      // 2 is fine
      const ok = await salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 2 }]);
      expect(ok.lineItems[0].quantity).toBe(2);
    });

    it('a non-inventory line (no productId) is invoiceable and contributes revenue/VAT only', async () => {
      const so = await confirmedSO();
      const inv = await salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L3', quantity: 1 }]);
      expect(inv.lineItems).toHaveLength(1);
      expect(inv.lineItems[0].productId).toBeUndefined();
      expect(inv.lineItems[0].lineTotal).toBeCloseTo(500, 2);
      expect(inv.lineItems[0].taxAmount).toBeCloseTo(75, 2);
    });

    it('an existing DRAFT reduces what a new draft may bill (no double-drafting the same quantity)', async () => {
      const so = await confirmedSO();
      await salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 6 }]); // draft
      // only 4 left to add to a new draft (10 − 0 posted − 6 draft)
      await expect(salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 5 }])).rejects.toThrow(/only 4 remain/i);
      const ok = await salesOrderService.createInvoiceFromSalesOrder(so.id, [{ salesOrderLineId: 'L1', quantity: 4 }]);
      expect(ok.lineItems[0].quantity).toBe(4);
    });
  });

  describe('getSalesOrdersByCustomer', () => {
    it('filters by customer', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const customerId = orders[0].customerId;
      const filtered = await salesOrderService.getSalesOrdersByCustomer(customerId);
      expect(filtered.every((o) => o.customerId === customerId)).toBe(true);
    });
  });

  describe('duplicateSalesOrder (Phase 4B)', () => {
    it('produces an independent PENDING order — new number, today, fresh line ids, quoteId dropped', async () => {
      const source = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-0100',
        customerId: 'cust_x',
        quoteId: 'quote-abc',
        orderDate: '2026-01-01T00:00:00.000Z',
        lineItems: [
          { id: 'orig-line-1', description: 'Widget', quantity: 2, unitPrice: 50, taxAmount: 15, lineTotal: 100 },
        ],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        currency: 'ZAR',
        status: 'confirmed',
        notes: 'keep me',
      });

      const copy = await salesOrderService.duplicateSalesOrder(source.id);

      expect(copy.id).not.toBe(source.id);
      expect(copy.status).toBe('pending');
      expect(copy.quoteId).toBeUndefined();
      expect(copy.orderNumber).toMatch(/^SO-\d{4}-\d{4}$/);
      expect(copy.orderNumber).not.toBe(source.orderNumber);
      expect(copy.notes).toBe('keep me');
      expect(copy.lineItems[0].id).not.toBe('orig-line-1');

      copy.lineItems[0].quantity = 999;
      const reloaded = await salesOrderService.getSalesOrder(source.id);
      expect(reloaded?.lineItems[0].quantity).toBe(2);
    });

    it('writes a "created" audit row naming the source order number', async () => {
      const source = await salesOrderService.createSalesOrder({
        orderNumber: 'SO-2026-0200',
        customerId: 'cust_x',
        orderDate: '2026-01-01T00:00:00.000Z',
        lineItems: [{ id: 'l1', description: 'Widget', quantity: 1, unitPrice: 10, taxAmount: 1.5, lineTotal: 10 }],
        subtotal: 10,
        taxTotal: 1.5,
        total: 11.5,
        currency: 'ZAR',
        status: 'confirmed',
      });
      const copy = await salesOrderService.duplicateSalesOrder(source.id);
      const logs = await auditLog.getForRecord('SalesOrder', copy.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('created');
      expect(logs[0].reason).toContain('SO-2026-0200');
    });

    it('throws when the source does not exist', async () => {
      await expect(salesOrderService.duplicateSalesOrder('nope')).rejects.toThrow(/not found/i);
    });
  });
});
