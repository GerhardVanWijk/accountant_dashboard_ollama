import type { CreditNote } from '@/types';
import { seedCreditNotes } from '@/mock-data/creditNotes';
import type { ICreditNoteRepository } from '../ICreditNoteRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `cn_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ICreditNoteRepository.
 * Stores credit notes in memory with CRUD operations following the repository pattern.
 */
export class MockCreditNoteRepository implements ICreditNoteRepository {
  private creditNotes: CreditNote[];

  constructor(initialData: CreditNote[] = seedCreditNotes) {
    // Copy so mutations never leak into the shared seed array.
    this.creditNotes = initialData.map((cn) => ({ ...cn }));
  }

  async getAll(): Promise<CreditNote[]> {
    return [...this.creditNotes];
  }

  async getById(id: string): Promise<CreditNote | undefined> {
    return this.creditNotes.find((cn) => cn.id === id);
  }

  async create(entity: CreditNote): Promise<CreditNote> {
    const record: CreditNote = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.creditNotes.push(record);
    return record;
  }

  async update(id: string, patch: Partial<CreditNote>): Promise<CreditNote> {
    const index = this.creditNotes.findIndex((cn) => cn.id === id);
    if (index === -1) {
      throw new Error(`MockCreditNoteRepository: credit note "${id}" not found`);
    }
    const updated: CreditNote = {
      ...this.creditNotes[index],
      ...patch,
      id: this.creditNotes[index].id,
      updatedAt: nowISO(),
    };
    this.creditNotes[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.creditNotes = this.creditNotes.filter((cn) => cn.id !== id);
  }
}
