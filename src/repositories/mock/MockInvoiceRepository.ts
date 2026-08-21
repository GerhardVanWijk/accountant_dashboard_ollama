import type { Invoice } from '@/types';
import { seedInvoices } from '@/mock-data/invoices';
import type { IInvoiceRepository } from '../IInvoiceRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `inv_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IInvoiceRepository.
 * Stores invoices in memory with CRUD operations following the repository pattern.
 */
export class MockInvoiceRepository implements IInvoiceRepository {
  private invoices: Invoice[];

  constructor(initialData: Invoice[] = seedInvoices) {
    // Copy so mutations never leak into the shared seed array.
    this.invoices = initialData.map((inv) => ({ ...inv }));
  }

  async getAll(): Promise<Invoice[]> {
    return [...this.invoices];
  }

  async getById(id: string): Promise<Invoice | undefined> {
    return this.invoices.find((inv) => inv.id === id);
  }

  async create(entity: Invoice): Promise<Invoice> {
    const record: Invoice = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.invoices.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const index = this.invoices.findIndex((inv) => inv.id === id);
    if (index === -1) {
      throw new Error(`MockInvoiceRepository: invoice "${id}" not found`);
    }
    const updated: Invoice = {
      ...this.invoices[index],
      ...patch,
      id: this.invoices[index].id,
      updatedAt: nowISO(),
    };
    this.invoices[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.invoices = this.invoices.filter((inv) => inv.id !== id);
  }
}
