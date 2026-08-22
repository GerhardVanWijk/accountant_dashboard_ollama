import type { StockLot } from '@/types';
import type { IStockLotRepository } from './IStockLotRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `stklot_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IStockLotRepository, mirroring
 * MockProductRepository.ts's shape. No seed data — FIFO lots only ever
 * exist from the point a product is switched to `valuationMethod: 'fifo'`
 * and a receipt creates one; there's no historical lot data to backfill.
 */
export class MockStockLotRepository implements IStockLotRepository {
  private lots: StockLot[];

  constructor(initialData: StockLot[] = []) {
    this.lots = initialData.map((l) => ({ ...l }));
  }

  async getAll(): Promise<StockLot[]> {
    return [...this.lots];
  }

  async getById(id: string): Promise<StockLot | undefined> {
    return this.lots.find((l) => l.id === id);
  }

  async create(entity: StockLot): Promise<StockLot> {
    const record: StockLot = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.lots.push(record);
    return record;
  }

  async update(id: string, patch: Partial<StockLot>): Promise<StockLot> {
    const index = this.lots.findIndex((l) => l.id === id);
    if (index === -1) {
      throw new Error(`MockStockLotRepository: stock lot "${id}" not found`);
    }
    const updated: StockLot = {
      ...this.lots[index],
      ...patch,
      id: this.lots[index].id,
      updatedAt: nowISO(),
    };
    this.lots[index] = updated;
    return updated;
  }
}
