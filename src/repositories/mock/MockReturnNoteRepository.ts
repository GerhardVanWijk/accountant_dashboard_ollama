import type { ReturnNote } from '@/types';
import type { IReturnNoteRepository } from '../IReturnNoteRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `rn_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IReturnNoteRepository (Phase 5D). No seed
 * data — every existing DN/SO/invoice in the mock fixtures predates Return
 * Notes (same prospective-only reasoning as `MockDeliveryNoteRepository`).
 */
export class MockReturnNoteRepository implements IReturnNoteRepository {
  private returnNotes: ReturnNote[];

  constructor(initialData: ReturnNote[] = []) {
    this.returnNotes = initialData.map((rn) => ({ ...rn }));
  }

  async getAll(): Promise<ReturnNote[]> {
    return [...this.returnNotes];
  }

  async getById(id: string): Promise<ReturnNote | undefined> {
    return this.returnNotes.find((rn) => rn.id === id);
  }

  async getByDeliveryNoteId(deliveryNoteId: string): Promise<ReturnNote[]> {
    return this.returnNotes.filter((rn) => rn.deliveryNoteId === deliveryNoteId);
  }

  async getBySalesOrderId(salesOrderId: string): Promise<ReturnNote[]> {
    return this.returnNotes.filter((rn) => rn.salesOrderId === salesOrderId);
  }

  async getByCustomerId(customerId: string): Promise<ReturnNote[]> {
    return this.returnNotes.filter((rn) => rn.customerId === customerId);
  }

  async create(entity: ReturnNote): Promise<ReturnNote> {
    const record: ReturnNote = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.returnNotes.push(record);
    return record;
  }

  async update(id: string, patch: Partial<ReturnNote>): Promise<ReturnNote> {
    const index = this.returnNotes.findIndex((rn) => rn.id === id);
    if (index === -1) {
      throw new Error(`MockReturnNoteRepository: return note "${id}" not found`);
    }
    const updated: ReturnNote = {
      ...this.returnNotes[index],
      ...patch,
      id: this.returnNotes[index].id,
      updatedAt: nowISO(),
    };
    this.returnNotes[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.returnNotes = this.returnNotes.filter((rn) => rn.id !== id);
  }
}
