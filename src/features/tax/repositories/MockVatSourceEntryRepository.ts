import type { ID, VatSourceEntry } from '@/types';
import type { IVatSourceEntryRepository } from './IVatSourceEntryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `vse_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory append-only VAT source/evidence ledger. */
export class MockVatSourceEntryRepository implements IVatSourceEntryRepository {
  private entries: VatSourceEntry[];

  constructor(initialData: VatSourceEntry[] = []) {
    this.entries = initialData.map((e) => ({ ...e }));
  }

  async getAll(): Promise<VatSourceEntry[]> {
    return this.entries.map((e) => ({ ...e }));
  }

  async getBySource(sourceType: string, sourceId: ID): Promise<VatSourceEntry[]> {
    return this.entries.filter((e) => e.sourceType === sourceType && e.sourceId === sourceId).map((e) => ({ ...e }));
  }

  async create(entity: VatSourceEntry): Promise<VatSourceEntry> {
    const record: VatSourceEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.entries.push(record);
    return { ...record };
  }
}
