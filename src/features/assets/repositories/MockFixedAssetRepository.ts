import type { FixedAsset } from '@/types';
import { seedFixedAssets } from '@/mock-data/fixedAssets';
import type { IFixedAssetRepository } from './IFixedAssetRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `fa_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IFixedAssetRepository, mirroring
 * MockProductRepository.ts's shape.
 */
export class MockFixedAssetRepository implements IFixedAssetRepository {
  private assets: FixedAsset[];

  constructor(initialData: FixedAsset[] = seedFixedAssets) {
    this.assets = initialData.map((a) => ({ ...a }));
  }

  async getAll(): Promise<FixedAsset[]> {
    return [...this.assets];
  }

  async getById(id: string): Promise<FixedAsset | undefined> {
    return this.assets.find((a) => a.id === id);
  }

  async create(entity: FixedAsset): Promise<FixedAsset> {
    const record: FixedAsset = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.assets.push(record);
    return record;
  }

  async update(id: string, patch: Partial<FixedAsset>): Promise<FixedAsset> {
    const index = this.assets.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error(`MockFixedAssetRepository: asset "${id}" not found`);
    }
    const updated: FixedAsset = {
      ...this.assets[index],
      ...patch,
      id: this.assets[index].id,
      updatedAt: nowISO(),
    };
    this.assets[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.assets = this.assets.filter((a) => a.id !== id);
  }
}
