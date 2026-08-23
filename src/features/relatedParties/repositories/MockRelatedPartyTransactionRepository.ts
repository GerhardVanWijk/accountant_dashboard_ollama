import type { RelatedPartyTransaction } from '@/types/relatedParty';
import type { IRelatedPartyTransactionRepository } from './IRelatedPartyTransactionRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `relptytxn_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IRelatedPartyTransactionRepository, mirroring MockEmployeeRepository.ts. */
export class MockRelatedPartyTransactionRepository implements IRelatedPartyTransactionRepository {
  private transactions: RelatedPartyTransaction[];

  constructor(initialData: RelatedPartyTransaction[] = []) {
    this.transactions = initialData.map((t) => ({ ...t }));
  }

  async getAll(): Promise<RelatedPartyTransaction[]> {
    return [...this.transactions];
  }

  async getById(id: string): Promise<RelatedPartyTransaction | undefined> {
    return this.transactions.find((t) => t.id === id);
  }

  async create(entity: RelatedPartyTransaction): Promise<RelatedPartyTransaction> {
    const record: RelatedPartyTransaction = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.transactions.push(record);
    return record;
  }

  async update(id: string, patch: Partial<RelatedPartyTransaction>): Promise<RelatedPartyTransaction> {
    const index = this.transactions.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`MockRelatedPartyTransactionRepository: related party transaction "${id}" not found`);
    }
    const updated: RelatedPartyTransaction = { ...this.transactions[index], ...patch, id: this.transactions[index].id, updatedAt: nowISO() };
    this.transactions[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.transactions = this.transactions.filter((t) => t.id !== id);
  }
}
