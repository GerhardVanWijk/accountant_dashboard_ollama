import { describe, it, expect, beforeEach } from 'vitest';
import { SalesOrderService } from './salesOrderService';
import { MockSalesOrderRepository } from '@/repositories/mock/MockSalesOrderRepository';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { seedSalesOrders } from '@/mock-data/salesOrders';

describe('SalesOrderService', () => {
  let salesOrderService: SalesOrderService;
  let salesOrderRepository: MockSalesOrderRepository;
  let invoiceRepository: MockInvoiceRepository;

  beforeEach(() => {
    salesOrderRepository = new MockSalesOrderRepository();
    invoiceRepository = new MockInvoiceRepository([]);
    salesOrderService = new SalesOrderService(salesOrderRepository, invoiceRepository);
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
  });

  describe('getSalesOrdersByCustomer', () => {
    it('filters by customer', async () => {
      const orders = await salesOrderService.getSalesOrders();
      const customerId = orders[0].customerId;
      const filtered = await salesOrderService.getSalesOrdersByCustomer(customerId);
      expect(filtered.every((o) => o.customerId === customerId)).toBe(true);
    });
  });
});
