import type { PayrollTaxYearConfig } from '@/types';
import { seedPayrollTaxConfig } from '@/mock-data/payrollTaxConfig';
import type { IPayrollTaxConfigRepository } from './IPayrollTaxConfigRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `ptc_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IPayrollTaxConfigRepository. */
export class MockPayrollTaxConfigRepository implements IPayrollTaxConfigRepository {
  private configs: PayrollTaxYearConfig[];

  constructor(initialData: PayrollTaxYearConfig[] = seedPayrollTaxConfig) {
    this.configs = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<PayrollTaxYearConfig[]> {
    return [...this.configs];
  }

  async getById(id: string): Promise<PayrollTaxYearConfig | undefined> {
    return this.configs.find((c) => c.id === id);
  }

  async create(entity: PayrollTaxYearConfig): Promise<PayrollTaxYearConfig> {
    const record: PayrollTaxYearConfig = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.configs.push(record);
    return record;
  }

  async update(id: string, patch: Partial<PayrollTaxYearConfig>): Promise<PayrollTaxYearConfig> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockPayrollTaxConfigRepository: config "${id}" not found`);
    }
    const updated: PayrollTaxYearConfig = { ...this.configs[index], ...patch, id: this.configs[index].id, updatedAt: nowISO() };
    this.configs[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs = this.configs.filter((c) => c.id !== id);
  }
}
