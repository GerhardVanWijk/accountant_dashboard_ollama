import type { DividendsWithholdingTaxRateConfig } from '@/types';
import { seedDividendsWithholdingTaxConfig } from '@/mock-data/dividendsTaxConfig';
import type { IDividendsWithholdingTaxConfigRepository } from './IDividendsWithholdingTaxConfigRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `dwtc_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IDividendsWithholdingTaxConfigRepository, mirroring MockPayrollTaxConfigRepository.ts's shape. */
export class MockDividendsWithholdingTaxConfigRepository implements IDividendsWithholdingTaxConfigRepository {
  private configs: DividendsWithholdingTaxRateConfig[];

  constructor(initialData: DividendsWithholdingTaxRateConfig[] = seedDividendsWithholdingTaxConfig) {
    this.configs = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<DividendsWithholdingTaxRateConfig[]> {
    return [...this.configs];
  }

  async getById(id: string): Promise<DividendsWithholdingTaxRateConfig | undefined> {
    return this.configs.find((c) => c.id === id);
  }

  async create(entity: DividendsWithholdingTaxRateConfig): Promise<DividendsWithholdingTaxRateConfig> {
    const record: DividendsWithholdingTaxRateConfig = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.configs.push(record);
    return record;
  }

  async update(id: string, patch: Partial<DividendsWithholdingTaxRateConfig>): Promise<DividendsWithholdingTaxRateConfig> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockDividendsWithholdingTaxConfigRepository: config "${id}" not found`);
    }
    const updated: DividendsWithholdingTaxRateConfig = { ...this.configs[index], ...patch, id: this.configs[index].id, updatedAt: nowISO() };
    this.configs[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs = this.configs.filter((c) => c.id !== id);
  }
}
