import type { Product } from '@/types';
import type { IProductRepository } from '../repositories/IProductRepository';
import { productRepository } from '../repositories/instances';

/**
 * quantityOnHand is intentionally excluded — it must never be set directly
 * on create/update (docs/DO_NOT_BREAK.md § Inventory & Stock). New
 * products always start at 0; record an 'opening' stock movement via
 * stockService.recordStockMovement to set real opening stock through the
 * ledger.
 */
export type CreateProductDTO = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'quantityOnHand'>;
export type UpdateProductDTO = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'quantityOnHand'>>;

/**
 * Business-logic layer for the product catalog, mirroring
 * src/services/customerService.ts's shape (docs/ARCHITECTURE.md).
 */
export class ProductService {
  constructor(private readonly repository: IProductRepository) {}

  async getProducts(): Promise<Product[]> {
    return this.repository.getAll();
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.repository.getById(id);
  }

  async createProduct(data: CreateProductDTO): Promise<Product> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      quantityOnHand: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateProduct(id: string, patch: UpdateProductDTO): Promise<Product> {
    return this.repository.update(id, patch);
  }

  async deleteProduct(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}

/** Singleton wired to the shared mock repository (see ../repositories/instances.ts). */
export const productService = new ProductService(productRepository);
