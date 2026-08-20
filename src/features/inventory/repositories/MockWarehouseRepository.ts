import type { Warehouse } from '@/types';
import { seedWarehouses } from '@/mock-data/warehouses';
import type { IWarehouseRepository } from './IWarehouseRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `wh_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IWarehouseRepository, mirroring
 * MockCustomerRepository.ts's shape (docs/ARCHITECTURE.md § Repository
 * Pattern).
 */
export class MockWarehouseRepository implements IWarehouseRepository {
  private warehouses: Warehouse[];

  constructor(initialData: Warehouse[] = seedWarehouses) {
    this.warehouses = initialData.map((w) => ({ ...w }));
  }

  async getAll(): Promise<Warehouse[]> {
    return [...this.warehouses];
  }

  async getById(id: string): Promise<Warehouse | undefined> {
    return this.warehouses.find((w) => w.id === id);
  }

  async create(entity: Warehouse): Promise<Warehouse> {
    const record: Warehouse = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.warehouses.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Warehouse>): Promise<Warehouse> {
    const index = this.warehouses.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new Error(`MockWarehouseRepository: warehouse "${id}" not found`);
    }
    const updated: Warehouse = {
      ...this.warehouses[index],
      ...patch,
      id: this.warehouses[index].id,
      updatedAt: nowISO(),
    };
    this.warehouses[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.warehouses = this.warehouses.filter((w) => w.id !== id);
  }
}
