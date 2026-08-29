import { describe, it, expect } from 'vitest';
import { MockBankStatementRepository } from './MockBankStatementRepository';
import type { BankStatement } from '@/types';

function makeStatement(overrides: Partial<BankStatement> = {}): BankStatement {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'bank_a',
    sourceFilename: 'march.csv',
    sourceFormat: 'csv',
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-31T00:00:00.000Z',
    openingBalance: 1000,
    closingBalance: 1500,
    currency: 'ZAR',
    lineCount: 3,
    importStatus: 'imported',
    reconciliationStatus: 'not_started',
    contentHash: 'hash-1',
    ...overrides,
  };
}

describe('MockBankStatementRepository', () => {
  it('creates and retrieves a statement', async () => {
    const repo = new MockBankStatementRepository();
    const created = await repo.create(makeStatement());
    expect(created.id).toBeTruthy();
    const found = await repo.getById(created.id);
    expect(found?.sourceFilename).toBe('march.csv');
  });

  it('filters by account and lists by company', async () => {
    const repo = new MockBankStatementRepository();
    await repo.create(makeStatement({ bankAccountId: 'bank_a' }));
    await repo.create(makeStatement({ bankAccountId: 'bank_b', contentHash: 'hash-2' }));
    expect(await repo.getByAccount('bank_a')).toHaveLength(1);
    expect(await repo.getByCompany()).toHaveLength(2);
  });

  it('findByContentHash is scoped to the account', async () => {
    const repo = new MockBankStatementRepository();
    await repo.create(makeStatement({ bankAccountId: 'bank_a', contentHash: 'shared' }));
    expect(await repo.findByContentHash('bank_a', 'shared')).toBeDefined();
    expect(await repo.findByContentHash('bank_b', 'shared')).toBeUndefined();
    expect(await repo.findByContentHash('bank_a', 'other')).toBeUndefined();
  });

  it('updates lifecycle fields', async () => {
    const repo = new MockBankStatementRepository();
    const created = await repo.create(makeStatement());
    const updated = await repo.update(created.id, { reconciliationStatus: 'in_progress', lineCount: 5 });
    expect(updated.reconciliationStatus).toBe('in_progress');
    expect(updated.lineCount).toBe(5);
  });

  it('throws updating a missing statement', async () => {
    const repo = new MockBankStatementRepository();
    await expect(repo.update('nope', { lineCount: 1 })).rejects.toThrow(/not found/i);
  });
});
