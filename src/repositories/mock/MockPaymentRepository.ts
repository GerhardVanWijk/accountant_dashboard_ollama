import type { Payment } from '@/types';
import { seedPayments } from '@/mock-data/payments';
import type { IPaymentRepository } from '../IPaymentRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `pay_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IPaymentRepository.
 * Provides full CRUD operations for supplier payments. Mirrors
 * MockBillRepository exactly (see its doc comment).
 */
export class MockPaymentRepository implements IPaymentRepository {
  private payments: Payment[];

  constructor(initialData: Payment[] = seedPayments) {
    // Copy so mutations never leak into the shared seed array.
    this.payments = initialData.map((p) => ({ ...p, allocations: p.allocations.map((a) => ({ ...a })) }));
  }

  async getAll(): Promise<Payment[]> {
    return this.payments.map((p) => ({ ...p, allocations: p.allocations.map((a) => ({ ...a })) }));
  }

  async getById(id: string): Promise<Payment | undefined> {
    const payment = this.payments.find((p) => p.id === id);
    return payment ? { ...payment, allocations: payment.allocations.map((a) => ({ ...a })) } : undefined;
  }

  async create(entity: Payment): Promise<Payment> {
    const record: Payment = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.payments.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Payment>): Promise<Payment> {
    const index = this.payments.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`MockPaymentRepository: payment "${id}" not found`);
    }
    const updated: Payment = {
      ...this.payments[index],
      ...patch,
      id: this.payments[index].id,
      updatedAt: nowISO(),
    };
    this.payments[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.payments = this.payments.filter((p) => p.id !== id);
  }
}
