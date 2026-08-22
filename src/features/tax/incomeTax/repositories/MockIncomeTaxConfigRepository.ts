import type { IncomeTaxYearConfig } from '@/types';
import { seedIncomeTaxConfig } from '@/mock-data/corporateTaxConfig';
import type { IIncomeTaxConfigRepository } from './IIncomeTaxConfigRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `itc_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IIncomeTaxConfigRepository, mirrors MockPayrollTaxConfigRepository. */
export class MockIncomeTaxConfigRepository implements IIncomeTaxConfigRepository {
  private configs: IncomeTaxYearConfig[];

  constructor(initialData: IncomeTaxYearConfig[] = seedIncomeTaxConfig) {
    this.configs = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<IncomeTaxYearConfig[]> {
    return [...this.configs];
  }

  async getById(id: string): Promise<IncomeTaxYearConfig | undefined> {
    return this.configs.find((c) => c.id === id);
  }

  async create(entity: IncomeTaxYearConfig): Promise<IncomeTaxYearConfig> {
    const record: IncomeTaxYearConfig = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.configs.push(record);
    return record;
  }

  async update(id: string, patch: Partial<IncomeTaxYearConfig>): Promise<IncomeTaxYearConfig> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockIncomeTaxConfigRepository: config "${id}" not found`);
    }
    const updated: IncomeTaxYearConfig = { ...this.configs[index], ...patch, id: this.configs[index].id, updatedAt: nowISO() };
    this.configs[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs = this.configs.filter((c) => c.id !== id);
  }
}
