import type { ProductCategory } from '@/types';
import { seedProductCategories } from '@/mock-data/productCategories';
import type { IProductCategoryRepository } from './IProductCategoryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `pcat_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IProductCategoryRepository, mirroring
 * MockWarehouseRepository.ts's shape (docs/ARCHITECTURE.md § Repository
 * Pattern). Defaults to `seedProductCategories` (empty — the real categories
 * come from the migration 0024 seed against live data, not from a fixture).
 */
export class MockProductCategoryRepository implements IProductCategoryRepository {
  private categories: ProductCategory[];

  constructor(initialData: ProductCategory[] = seedProductCategories) {
    this.categories = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<ProductCategory[]> {
    return [...this.categories];
  }

  async getById(id: string): Promise<ProductCategory | undefined> {
    return this.categories.find((c) => c.id === id);
  }

  async create(entity: ProductCategory): Promise<ProductCategory> {
    const record: ProductCategory = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.categories.push(record);
    return record;
  }

  async update(id: string, patch: Partial<ProductCategory>): Promise<ProductCategory> {
    const index = this.categories.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockProductCategoryRepository: category "${id}" not found`);
    }
    const updated: ProductCategory = {
      ...this.categories[index],
      ...patch,
      id: this.categories[index].id,
      updatedAt: nowISO(),
    };
    this.categories[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.categories = this.categories.filter((c) => c.id !== id);
  }
}
