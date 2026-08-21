import { describe, it, expect } from 'vitest';
import { MockBankTransactionRepository } from './MockBankTransactionRepository';
import type { BankTransactionWithAllocations } from '../types';

function makeTxn(overrides: Partial<BankTransactionWithAllocations> = {}): BankTransactionWithAllocations {
  return {
    id: 'txn_1',
    bankAccountId: 'bank_1',
    date: '2026-03-01T00:00:00.000Z',
    description: 'Test',
    amount: 100,
    direction: 'debit',
    status: 'unreconciled',
    allocations: [{ id: 'a1', glAccountId: 'acc_4000', netAmount: 100, taxAmount: 0 }],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MockBankTransactionRepository', () => {
  it('creates and retrieves a transaction', async () => {
    const repo = new MockBankTransactionRepository([]);
    const created = await repo.create({ ...makeTxn(), id: '' });
    expect(created.id).toBeTruthy();
    const found = await repo.getById(created.id);
    expect(found?.description).toBe('Test');
  });

  it('filters by bank account', async () => {
    const repo = new MockBankTransactionRepository([
      makeTxn({ id: 't1', bankAccountId: 'bank_a' }),
      makeTxn({ id: 't2', bankAccountId: 'bank_b' }),
    ]);
    const forA = await repo.getByAccount('bank_a');
    expect(forA).toHaveLength(1);
    expect(forA[0].id).toBe('t1');
  });

  it('does not let a caller mutate stored allocations by reference', async () => {
    const repo = new MockBankTransactionRepository([makeTxn({ id: 't1' })]);
    const first = await repo.getById('t1');
    first!.allocations[0].netAmount = 999999;

    const second = await repo.getById('t1');
    expect(second!.allocations[0].netAmount).toBe(100);
  });

  it('updates a transaction, replacing its allocations when provided', async () => {
    const repo = new MockBankTransactionRepository([makeTxn({ id: 't1' })]);
    const updated = await repo.update('t1', {
      status: 'matched',
      allocations: [{ id: 'a2', glAccountId: 'acc_5100', netAmount: 100, taxAmount: 0 }],
    });
    expect(updated.status).toBe('matched');
    expect(updated.allocations).toHaveLength(1);
    expect(updated.allocations[0].glAccountId).toBe('acc_5100');
  });

  it('throws when updating a non-existent transaction', async () => {
    const repo = new MockBankTransactionRepository([]);
    await expect(repo.update('missing', { status: 'matched' })).rejects.toThrow(/not found/i);
  });

  it('deletes a transaction', async () => {
    const repo = new MockBankTransactionRepository([makeTxn({ id: 't1' })]);
    await repo.delete('t1');
    expect(await repo.getById('t1')).toBeUndefined();
  });
});
