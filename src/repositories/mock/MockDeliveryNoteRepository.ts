import type { DeliveryNote } from '@/types';
import type { IDeliveryNoteRepository } from '../IDeliveryNoteRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `dn_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IDeliveryNoteRepository (Phase 5C). No seed
 * data — every existing SO/invoice in the mock fixtures predates Delivery
 * Notes (docs/DELIVERY_NOTES_DESIGN.md Part 14: prospective-only, no
 * historical fabrication).
 */
export class MockDeliveryNoteRepository implements IDeliveryNoteRepository {
  private deliveryNotes: DeliveryNote[];

  constructor(initialData: DeliveryNote[] = []) {
    this.deliveryNotes = initialData.map((dn) => ({ ...dn }));
  }

  async getAll(): Promise<DeliveryNote[]> {
    return [...this.deliveryNotes];
  }

  async getById(id: string): Promise<DeliveryNote | undefined> {
    return this.deliveryNotes.find((dn) => dn.id === id);
  }

  async getBySalesOrderId(salesOrderId: string): Promise<DeliveryNote[]> {
    return this.deliveryNotes.filter((dn) => dn.salesOrderId === salesOrderId);
  }

  async getByCustomerId(customerId: string): Promise<DeliveryNote[]> {
    return this.deliveryNotes.filter((dn) => dn.customerId === customerId);
  }

  async create(entity: DeliveryNote): Promise<DeliveryNote> {
    const record: DeliveryNote = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.deliveryNotes.push(record);
    return record;
  }

  async update(id: string, patch: Partial<DeliveryNote>): Promise<DeliveryNote> {
    const index = this.deliveryNotes.findIndex((dn) => dn.id === id);
    if (index === -1) {
      throw new Error(`MockDeliveryNoteRepository: delivery note "${id}" not found`);
    }
    const updated: DeliveryNote = {
      ...this.deliveryNotes[index],
      ...patch,
      id: this.deliveryNotes[index].id,
      updatedAt: nowISO(),
    };
    this.deliveryNotes[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.deliveryNotes = this.deliveryNotes.filter((dn) => dn.id !== id);
  }
}
