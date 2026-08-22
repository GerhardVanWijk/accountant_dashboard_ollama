import type { DepreciationEntry } from '@/types';
import type { IDepreciationEntryRepository } from './IDepreciationEntryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `depr_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of the append-only depreciation ledger. Like
 * MockStockMovementRepository, this deliberately does NOT implement the
 * generic IRepository<T> — no update()/delete(), create() is the only
 * write path.
 */
export class MockDepreciationEntryRepository implements IDepreciationEntryRepository {
  private entries: DepreciationEntry[];

  constructor(initialData: DepreciationEntry[] = []) {
    this.entries = initialData.map((e) => ({ ...e }));
  }

  async getAll(): Promise<DepreciationEntry[]> {
    return [...this.entries];
  }

  async getById(id: string): Promise<DepreciationEntry | undefined> {
    return this.entries.find((e) => e.id === id);
  }

  async getByAsset(assetId: string): Promise<DepreciationEntry[]> {
    return this.entries.filter((e) => e.assetId === assetId);
  }

  async create(entity: DepreciationEntry): Promise<DepreciationEntry> {
    const record: DepreciationEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.entries.push(record);
    return record;
  }
}
