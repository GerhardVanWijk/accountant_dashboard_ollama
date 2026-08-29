import { describe, it, expect } from 'vitest';
import { MockBankStatementLineRepository } from './MockBankStatementLineRepository';
import type { BankStatementLine } from '@/types';

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankStatementId: 'stmt_1',
    bankAccountId: 'bank_a',
    sequence: 1,
    txnDate: '2026-03-05T00:00:00.000Z',
    description: 'Customer payment',
    amount: 100,
    direction: 'debit',
    rawSource: { foo: 'bar' },
    lineState: 'unmatched',
    ...overrides,
  };
}

describe('MockBankStatementLineRepository', () => {
  it('createMany assigns ids and getByStatement returns them ordered by sequence', async () => {
    const repo = new MockBankStatementLineRepository();
    await repo.createMany([
      makeLine({ sequence: 2, description: 'second' }),
      makeLine({ sequence: 1, description: 'first' }),
    ]);
    const lines = await repo.getByStatement('stmt_1');
    expect(lines.map((l) => l.description)).toEqual(['first', 'second']);
    expect(lines.every((l) => l.id)).toBe(true);
  });

  it('createMany([]) is a no-op', async () => {
    const repo = new MockBankStatementLineRepository();
    expect(await repo.createMany([])).toEqual([]);
  });

  it('getByAccountInWindow filters inclusively by txnDate', async () => {
    const repo = new MockBankStatementLineRepository();
    await repo.createMany([
      makeLine({ txnDate: '2026-02-28T00:00:00.000Z' }),
      makeLine({ txnDate: '2026-03-05T00:00:00.000Z' }),
      makeLine({ txnDate: '2026-03-31T00:00:00.000Z' }),
      makeLine({ txnDate: '2026-04-01T00:00:00.000Z' }),
    ]);
    const window = await repo.getByAccountInWindow('bank_a', '2026-03-01T00:00:00.000Z', '2026-03-31T23:59:59.999Z');
    expect(window).toHaveLength(2);
  });

  it('update patches line state and matched transaction, not raw by reference', async () => {
    const repo = new MockBankStatementLineRepository();
    const [line] = await repo.createMany([makeLine()]);
    const updated = await repo.update(line.id, { lineState: 'matched', matchedBankTransactionId: 'txn_9' });
    expect(updated.lineState).toBe('matched');
    expect(updated.matchedBankTransactionId).toBe('txn_9');

    updated.rawSource.foo = 'mutated';
    const refetched = (await repo.getByStatement('stmt_1'))[0];
    expect(refetched.rawSource.foo).toBe('bar');
  });
});
