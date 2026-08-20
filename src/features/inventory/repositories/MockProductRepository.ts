import type { Product } from '@/types';
import { seedProducts } from '@/mock-data/products';
import type { IProductRepository } from './IProductRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `prod_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IProductRepository, mirroring
 * MockCustomerRepository.ts's shape (docs/ARCHITECTURE.md § Repository
 * Pattern).
 */
export class MockProductRepository implements IProductRepository {
  private products: Product[];

  constructor(initialData: Product[] = seedProducts) {
    // Copy so mutations never leak into the shared seed array.
    this.products = initialData.map((p) => ({ ...p }));
  }

  async getAll(): Promise<Product[]> {
    return [...this.products];
  }

  async getById(id: string): Promise<Product | undefined> {
    return this.products.find((p) => p.id === id);
  }

  async create(entity: Product): Promise<Product> {
    const record: Product = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.products.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Product>): Promise<Product> {
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`MockProductRepository: product "${id}" not found`);
    }
    const updated: Product = {
      ...this.products[index],
      ...patch,
      id: this.products[index].id,
      updatedAt: nowISO(),
    };
    this.products[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.products = this.products.filter((p) => p.id !== id);
  }
}
