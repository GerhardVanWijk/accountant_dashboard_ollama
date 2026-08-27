import { describe, expect, it } from 'vitest';
import { detectEditedAfterReconciliation } from './editedAfterReconciliation';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';
import type { JournalEntry } from '@/types';

function reconciliation(overrides: Partial<BankReconciliation> = {}): BankReconciliation {
  return {
    id: 'rec1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    bankAccountId: 'acc1',
    statementDate: '2026-07-31',
    statementBalance: 1000,
    glCashbookBalance: 1000,
    adjustedBankBalance: 1000,
    variance: 0,
    clearedTransactionIds: ['txn1'],
    unpresentedTransactionIds: [],
    unclearedDepositIds: [],
    finalizedAt: '2026-08-01T09:00:00.000Z',
    finalizedByUserId: 'system',
    ...overrides,
  };
}

function transaction(overrides: Partial<BankTransactionWithAllocations> = {}): BankTransactionWithAllocations {
  return {
    id: 'txn1',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    bankAccountId: 'acc1',
    date: '2026-07-30',
    description: 'Supplier payment',
    amount: 500,
    direction: 'credit',
    status: 'reconciled',
    allocations: [],
    journalEntryId: 'je1',
    ...overrides,
  };
}

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je1',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    entryNumber: 'JE-0001',
    date: '2026-07-30',
    lines: [],
    status: 'posted',
    source: 'bank_transaction',
    ...overrides,
  };
}

describe('detectEditedAfterReconciliation', () => {
  it('flags a reconciled transaction whose journal entry was reversed after the reconciliation finalized', () => {
    const original = entry({ id: 'je1' });
    const reversal = entry({ id: 'je2', entryNumber: 'JE-0002', reversalOfEntryId: 'je1', postedAt: '2026-08-15T00:00:00.000Z', date: '2026-08-15' });

    const issues = detectEditedAfterReconciliation([reconciliation()], [transaction()], [original, reversal]);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('edited_after_reconciliation');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].relatedJournalEntryIds).toEqual(['je1', 'je2']);
  });

  it('does not flag when the reversal happened BEFORE the reconciliation was finalized', () => {
    const original = entry({ id: 'je1' });
    const reversal = entry({ id: 'je2', reversalOfEntryId: 'je1', postedAt: '2026-07-31T00:00:00.000Z' });

    const issues = detectEditedAfterReconciliation([reconciliation()], [transaction()], [original, reversal]);

    expect(issues).toHaveLength(0);
  });

  it('does not flag a cleared transaction whose journal entry was never reversed', () => {
    const original = entry({ id: 'je1' });

    const issues = detectEditedAfterReconciliation([reconciliation()], [transaction()], [original]);

    expect(issues).toHaveLength(0);
  });
});
