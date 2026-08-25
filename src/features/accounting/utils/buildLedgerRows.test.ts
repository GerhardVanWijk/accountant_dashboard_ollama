import { describe, it, expect } from 'vitest';
import type { Account, JournalEntry } from '@/types';
import type { LedgerRow } from '../services';
import { buildAccountLedgerRows, buildLedgerRows } from './buildLedgerRows';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1000',
    code: '1000',
    name: 'Cash and Bank',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_1',
    entryNumber: 'JE-0001',
    date: '2026-01-05T00:00:00.000Z',
    memo: 'Opening balances',
    status: 'posted',
    source: 'manual',
    lines: [
      { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
      { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
    ],
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildLedgerRows', () => {
  it('flattens every line of every posted entry, joined against the chart of accounts', () => {
    const accounts = [makeAccount(), makeAccount({ id: 'acc_4000', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' })];
    const rows = buildLedgerRows([makeEntry()], accounts);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.accountId === 'acc_1000')).toMatchObject({ accountCode: '1000', accountName: 'Cash and Bank', debit: 100, credit: 0 });
    expect(rows.find((r) => r.accountId === 'acc_4000')).toMatchObject({ accountCode: '4000', accountName: 'Sales Revenue', debit: 0, credit: 100 });
  });

  it('excludes lines from entries that are not posted', () => {
    const rows = buildLedgerRows([makeEntry({ status: 'draft' })], [makeAccount()]);
    expect(rows).toHaveLength(0);
  });

  it('falls back to a placeholder when a line references an account no longer in the chart', () => {
    const rows = buildLedgerRows([makeEntry({ lines: [{ id: 'l1', accountId: 'acc_missing', debit: 50, credit: 0 }] })], []);
    expect(rows[0]).toMatchObject({ accountCode: '—', accountName: 'Unknown account' });
  });

  it('sorts newest first', () => {
    const older = makeEntry({ id: 'je_older', date: '2026-01-01T00:00:00.000Z', lines: [{ id: 'l1', accountId: 'acc_1000', debit: 10, credit: 0 }] });
    const newer = makeEntry({ id: 'je_newer', date: '2026-02-01T00:00:00.000Z', lines: [{ id: 'l1', accountId: 'acc_1000', debit: 10, credit: 0 }] });
    const rows = buildLedgerRows([older, newer], [makeAccount()]);
    expect(rows.map((r) => r.entryId)).toEqual(['je_newer', 'je_older']);
  });

  it('never computes a balance for the flat, all-accounts view', () => {
    const rows = buildLedgerRows([makeEntry()], [makeAccount()]);
    expect(rows.every((r) => r.balance === undefined)).toBe(true);
  });
});

describe('buildAccountLedgerRows', () => {
  it('reshapes an already-computed per-account ledger without altering its running balance', () => {
    const account = makeAccount();
    const ledgerRows: LedgerRow[] = [
      { entryId: 'je_1', entryNumber: 'JE-0001', date: '2026-01-05T00:00:00.000Z', debit: 100, credit: 0, runningBalance: 100 },
      { entryId: 'je_2', entryNumber: 'JE-0002', date: '2026-01-10T00:00:00.000Z', debit: 0, credit: 40, runningBalance: 60 },
    ];

    const rows = buildAccountLedgerRows(account, ledgerRows);

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.accountId === account.id && r.accountCode === account.code)).toBe(true);
    // Newest first, and the running balance is passed through untouched — not recomputed.
    expect(rows[0]).toMatchObject({ entryId: 'je_2', balance: 60 });
    expect(rows[1]).toMatchObject({ entryId: 'je_1', balance: 100 });
  });
});
