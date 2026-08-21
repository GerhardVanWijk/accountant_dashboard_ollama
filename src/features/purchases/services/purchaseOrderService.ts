import type { PurchaseOrder, Bill } from '@/types';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';

export type CreatePurchaseOrderDTO = Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for purchase orders.
 * Handles PO creation, updates, status changes, and PO to Bill conversion.
 */
export class PurchaseOrderService {
  constructor(private readonly repository: IPurchaseOrderRepository) {}

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return this.repository.getAll();
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    return this.repository.getById(id);
  }

  async createPurchaseOrder(data: CreatePurchaseOrderDTO): Promise<PurchaseOrder> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    return this.repository.update(id, patch);
  }

  /** Permanently removes a draft purchase order. Once sent/received/converted it's a real commitment and must be cancelled instead of deleted. */
  async deletePurchaseOrder(id: string): Promise<void> {
    const po = await this.repository.getById(id);
    if (!po) {
      throw new Error(`Purchase order "${id}" not found`);
    }
    if (po.status !== 'draft') {
      throw new Error(
        `Cannot delete purchase order "${id}": only a draft PO can be deleted (current status: ${po.status}). Cancel it instead.`,
      );
    }
    return this.repository.delete(id);
  }

  /**
   * Sends a purchase order to the supplier.
   * Transitions status from 'draft' to 'sent'.
   */
  async sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
    return this.repository.update(id, { status: 'sent' });
  }

  /**
   * Records receipt of goods for a purchase order.
   * Transitions to 'received' when all items have been received.
   * In a real system, this would update inventory.
   */
  async recordReceipt(id: string): Promise<PurchaseOrder> {
    return this.repository.update(id, { status: 'received' });
    // TODO: Call inventory service to increase stock
    // await inventoryService.recordReceipt(po.lineItems)
  }

  /**
   * Cancels a purchase order.
   */
  async cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
    return this.repository.update(id, { status: 'cancelled' });
  }

  /**
   * Converts a purchase order to a bill.
   * Creates a new Bill record with the same line items and totals.
   * In a real system, this would call billService.createBill().
   * Rejects a PO that's already been converted (`billId` set) — enforced
   * here, not just in the UI, so it can't be bypassed by calling this
   * twice in quick succession.
   */
  async convertToBill(poId: string): Promise<Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>> {
    const po = await this.repository.getById(poId);
    if (!po) {
      throw new Error(`Purchase order "${poId}" not found`);
    }
    if (po.billId) {
      throw new Error(`Purchase order "${poId}" has already been converted to a bill (${po.billId}).`);
    }

    // Generate bill number from PO number
    const billNumber = po.poNumber.replace('PO-', 'BILL-');

    return {
      billNumber,
      supplierId: po.supplierId,
      purchaseOrderId: poId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      lineItems: po.lineItems,
      subtotal: po.subtotal,
      taxTotal: po.taxTotal,
      total: po.total,
      amountPaid: 0,
      currency: po.currency,
      status: 'awaiting_payment',
      notes: `Bill from ${po.poNumber}`,
    };
  }

  /**
   * Get purchase orders by status.
   */
  async getPurchaseOrdersByStatus(status: PurchaseOrder['status']): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.status === status);
  }

  /**
   * Get purchase orders for a specific supplier.
   */
  async getPurchaseOrdersBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.supplierId === supplierId);
  }

  /**
   * Get purchase orders that haven't been invoiced yet.
   */
  async getUninvoicedPurchaseOrders(): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.status !== 'cancelled' && po.status !== 'draft');
  }

  /**
   * Calculate total value of purchase orders by status.
   */
  async calculateOrderValue(status?: PurchaseOrder['status']): Promise<number> {
    let orders = await this.repository.getAll();
    if (status) {
      orders = orders.filter((po) => po.status === status);
    }
    return orders.reduce((sum, po) => sum + po.total, 0);
  }
}
