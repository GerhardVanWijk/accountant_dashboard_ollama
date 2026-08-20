import type { Customer } from '@/types';
import { seedCustomers } from '@/mock-data/customers';
import type { ICustomerRepository } from '../ICustomerRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `cust_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ICustomerRepository. This is the reference
 * example proving the repository pattern (ADR 001) — other feature bees
 * follow this shape when adding Mock[Feature]Repository classes under
 * src/features/[feature]/repositories/.
 */
export class MockCustomerRepository implements ICustomerRepository {
  private customers: Customer[];

  constructor(initialData: Customer[] = seedCustomers) {
    // Copy so mutations never leak into the shared seed array.
    this.customers = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<Customer[]> {
    return [...this.customers];
  }

  async getById(id: string): Promise<Customer | undefined> {
    return this.customers.find((c) => c.id === id);
  }

  async create(entity: Customer): Promise<Customer> {
    const record: Customer = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.customers.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Customer>): Promise<Customer> {
    const index = this.customers.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockCustomerRepository: customer "${id}" not found`);
    }
    const updated: Customer = {
      ...this.customers[index],
      ...patch,
      id: this.customers[index].id,
      updatedAt: nowISO(),
    };
    this.customers[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.customers = this.customers.filter((c) => c.id !== id);
  }
}
