import type { AccountingPeriod } from '@/types';
import { seedAccountingPeriods } from '@/mock-data/accountingPeriods';
import type { IAccountingPeriodRepository } from './IAccountingPeriodRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `period_${Math.random().toString(36).slice(2, 10)}`;
}

export class MockAccountingPeriodRepository implements IAccountingPeriodRepository {
  private periods: AccountingPeriod[];

  constructor(initialData: AccountingPeriod[] = seedAccountingPeriods) {
    this.periods = initialData.map((p) => ({ ...p }));
  }

  async getAll(): Promise<AccountingPeriod[]> {
    return [...this.periods];
  }

  async getById(id: string): Promise<AccountingPeriod | undefined> {
    return this.periods.find((p) => p.id === id);
  }

  async create(entity: AccountingPeriod): Promise<AccountingPeriod> {
    const record: AccountingPeriod = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.periods.push(record);
    return record;
  }

  async update(id: string, patch: Partial<AccountingPeriod>): Promise<AccountingPeriod> {
    const index = this.periods.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`MockAccountingPeriodRepository: accounting period "${id}" not found`);
    }
    const updated: AccountingPeriod = {
      ...this.periods[index],
      ...patch,
      id: this.periods[index].id,
      updatedAt: nowISO(),
    };
    this.periods[index] = updated;
    return updated;
  }
}
