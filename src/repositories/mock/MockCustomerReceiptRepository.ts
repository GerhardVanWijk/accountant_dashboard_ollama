import type { CustomerReceipt } from '@/types';
import { seedCustomerReceipts } from '@/mock-data/customerReceipts';
import type { ICustomerReceiptRepository } from '../ICustomerReceiptRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `rcpt_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ICustomerReceiptRepository.
 * Stores customer receipts in memory with CRUD operations following the repository pattern.
 */
export class MockCustomerReceiptRepository implements ICustomerReceiptRepository {
  private receipts: CustomerReceipt[];

  constructor(initialData: CustomerReceipt[] = seedCustomerReceipts) {
    // Copy so mutations never leak into the shared seed array.
    this.receipts = initialData.map((r) => ({ ...r }));
  }

  async getAll(): Promise<CustomerReceipt[]> {
    return [...this.receipts];
  }

  async getById(id: string): Promise<CustomerReceipt | undefined> {
    return this.receipts.find((r) => r.id === id);
  }

  async create(entity: CustomerReceipt): Promise<CustomerReceipt> {
    const record: CustomerReceipt = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.receipts.push(record);
    return record;
  }

  async update(id: string, patch: Partial<CustomerReceipt>): Promise<CustomerReceipt> {
    const index = this.receipts.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`MockCustomerReceiptRepository: receipt "${id}" not found`);
    }
    const updated: CustomerReceipt = {
      ...this.receipts[index],
      ...patch,
      id: this.receipts[index].id,
      updatedAt: nowISO(),
    };
    this.receipts[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.receipts = this.receipts.filter((r) => r.id !== id);
  }
}
