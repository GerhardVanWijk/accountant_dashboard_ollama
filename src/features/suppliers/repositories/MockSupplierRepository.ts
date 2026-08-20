import type { Supplier } from '@/types';
import { seedSuppliers } from '@/mock-data/suppliers';
import type { ISupplierRepository } from './ISupplierRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `sup_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ISupplierRepository. Mirrors
 * src/repositories/mock/MockCustomerRepository.ts's shape (Phase 0's
 * reference-pattern proof) but lives feature-local per the documented
 * convention — see MockCustomerRepository.ts's docstring.
 */
export class MockSupplierRepository implements ISupplierRepository {
  private suppliers: Supplier[];

  constructor(initialData: Supplier[] = seedSuppliers) {
    // Copy so mutations never leak into the shared seed array.
    this.suppliers = initialData.map((s) => ({ ...s }));
  }

  async getAll(): Promise<Supplier[]> {
    return [...this.suppliers];
  }

  async getById(id: string): Promise<Supplier | undefined> {
    return this.suppliers.find((s) => s.id === id);
  }

  async create(entity: Supplier): Promise<Supplier> {
    const record: Supplier = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.suppliers.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Supplier>): Promise<Supplier> {
    const index = this.suppliers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`MockSupplierRepository: supplier "${id}" not found`);
    }
    const updated: Supplier = {
      ...this.suppliers[index],
      ...patch,
      id: this.suppliers[index].id,
      updatedAt: nowISO(),
    };
    this.suppliers[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
  }
}
