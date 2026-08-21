import type { Invoice, SalesOrder } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';

export type CreateSalesOrderDTO = Omit<SalesOrder, 'id' | 'createdAt' | 'updatedAt'>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Business-logic layer for Sales Orders. Sales Orders are pre-accounting
 * commitment documents (same treatment as Purchase Orders on the other
 * side) — NO journal entry is ever posted for a Sales Order, see
 * docs/LEDGER_ARCHITECTURE.md.
 */
export class SalesOrderService {
  constructor(
    private readonly repository: ISalesOrderRepository,
    private readonly invoiceRepository: IInvoiceRepository,
  ) {}

  async getSalesOrders(): Promise<SalesOrder[]> {
    return this.repository.getAll();
  }

  async getSalesOrder(id: string): Promise<SalesOrder | undefined> {
    return this.repository.getById(id);
  }

  async createSalesOrder(data: CreateSalesOrderDTO): Promise<SalesOrder> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateSalesOrder(id: string, patch: Partial<SalesOrder>): Promise<SalesOrder> {
    return this.repository.update(id, patch);
  }

  /** Permanently removes a pending sales order (there is no earlier 'draft' state — see class doc). Once confirmed/fulfilled it's a real business commitment and must be cancelled instead of deleted. */
  async deleteSalesOrder(id: string): Promise<void> {
    const order = await this.requireOrder(id);
    if (order.status !== 'pending') {
      throw new Error(
        `Cannot delete sales order "${id}": only a pending order can be deleted (current status: ${order.status}). Cancel it instead.`,
      );
    }
    return this.repository.delete(id);
  }

  /** Confirms a pending sales order with the customer. Transitions 'pending' -> 'confirmed'. */
  async confirmOrder(id: string): Promise<SalesOrder> {
    const order = await this.requireOrder(id);
    if (order.status !== 'pending') {
      throw new Error(
        `Cannot confirm sales order "${id}": only a pending order can be confirmed (current status: ${order.status}).`,
      );
    }
    return this.repository.update(id, { status: 'confirmed' });
  }

  /** Cancels a sales order. */
  async cancelOrder(id: string): Promise<SalesOrder> {
    const order = await this.requireOrder(id);
    if (order.status === 'fulfilled') {
      throw new Error(`Cannot cancel sales order "${id}": it has already been fulfilled.`);
    }
    return this.repository.update(id, { status: 'cancelled' });
  }

  /**
   * Converts a Sales Order into a new draft Invoice, carrying over the
   * customer, line items, and totals, and setting
   * `invoice.salesOrderId = salesOrder.id`. No GL posting happens here —
   * the invoice stays 'draft' until InvoiceService.postInvoice() is called
   * from the Invoices module. Marks the order 'fulfilled' since converting
   * to an invoice is this app's definition of an order being fulfilled
   * (there is no separate goods-receipt/dispatch step modeled yet).
   */
  async convertToInvoice(orderId: string): Promise<Invoice> {
    const order = await this.requireOrder(orderId);
    if (order.status === 'cancelled') {
      throw new Error(`Cannot invoice sales order "${orderId}": it has been cancelled.`);
    }
    if (order.status === 'fulfilled') {
      throw new Error(`Cannot invoice sales order "${orderId}": it has already been fulfilled.`);
    }

    const invoiceNumber = order.orderNumber.startsWith('SO-')
      ? order.orderNumber.replace('SO-', 'INV-')
      : `INV-${Date.now()}`;
    const now = new Date();
    const dueDate = new Date(now.getTime() + THIRTY_DAYS_MS);

    const invoice = await this.invoiceRepository.create({
      id: '',
      invoiceNumber,
      customerId: order.customerId,
      salesOrderId: order.id,
      issueDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      lineItems: order.lineItems,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      total: order.total,
      amountPaid: 0,
      currency: order.currency,
      status: 'draft',
      notes: `Invoiced from ${order.orderNumber}`,
      createdAt: '',
      updatedAt: '',
    });

    await this.repository.update(orderId, { status: 'fulfilled' });

    return invoice;
  }

  /** Get sales orders for a specific customer. */
  async getSalesOrdersByCustomer(customerId: string): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((so) => so.customerId === customerId);
  }

  /** Get sales orders filtered by status. */
  async getSalesOrdersByStatus(status: SalesOrder['status']): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((so) => so.status === status);
  }

  /** Search sales orders by order number or customer ID. */
  async searchSalesOrders(query: string): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (so) =>
        so.orderNumber.toLowerCase().includes(lowerQuery) || so.customerId.toLowerCase().includes(lowerQuery),
    );
  }

  private async requireOrder(id: string): Promise<SalesOrder> {
    const order = await this.repository.getById(id);
    if (!order) {
      throw new Error(`Sales order "${id}" not found`);
    }
    return order;
  }
}
