import type { PurchaseOrder } from '@/types';
import { seedPurchaseOrders } from '@/mock-data/purchaseOrders';
import type { IPurchaseOrderRepository } from '../IPurchaseOrderRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `po_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IPurchaseOrderRepository.
 * Provides full CRUD operations for purchase orders.
 */
export class MockPurchaseOrderRepository implements IPurchaseOrderRepository {
  private purchaseOrders: PurchaseOrder[];

  constructor(initialData: PurchaseOrder[] = seedPurchaseOrders) {
    // Copy so mutations never leak into the shared seed array.
    this.purchaseOrders = initialData.map((po) => ({ ...po }));
  }

  async getAll(): Promise<PurchaseOrder[]> {
    return [...this.purchaseOrders];
  }

  async getById(id: string): Promise<PurchaseOrder | undefined> {
    return this.purchaseOrders.find((po) => po.id === id);
  }

  async create(entity: PurchaseOrder): Promise<PurchaseOrder> {
    const record: PurchaseOrder = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.purchaseOrders.push(record);
    return record;
  }

  async update(id: string, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const index = this.purchaseOrders.findIndex((po) => po.id === id);
    if (index === -1) {
      throw new Error(`MockPurchaseOrderRepository: purchase order "${id}" not found`);
    }
    const updated: PurchaseOrder = {
      ...this.purchaseOrders[index],
      ...patch,
      id: this.purchaseOrders[index].id,
      updatedAt: nowISO(),
    };
    this.purchaseOrders[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.purchaseOrders = this.purchaseOrders.filter((po) => po.id !== id);
  }
}
