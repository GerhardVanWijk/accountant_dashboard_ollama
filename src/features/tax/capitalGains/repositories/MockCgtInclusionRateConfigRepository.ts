import type { CgtInclusionRateConfig } from '@/types';
import { seedCgtInclusionRateConfigs } from '@/mock-data/capitalGainsTaxConfig';
import type { ICgtInclusionRateConfigRepository } from './ICgtInclusionRateConfigRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `cgt_incl_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of ICgtInclusionRateConfigRepository. */
export class MockCgtInclusionRateConfigRepository implements ICgtInclusionRateConfigRepository {
  private configs: CgtInclusionRateConfig[];

  constructor(initialData: CgtInclusionRateConfig[] = seedCgtInclusionRateConfigs) {
    this.configs = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<CgtInclusionRateConfig[]> {
    return [...this.configs];
  }

  async getById(id: string): Promise<CgtInclusionRateConfig | undefined> {
    return this.configs.find((c) => c.id === id);
  }

  async create(entity: CgtInclusionRateConfig): Promise<CgtInclusionRateConfig> {
    const record: CgtInclusionRateConfig = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.configs.push(record);
    return record;
  }

  async update(id: string, patch: Partial<CgtInclusionRateConfig>): Promise<CgtInclusionRateConfig> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockCgtInclusionRateConfigRepository: config "${id}" not found`);
    }
    const updated: CgtInclusionRateConfig = { ...this.configs[index], ...patch, id: this.configs[index].id, updatedAt: nowISO() };
    this.configs[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs = this.configs.filter((c) => c.id !== id);
  }
}
