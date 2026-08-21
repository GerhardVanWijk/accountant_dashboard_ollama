import type { Warehouse } from '@/types';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import { warehouseRepository } from '../repositories/instances';

export type CreateWarehouseDTO = Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateWarehouseDTO = Partial<Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Business-logic layer for warehouses, mirroring
 * src/services/customerService.ts's shape (docs/ARCHITECTURE.md).
 */
export class WarehouseService {
  constructor(private readonly repository: IWarehouseRepository) {}

  async getWarehouses(): Promise<Warehouse[]> {
    return this.repository.getAll();
  }

  async getWarehouse(id: string): Promise<Warehouse | undefined> {
    return this.repository.getById(id);
  }

  /**
   * The warehouse stock movements default to when a source document
   * (Invoice/Bill line item) doesn't specify one — neither carries a
   * `warehouseId` field today, so sale/receipt postings need a fallback.
   * Exactly one warehouse should carry `isDefault: true`
   * (src/types/warehouse.ts).
   */
  async getDefaultWarehouse(): Promise<Warehouse | undefined> {
    const warehouses = await this.getWarehouses();
    return warehouses.find((w) => w.isDefault);
  }

  async createWarehouse(data: CreateWarehouseDTO): Promise<Warehouse> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateWarehouse(id: string, patch: UpdateWarehouseDTO): Promise<Warehouse> {
    return this.repository.update(id, patch);
  }

  async deleteWarehouse(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}

/** Singleton wired to the shared mock repository (see ../repositories/instances.ts). */
export const warehouseService = new WarehouseService(warehouseRepository);
