import { seedBankTransactions } from '@/mock-data/bankTransactions';
import type { BankTransactionWithAllocations } from '../types';
import type { IBankTransactionRepository } from './IBankTransactionRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `btx_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneTxn(t: BankTransactionWithAllocations): BankTransactionWithAllocations {
  return { ...t, allocations: t.allocations.map((a) => ({ ...a })) };
}

/** In-memory implementation of IBankTransactionRepository. */
export class MockBankTransactionRepository implements IBankTransactionRepository {
  private transactions: BankTransactionWithAllocations[];

  constructor(initialData: BankTransactionWithAllocations[] = seedBankTransactions) {
    this.transactions = initialData.map(cloneTxn);
  }

  async getAll(): Promise<BankTransactionWithAllocations[]> {
    return this.transactions.map(cloneTxn);
  }

  async getById(id: string): Promise<BankTransactionWithAllocations | undefined> {
    const found = this.transactions.find((t) => t.id === id);
    return found ? cloneTxn(found) : undefined;
  }

  async getByAccount(bankAccountId: string): Promise<BankTransactionWithAllocations[]> {
    return this.transactions.filter((t) => t.bankAccountId === bankAccountId).map(cloneTxn);
  }

  async create(entity: BankTransactionWithAllocations): Promise<BankTransactionWithAllocations> {
    const now = nowISO();
    const record: BankTransactionWithAllocations = {
      ...cloneTxn(entity),
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.push(record);
    return cloneTxn(record);
  }

  async update(
    id: string,
    patch: Partial<BankTransactionWithAllocations>,
  ): Promise<BankTransactionWithAllocations> {
    const index = this.transactions.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`MockBankTransactionRepository: bank transaction "${id}" not found`);
    }
    const updated: BankTransactionWithAllocations = {
      ...this.transactions[index],
      ...patch,
      id: this.transactions[index].id,
      allocations: patch.allocations
        ? patch.allocations.map((a) => ({ ...a }))
        : this.transactions[index].allocations.map((a) => ({ ...a })),
      updatedAt: nowISO(),
    };
    this.transactions[index] = updated;
    return cloneTxn(updated);
  }

  async delete(id: string): Promise<void> {
    this.transactions = this.transactions.filter((t) => t.id !== id);
  }
}
