import type { Account } from '@/types';
import { seedAccounts } from '@/mock-data/accounts';
import type { IAccountRepository } from './IAccountRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `acc_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IAccountRepository. */
export class MockAccountRepository implements IAccountRepository {
  private accounts: Account[];

  constructor(initialData: Account[] = seedAccounts) {
    this.accounts = initialData.map((a) => ({ ...a }));
  }

  async getAll(): Promise<Account[]> {
    return [...this.accounts];
  }

  async getById(id: string): Promise<Account | undefined> {
    return this.accounts.find((a) => a.id === id);
  }

  async create(entity: Account): Promise<Account> {
    const record: Account = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.accounts.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Account>): Promise<Account> {
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error(`MockAccountRepository: account "${id}" not found`);
    }
    const updated: Account = {
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
