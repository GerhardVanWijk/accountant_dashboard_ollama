import type { RelatedParty } from '@/types/relatedParty';
import type { IRelatedPartyRepository } from './IRelatedPartyRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `relpty_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IRelatedPartyRepository, mirroring MockEmployeeRepository.ts. */
export class MockRelatedPartyRepository implements IRelatedPartyRepository {
  private relatedParties: RelatedParty[];

  constructor(initialData: RelatedParty[] = []) {
    this.relatedParties = initialData.map((p) => ({ ...p }));
  }

  async getAll(): Promise<RelatedParty[]> {
    return [...this.relatedParties];
  }

  async getById(id: string): Promise<RelatedParty | undefined> {
    return this.relatedParties.find((p) => p.id === id);
  }

  async create(entity: RelatedParty): Promise<RelatedParty> {
    const record: RelatedParty = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.relatedParties.push(record);
    return record;
  }

  async update(id: string, patch: Partial<RelatedParty>): Promise<RelatedParty> {
    const index = this.relatedParties.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`MockRelatedPartyRepository: related party "${id}" not found`);
    }
    const updated: RelatedParty = { ...this.relatedParties[index], ...patch, id: this.relatedParties[index].id, updatedAt: nowISO() };
    this.relatedParties[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.relatedParties = this.relatedParties.filter((p) => p.id !== id);
  }
}
