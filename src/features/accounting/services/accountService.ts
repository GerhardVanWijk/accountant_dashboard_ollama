import type { Account, ID } from '@/types';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';

export type CreateAccountDTO = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Chart of Accounts business logic. Deletion is guarded: an account that
 * has ever been posted to must never disappear from the chart, or ledger
 * rows referencing it would point at nothing — same delete-guard-on-linked-
 * history pattern Suppliers uses for vendors with bill history.
 */
export class AccountService {
  constructor(
    private readonly accountRepository: IAccountRepository,
    private readonly journalRepository: IJournalEntryRepository,
  ) {}

  async getAccounts(): Promise<Account[]> {
    return this.accountRepository.getAll();
  }

  async getAccount(id: ID): Promise<Account | undefined> {
    return this.accountRepository.getById(id);
  }

  async createAccount(data: CreateAccountDTO): Promise<Account> {
    const now = new Date().toISOString();
    return this.accountRepository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async updateAccount(id: ID, patch: Partial<Account>): Promise<Account> {
    return this.accountRepository.update(id, patch);
  }

  /** True if any posted journal line references this account. */
  async hasPostings(accountId: ID): Promise<boolean> {
    const entries = await this.journalRepository.getAll();
    return entries.some((entry) => entry.lines.some((line) => line.accountId === accountId));
  }

  /**
   * Deactivates rather than deletes when the account has ledger history
   * (mirrors Customers/Suppliers' inactivate-not-delete guard). Only an
   * account with zero postings can be hard-deleted from the chart.
   */
  async deleteAccount(id: ID): Promise<void> {
    if (await this.hasPostings(id)) {
      await this.accountRepository.update(id, { isActive: false });
      return;
    }
    await this.accountRepository.delete(id);
  }
}
