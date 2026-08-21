import type { BankAccount } from '@/types';
import { seedBankAccounts } from '@/mock-data/bankAccounts';
import type { IBankAccountRepository } from './IBankAccountRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `bank_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IBankAccountRepository. */
export class MockBankAccountRepository implements IBankAccountRepository {
  private accounts: BankAccount[];

  constructor(initialData: BankAccount[] = seedBankAccounts) {
    this.accounts = initialData.map((a) => ({ ...a }));
  }

  async getAll(): Promise<BankAccount[]> {
    return [...this.accounts];
  }

  async getById(id: string): Promise<BankAccount | undefined> {
    return this.accounts.find((a) => a.id === id);
  }

  async create(entity: BankAccount): Promise<BankAccount> {
    const now = nowISO();
    const record: BankAccount = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.push(record);
    return record;
  }

  async update(id: string, patch: Partial<BankAccount>): Promise<BankAccount> {
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error(`MockBankAccountRepository: bank account "${id}" not found`);
    }
    const updated: BankAccount = {
      ...this.accounts[index],
      ...patch,
      id: this.accounts[index].id,
      updatedAt: nowISO(),
    };
    this.accounts[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.accounts = this.accounts.filter((a) => a.id !== id);
  }
}
