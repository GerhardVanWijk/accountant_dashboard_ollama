import type { BankAccount, ID } from '@/types';
import type { IBankAccountRepository } from '../repositories/IBankAccountRepository';
import type { IBankTransactionRepository } from '../repositories/IBankTransactionRepository';

export type CreateBankAccountDTO = Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> & {
  currentBalance?: number;
};

/**
 * Cash & Bank Accounts business logic: setup, banking metadata, and the
 * GL-account link every bank account must carry (`glAccountId`). Deletion
 * is guarded the same way AccountService/Customers/Suppliers guard
 * records with linked history — an account with any recorded transaction
 * is deactivated, not removed.
 */
export class BankAccountService {
  constructor(
    private readonly bankAccountRepository: IBankAccountRepository,
    private readonly bankTransactionRepository: IBankTransactionRepository,
  ) {}

  async getBankAccounts(): Promise<BankAccount[]> {
    return this.bankAccountRepository.getAll();
  }

  async getBankAccount(id: ID): Promise<BankAccount | undefined> {
    return this.bankAccountRepository.getById(id);
  }

  async createBankAccount(data: CreateBankAccountDTO): Promise<BankAccount> {
    if (!data.name?.trim()) throw new Error('Account name is required.');
    if (!data.bankName?.trim()) throw new Error('Bank name is required.');
    if (!data.accountNumber?.trim()) throw new Error('Account number is required.');
    if (!data.glAccountId) throw new Error('A linked Chart of Accounts GL account is required.');

    const existing = await this.bankAccountRepository.getAll();
    if (existing.some((a) => a.bankName === data.bankName && a.accountNumber === data.accountNumber)) {
      throw new Error(`An account with number "${data.accountNumber}" already exists for ${data.bankName}.`);
    }

    const now = new Date().toISOString();
    return this.bankAccountRepository.create({
      ...data,
      currentBalance: data.currentBalance ?? data.openingBalance,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateBankAccount(id: ID, patch: Partial<BankAccount>): Promise<BankAccount> {
    return this.bankAccountRepository.update(id, patch);
  }

  /** True if any bank transaction has ever been recorded against this account. */
  async hasTransactions(bankAccountId: ID): Promise<boolean> {
    const txns = await this.bankTransactionRepository.getByAccount(bankAccountId);
    return txns.length > 0;
  }

  /** Deactivates rather than deletes an account with transaction history. */
  async deleteBankAccount(id: ID): Promise<void> {
    if (await this.hasTransactions(id)) {
      await this.bankAccountRepository.update(id, { status: 'inactive' });
      return;
    }
    await this.bankAccountRepository.delete(id);
  }

  /** Recomputes currentBalance from opening balance + every recorded transaction (audit/repair utility). */
  async recalculateBalance(bankAccountId: ID): Promise<BankAccount> {
    const account = await this.bankAccountRepository.getById(bankAccountId);
    if (!account) throw new Error(`Bank account "${bankAccountId}" not found.`);
    const txns = await this.bankTransactionRepository.getByAccount(bankAccountId);
    const net = txns.reduce((sum, t) => sum + (t.direction === 'debit' ? t.amount : -t.amount), 0);
    return this.bankAccountRepository.update(bankAccountId, {
      currentBalance: account.openingBalance + net,
    });
  }
}
