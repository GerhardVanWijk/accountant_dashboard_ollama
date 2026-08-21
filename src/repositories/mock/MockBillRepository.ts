import type { Bill } from '@/types';
import { seedBills } from '@/mock-data/bills';
import type { IBillRepository } from '../IBillRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `bill_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IBillRepository.
 * Provides full CRUD operations for supplier bills.
 */
export class MockBillRepository implements IBillRepository {
  private bills: Bill[];

  constructor(initialData: Bill[] = seedBills) {
    // Copy so mutations never leak into the shared seed array.
    this.bills = initialData.map((b) => ({ ...b }));
  }

  async getAll(): Promise<Bill[]> {
    return [...this.bills];
  }

  async getById(id: string): Promise<Bill | undefined> {
    return this.bills.find((b) => b.id === id);
  }

  async create(entity: Bill): Promise<Bill> {
    const record: Bill = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.bills.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Bill>): Promise<Bill> {
    const index = this.bills.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error(`MockBillRepository: bill "${id}" not found`);
    }
    const updated: Bill = {
      ...this.bills[index],
      ...patch,
      id: this.bills[index].id,
      updatedAt: nowISO(),
    };
    this.bills[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.bills = this.bills.filter((b) => b.id !== id);
  }
}
