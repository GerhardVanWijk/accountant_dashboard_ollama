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
  });

  describe('convertToInvoice', () => {
    it('creates a draft invoice carrying over totals and salesOrderId, and fulfills the order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const confirmed = orders.find((o) => o.status === 'confirmed')!;

      const invoice = await salesOrderService.convertToInvoice(confirmed.id);

      expect(invoice.id).toBeDefined();
      expect(invoice.salesOrderId).toBe(confirmed.id);
      expect(invoice.customerId).toBe(confirmed.customerId);
      expect(invoice.total).toBe(confirmed.total);
      expect(invoice.status).toBe('draft');
      expect(invoice.amountPaid).toBe(0);

      const persisted = await invoiceRepository.getById(invoice.id);
      expect(persisted).toBeDefined();

      const updatedOrder = await salesOrderRepository.getById(confirmed.id);
      expect(updatedOrder?.status).toBe('fulfilled');
    });

    it('rejects invoicing a cancelled order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const cancelled = orders.find((o) => o.status === 'cancelled')!;
      await expect(salesOrderService.convertToInvoice(cancelled.id)).rejects.toThrow(/cancelled/i);
    });

    it('rejects invoicing an already-fulfilled order', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const fulfilled = orders.find((o) => o.status === 'fulfilled')!;
      await expect(salesOrderService.convertToInvoice(fulfilled.id)).rejects.toThrow(/fulfilled/i);
    });

    it('rejects a second conversion even if the order status was moved back off "fulfilled"', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const confirmed = orders.find((o) => o.status === 'confirmed')!;

      const first = await salesOrderService.convertToInvoice(confirmed.id);
      // Simulate the order being edited back to a pre-fulfilled state.
      await salesOrderRepository.update(confirmed.id, { status: 'confirmed' });

      await expect(salesOrderService.convertToInvoice(confirmed.id)).rejects.toThrow(
        new RegExp(`already converted to invoice ${first.invoiceNumber}`, 'i'),
      );
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
