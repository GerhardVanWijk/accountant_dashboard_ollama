import type { DeferredTaxComputation, ID } from '@/types';
import type { IDeferredTaxComputationRepository } from './IDeferredTaxComputationRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `dtx_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IDeferredTaxComputationRepository, mirrors MockTaxComputationRepository. No seed data — same "run the real lifecycle through the UI, don't fabricate posted history" discipline as seedFixedAssets.ts/seedEmployees.ts. */
export class MockDeferredTaxComputationRepository implements IDeferredTaxComputationRepository {
  private computations: DeferredTaxComputation[] = [];

  async getAll(): Promise<DeferredTaxComputation[]> {
    return this.computations.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
  }

  async getById(id: ID): Promise<DeferredTaxComputation | undefined> {
    const found = this.computations.find((c) => c.id === id);
    return found ? { ...found, items: found.items.map((i) => ({ ...i })) } : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<DeferredTaxComputation | undefined> {
    const found = this.computations.find((c) => c.financialYearId === financialYearId);
    return found ? { ...found, items: found.items.map((i) => ({ ...i })) } : undefined;
  }

  async getByCompany(companyId: ID): Promise<DeferredTaxComputation[]> {
    return this.computations.filter((c) => c.companyId === companyId).map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
  }

  async create(entity: DeferredTaxComputation): Promise<DeferredTaxComputation> {
    const record: DeferredTaxComputation = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.computations.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<DeferredTaxComputation>): Promise<DeferredTaxComputation> {
    const index = this.computations.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockDeferredTaxComputationRepository: computation "${id}" not found`);
    }
    const updated: DeferredTaxComputation = { ...this.computations[index], ...patch, id: this.computations[index].id, updatedAt: nowISO() };
    this.computations[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.computations = this.computations.filter((c) => c.id !== id);
  }
}
