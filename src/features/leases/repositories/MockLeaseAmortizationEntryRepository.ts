import type { LeaseAmortizationEntry } from '@/types/lease';
import type { ILeaseAmortizationEntryRepository } from './ILeaseAmortizationEntryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `leaseamort_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of the append-only lease amortization ledger.
 * Like MockDepreciationEntryRepository, this deliberately does NOT
 * implement the generic IRepository<T> — no update()/delete(), create()
 * is the only write path.
 */
export class MockLeaseAmortizationEntryRepository implements ILeaseAmortizationEntryRepository {
  private entries: LeaseAmortizationEntry[];

  constructor(initialData: LeaseAmortizationEntry[] = []) {
    this.entries = initialData.map((e) => ({ ...e }));
  }

  async getAll(): Promise<LeaseAmortizationEntry[]> {
    return [...this.entries];
  }

  async getById(id: string): Promise<LeaseAmortizationEntry | undefined> {
    return this.entries.find((e) => e.id === id);
  }

  async getByLease(leaseId: string): Promise<LeaseAmortizationEntry[]> {
    return this.entries.filter((e) => e.leaseId === leaseId);
  }

  async create(entity: LeaseAmortizationEntry): Promise<LeaseAmortizationEntry> {
    const record: LeaseAmortizationEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.entries.push(record);
    return record;
  }
}
