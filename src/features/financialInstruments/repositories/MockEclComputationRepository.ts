import type { EclComputation, ID } from '@/types';
import type { IEclComputationRepository } from './IEclComputationRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `ecl_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IEclComputationRepository, mirrors MockDeferredTaxComputationRepository. No seed data — same "run the real lifecycle through the UI" discipline as every other computation repository in this codebase. */
export class MockEclComputationRepository implements IEclComputationRepository {
  private computations: EclComputation[] = [];

  async getAll(): Promise<EclComputation[]> {
    return this.computations.map((c) => ({ ...c, buckets: c.buckets.map((b) => ({ ...b })) }));
  }

  async getById(id: ID): Promise<EclComputation | undefined> {
    const found = this.computations.find((c) => c.id === id);
    return found ? { ...found, buckets: found.buckets.map((b) => ({ ...b })) } : undefined;
  }

  async getByFinancialYear(financialYearId: ID): Promise<EclComputation | undefined> {
    const found = this.computations.find((c) => c.financialYearId === financialYearId);
    return found ? { ...found, buckets: found.buckets.map((b) => ({ ...b })) } : undefined;
  }

  async getByCompany(companyId: ID): Promise<EclComputation[]> {
    return this.computations.filter((c) => c.companyId === companyId).map((c) => ({ ...c, buckets: c.buckets.map((b) => ({ ...b })) }));
  }

  async create(entity: EclComputation): Promise<EclComputation> {
    const record: EclComputation = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.computations.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<EclComputation>): Promise<EclComputation> {
    const index = this.computations.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockEclComputationRepository: computation "${id}" not found`);
    }
    const updated: EclComputation = { ...this.computations[index], ...patch, id: this.computations[index].id, updatedAt: nowISO() };
    this.computations[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.computations = this.computations.filter((c) => c.id !== id);
  }
}
