import type { ID, TaxComputation } from '@/types';
import type { ITaxComputationRepository } from './ITaxComputationRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `txc_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of ITaxComputationRepository. */
export class MockTaxComputationRepository implements ITaxComputationRepository {
  private computations: TaxComputation[];

  constructor(initialData: TaxComputation[] = []) {
    this.computations = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<TaxComputation[]> {
    return [...this.computations];
  }

  async getById(id: ID): Promise<TaxComputation | undefined> {
    return this.computations.find((c) => c.id === id);
  }

  async getByFinancialYear(financialYearId: ID): Promise<TaxComputation | undefined> {
    return this.computations.find((c) => c.financialYearId === financialYearId);
  }

  async create(entity: TaxComputation): Promise<TaxComputation> {
    const record: TaxComputation = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.computations.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<TaxComputation>): Promise<TaxComputation> {
    const index = this.computations.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockTaxComputationRepository: computation "${id}" not found`);
    }
    const updated: TaxComputation = { ...this.computations[index], ...patch, id: this.computations[index].id, updatedAt: nowISO() };
    this.computations[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.computations = this.computations.filter((c) => c.id !== id);
  }
}
