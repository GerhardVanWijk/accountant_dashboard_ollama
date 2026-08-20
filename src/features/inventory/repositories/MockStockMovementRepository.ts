import type { StockMovement } from '@/types';
import { seedStockMovements } from '@/mock-data/stockMovements';
import type { IStockMovementRepository } from './IStockMovementRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `stkmv_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of the append-only stock movement ledger
 * (IStockMovementRepository). Unlike MockProductRepository/
 * MockWarehouseRepository, this deliberately does NOT implement the
 * generic IRepository<T> — there is no update()/delete() method to
 * implement, so history cannot be mutated even by mistake. create() is the
 * only write operation, per docs/INVENTORY_DOMAIN.md's append-only ledger
 * rule and docs/DO_NOT_BREAK.md § Inventory & Stock.
 */
export class MockStockMovementRepository implements IStockMovementRepository {
  private movements: StockMovement[];

  constructor(initialData: StockMovement[] = seedStockMovements) {
    this.movements = initialData.map((m) => ({ ...m }));
  }

  async getAll(): Promise<StockMovement[]> {
    return [...this.movements];
  }

  async getById(id: string): Promise<StockMovement | undefined> {
    return this.movements.find((m) => m.id === id);
  }

  async create(entity: StockMovement): Promise<StockMovement> {
    const record: StockMovement = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.movements.push(record);
    return record;
  }
}
