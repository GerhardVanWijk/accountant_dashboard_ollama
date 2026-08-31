import type { StockBalance } from '@/types';
import { seedStockBalances } from '@/mock-data/stockBalances';
import type { IStockBalanceRepository } from './IStockBalanceRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `stkbal_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IStockBalanceRepository, mirroring
 * MockStockMovementRepository.ts / MockWarehouseRepository.ts's shape
 * (docs/ARCHITECTURE.md § Repository Pattern). Defaults to
 * `seedStockBalances` (empty — balances are maintained from the movement
 * ledger at runtime, not seeded from a fixture).
 */
export class MockStockBalanceRepository implements IStockBalanceRepository {
  private balances: StockBalance[];

  constructor(initialData: StockBalance[] = seedStockBalances) {
    this.balances = initialData.map((b) => ({ ...b }));
  }

  async getAll(): Promise<StockBalance[]> {
    return [...this.balances];
  }

  async getById(id: string): Promise<StockBalance | undefined> {
    return this.balances.find((b) => b.id === id);
  }

  async create(entity: StockBalance): Promise<StockBalance> {
    const record: StockBalance = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.balances.push(record);
    return record;
  }

  async update(id: string, patch: Partial<StockBalance>): Promise<StockBalance> {
    const index = this.balances.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error(`MockStockBalanceRepository: balance "${id}" not found`);
    }
    const updated: StockBalance = {
      ...this.balances[index],
      ...patch,
      id: this.balances[index].id,
      updatedAt: nowISO(),
    };
    this.balances[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.balances = this.balances.filter((b) => b.id !== id);
  }
}
