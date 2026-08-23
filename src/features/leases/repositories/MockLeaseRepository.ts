import type { LeaseContract } from '@/types/lease';
import type { ILeaseRepository } from './ILeaseRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `lease_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ILeaseRepository, mirroring
 * MockFixedAssetRepository.ts's shape. No seed data exists for leases yet
 * (this is a genuinely new module) — starts empty, same as
 * MockDepreciationEntryRepository's default.
 */
export class MockLeaseRepository implements ILeaseRepository {
  private leases: LeaseContract[];

  constructor(initialData: LeaseContract[] = []) {
    this.leases = initialData.map((l) => ({ ...l }));
  }

  async getAll(): Promise<LeaseContract[]> {
    return [...this.leases];
  }

  async getById(id: string): Promise<LeaseContract | undefined> {
    return this.leases.find((l) => l.id === id);
  }

  async create(entity: LeaseContract): Promise<LeaseContract> {
    const record: LeaseContract = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.leases.push(record);
    return record;
  }

  async update(id: string, patch: Partial<LeaseContract>): Promise<LeaseContract> {
    const index = this.leases.findIndex((l) => l.id === id);
    if (index === -1) {
      throw new Error(`MockLeaseRepository: lease "${id}" not found`);
    }
    const updated: LeaseContract = {
      ...this.leases[index],
      ...patch,
      id: this.leases[index].id,
      updatedAt: nowISO(),
    };
    this.leases[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.leases = this.leases.filter((l) => l.id !== id);
  }
}
