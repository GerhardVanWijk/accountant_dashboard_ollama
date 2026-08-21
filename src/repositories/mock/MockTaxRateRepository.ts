import type { TaxRate } from '@/types';
import { seedTaxRates } from '@/mock-data/taxRates';
import type { ITaxRateRepository } from '../ITaxRateRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `tax_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of ITaxRateRepository, per ADR 001. */
export class MockTaxRateRepository implements ITaxRateRepository {
  private taxRates: TaxRate[];

  constructor(initialData: TaxRate[] = seedTaxRates) {
    this.taxRates = initialData.map((t) => ({ ...t }));
  }

  async getAll(): Promise<TaxRate[]> {
    return this.taxRates.map((t) => ({ ...t }));
  }

  async getById(id: string): Promise<TaxRate | undefined> {
    const found = this.taxRates.find((t) => t.id === id);
    return found ? { ...found } : undefined;
  }

  async create(entity: TaxRate): Promise<TaxRate> {
    const now = nowISO();
    const created: TaxRate = { ...entity, id: entity.id || generateId(), createdAt: now, updatedAt: now };
    this.taxRates.push(created);
    return { ...created };
  }

  async update(id: string, patch: Partial<TaxRate>): Promise<TaxRate> {
    const index = this.taxRates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`TaxRate "${id}" not found`);
    }
    const updated: TaxRate = { ...this.taxRates[index], ...patch, id, updatedAt: nowISO() };
    this.taxRates[index] = updated;
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    const index = this.taxRates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`TaxRate "${id}" not found`);
    }
    this.taxRates.splice(index, 1);
  }
}
