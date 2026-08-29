import { describe, it, expect } from 'vitest';
import { findMatchCandidates } from './matching';
import type { BankTransactionWithAllocations } from '../types';
import type { ParsedStatementLine } from '../types';

function makeTxn(overrides: Partial<BankTransactionWithAllocations>): BankTransactionWithAllocations {
  return {
    id: 'txn_1',
    bankAccountId: 'bank_1',
    date: '2026-03-10T00:00:00.000Z',
    description: 'Customer payment - Acme Trading',
    reference: 'EFT-88213',
    amount: 1000,
    direction: 'debit',
    status: 'unreconciled',
    allocations: [],
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeLine(overrides: Partial<ParsedStatementLine>): ParsedStatementLine {
  return {
    sourceRowId: 'row_1',
    date: '2026-03-10T00:00:00.000Z',
    description: 'ACME TRADING EFT',
    reference: 'EFT-88213',
    amount: 1000,
    direction: 'debit',
    raw: {},
    ...overrides,
  };
}

describe('findMatchCandidates', () => {
  it('scores an exact amount/date/reference match highest', () => {
    const txn = makeTxn({});
    const line = makeLine({});
    const [candidate] = findMatchCandidates(line, [txn]);
    expect(candidate.transactionId).toBe(txn.id);
    expect(candidate.score).toBeGreaterThan(80);
  });

  it('excludes candidates with a different amount', () => {
    const txn = makeTxn({ amount: 500 });
    const line = makeLine({ amount: 1000 });
    expect(findMatchCandidates(line, [txn])).toHaveLength(0);
  });

  it('excludes candidates with a different direction', () => {
    const txn = makeTxn({ direction: 'credit' });
    const line = makeLine({ direction: 'debit' });
    expect(findMatchCandidates(line, [txn])).toHaveLength(0);
  });

  it('excludes candidates outside the date tolerance', () => {
    const txn = makeTxn({ date: '2026-01-01T00:00:00.000Z' });
    const line = makeLine({ date: '2026-03-10T00:00:00.000Z' });
    expect(findMatchCandidates(line, [txn], { dateToleranceDays: 5 })).toHaveLength(0);
  });

  it('scores a same-amount but unrelated reference/description lower than an exact match', () => {
    const exact = makeTxn({ id: 'exact' });
    const vague = makeTxn({ id: 'vague', reference: 'DIFFERENT-REF', description: 'Unrelated narrative' });
    const line = makeLine({});
    const candidates = findMatchCandidates(line, [exact, vague]);
    const exactScore = candidates.find((c) => c.transactionId === 'exact')!.score;
    const vagueScore = candidates.find((c) => c.transactionId === 'vague')!.score;
    expect(exactScore).toBeGreaterThan(vagueScore);
  });

  it('sorts candidates best-first', () => {
    const weak = makeTxn({ id: 'weak', date: '2026-03-13T00:00:00.000Z', reference: 'OTHER' });
    const strong = makeTxn({ id: 'strong' });
    const line = makeLine({});
    const candidates = findMatchCandidates(line, [weak, strong]);
    expect(candidates[0].transactionId).toBe('strong');
  });
});
