import type { CgtAnnualExclusionConfig } from '@/types';
import { seedCgtAnnualExclusionConfigs } from '@/mock-data/capitalGainsTaxConfig';
import type { ICgtAnnualExclusionConfigRepository } from './ICgtAnnualExclusionConfigRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `cgt_excl_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of ICgtAnnualExclusionConfigRepository. */
export class MockCgtAnnualExclusionConfigRepository implements ICgtAnnualExclusionConfigRepository {
  private configs: CgtAnnualExclusionConfig[];

  constructor(initialData: CgtAnnualExclusionConfig[] = seedCgtAnnualExclusionConfigs) {
    this.configs = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<CgtAnnualExclusionConfig[]> {
    return [...this.configs];
  }

  async getById(id: string): Promise<CgtAnnualExclusionConfig | undefined> {
    return this.configs.find((c) => c.id === id);
  }

  async create(entity: CgtAnnualExclusionConfig): Promise<CgtAnnualExclusionConfig> {
    const record: CgtAnnualExclusionConfig = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.configs.push(record);
    return record;
  }

  async update(id: string, patch: Partial<CgtAnnualExclusionConfig>): Promise<CgtAnnualExclusionConfig> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockCgtAnnualExclusionConfigRepository: config "${id}" not found`);
    }
    const updated: CgtAnnualExclusionConfig = { ...this.configs[index], ...patch, id: this.configs[index].id, updatedAt: nowISO() };
    this.configs[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs = this.configs.filter((c) => c.id !== id);
  }
}
