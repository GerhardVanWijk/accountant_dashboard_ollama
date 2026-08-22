import type { ID } from '@/types';
import type { ProvisionalTaxPeriod } from '@/types/provisionalTax';
import type { IProvisionalTaxPeriodRepository } from './IProvisionalTaxPeriodRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `ptp_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IProvisionalTaxPeriodRepository — mirrors MockTaxComputationRepository exactly. */
export class MockProvisionalTaxPeriodRepository implements IProvisionalTaxPeriodRepository {
  private periods: ProvisionalTaxPeriod[];

  constructor(initialData: ProvisionalTaxPeriod[] = []) {
    this.periods = initialData.map((p) => ({ ...p }));
  }

  async getAll(): Promise<ProvisionalTaxPeriod[]> {
    return [...this.periods];
  }

  async getById(id: ID): Promise<ProvisionalTaxPeriod | undefined> {
    return this.periods.find((p) => p.id === id);
  }

  async getByFinancialYear(financialYearId: ID): Promise<ProvisionalTaxPeriod | undefined> {
    return this.periods.find((p) => p.financialYearId === financialYearId);
  }

  async create(entity: ProvisionalTaxPeriod): Promise<ProvisionalTaxPeriod> {
    const record: ProvisionalTaxPeriod = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.periods.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<ProvisionalTaxPeriod>): Promise<ProvisionalTaxPeriod> {
    const index = this.periods.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`MockProvisionalTaxPeriodRepository: period "${id}" not found`);
    }
    const updated: ProvisionalTaxPeriod = { ...this.periods[index], ...patch, id: this.periods[index].id, updatedAt: nowISO() };
    this.periods[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.periods = this.periods.filter((p) => p.id !== id);
  }
}
