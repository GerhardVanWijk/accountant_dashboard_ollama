import type { SalesOrder } from '@/types';
import { seedSalesOrders } from '@/mock-data/salesOrders';
import type { ISalesOrderRepository } from '../ISalesOrderRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `so_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ISalesOrderRepository.
 * Stores sales orders in memory with CRUD operations following the repository pattern.
 */
export class MockSalesOrderRepository implements ISalesOrderRepository {
  private salesOrders: SalesOrder[];

  constructor(initialData: SalesOrder[] = seedSalesOrders) {
    // Copy so mutations never leak into the shared seed array.
    this.salesOrders = initialData.map((so) => ({ ...so }));
  }

  async getAll(): Promise<SalesOrder[]> {
    return [...this.salesOrders];
  }

  async getById(id: string): Promise<SalesOrder | undefined> {
    return this.salesOrders.find((so) => so.id === id);
  }

  async create(entity: SalesOrder): Promise<SalesOrder> {
    const record: SalesOrder = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.salesOrders.push(record);
    return record;
  }

  async update(id: string, patch: Partial<SalesOrder>): Promise<SalesOrder> {
    const index = this.salesOrders.findIndex((so) => so.id === id);
    if (index === -1) {
      throw new Error(`MockSalesOrderRepository: sales order "${id}" not found`);
    }
    const updated: SalesOrder = {
      ...this.salesOrders[index],
      ...patch,
      id: this.salesOrders[index].id,
      updatedAt: nowISO(),
    };
    this.salesOrders[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.salesOrders = this.salesOrders.filter((so) => so.id !== id);
  }
}
