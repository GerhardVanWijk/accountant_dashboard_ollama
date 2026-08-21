import { describe, it, expect } from 'vitest';
import { BankAccountService } from './bankAccountService';
import { MockBankAccountRepository } from '../repositories/MockBankAccountRepository';
import { MockBankTransactionRepository } from '../repositories/MockBankTransactionRepository';
import { seedBankAccounts } from '@/mock-data/bankAccounts';
import type { BankTransactionWithAllocations } from '../types';

function setup(txns: BankTransactionWithAllocations[] = []) {
  const bankAccountRepository = new MockBankAccountRepository(seedBankAccounts.map((a) => ({ ...a })));
  const bankTransactionRepository = new MockBankTransactionRepository(txns);
  const service = new BankAccountService(bankAccountRepository, bankTransactionRepository);
  return { service, bankAccountRepository, bankTransactionRepository };
}

describe('BankAccountService', () => {
  it('lists all seeded bank accounts', async () => {
    const { service } = setup();
    const accounts = await service.getBankAccounts();
    expect(accounts.length).toBe(seedBankAccounts.length);
  });

  it('creates a bank account with a valid GL account link', async () => {
    const { service } = setup();
    const created = await service.createBankAccount({
      name: 'Test Account',
      bankName: 'FNB',
      accountNumber: '999999',
      accountType: 'checking',
      currency: 'ZAR',
      openingBalance: 1000,
      glAccountId: 'acc_1000',
      status: 'active',
    });
    expect(created.id).toBeDefined();
    expect(created.currentBalance).toBe(1000);
  });

  it('rejects a duplicate account number for the same bank', async () => {
    const { service } = setup();
    const existing = seedBankAccounts[0];
    await expect(
      service.createBankAccount({
        name: 'Duplicate',
        bankName: existing.bankName,
        accountNumber: existing.accountNumber,
        accountType: 'checking',
        currency: 'ZAR',
        openingBalance: 0,
        glAccountId: 'acc_1000',
        status: 'active',
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects creation without a linked GL account', async () => {
    const { service } = setup();
    await expect(
      service.createBankAccount({
        name: 'No GL link',
        bankName: 'FNB',
        accountNumber: '111111',
        accountType: 'checking',
        currency: 'ZAR',
        openingBalance: 0,
        glAccountId: '',
        status: 'active',
      }),
    ).rejects.toThrow(/GL account/i);
  });

  it('deactivates rather than deletes an account with recorded transactions', async () => {
    const txn: BankTransactionWithAllocations = {
      id: 'txn_1',
      bankAccountId: seedBankAccounts[0].id,
      date: '2026-03-01T00:00:00.000Z',
      description: 'Test',
      amount: 100,
      direction: 'debit',
      status: 'unreconciled',
      allocations: [],
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    const { service, bankAccountRepository } = setup([txn]);

    await service.deleteBankAccount(seedBankAccounts[0].id);

    const account = await bankAccountRepository.getById(seedBankAccounts[0].id);
    expect(account?.status).toBe('inactive');
  });

  it('hard-deletes an account with no transactions', async () => {
    const { service, bankAccountRepository } = setup([]);
    await service.deleteBankAccount(seedBankAccounts[0].id);
    const account = await bankAccountRepository.getById(seedBankAccounts[0].id);
    expect(account).toBeUndefined();
  });
});
