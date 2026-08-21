import type { FinancialYear } from '@/types';
import { seedFinancialYears } from '@/mock-data/financialYears';
import type { IFinancialYearRepository } from './IFinancialYearRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `fy_${Math.random().toString(36).slice(2, 10)}`;
}

export class MockFinancialYearRepository implements IFinancialYearRepository {
  private years: FinancialYear[];

  constructor(initialData: FinancialYear[] = seedFinancialYears) {
    this.years = initialData.map((y) => ({ ...y }));
  }

  async getAll(): Promise<FinancialYear[]> {
    return [...this.years];
  }

  async getById(id: string): Promise<FinancialYear | undefined> {
    return this.years.find((y) => y.id === id);
  }

  async create(entity: FinancialYear): Promise<FinancialYear> {
    const record: FinancialYear = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.years.push(record);
    return record;
  }

  async update(id: string, patch: Partial<FinancialYear>): Promise<FinancialYear> {
    const index = this.years.findIndex((y) => y.id === id);
    if (index === -1) {
      throw new Error(`MockFinancialYearRepository: financial year "${id}" not found`);
    }
    const updated: FinancialYear = {
      ...this.years[index],
      ...patch,
      id: this.years[index].id,
      updatedAt: nowISO(),
    };
    this.years[index] = updated;
    return updated;
  }
}
