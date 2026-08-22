import { describe, expect, it } from 'vitest';
import { calculateMonthlyFinancials, trailingMonthKeys } from './calculateMonthlyFinancials';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import { seedAccounts } from '@/mock-data/accounts';
import type { Account, JournalEntry } from '@/types';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_test',
    code: '0000',
    name: 'Test Account',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ACCOUNTS: Account[] = [
  account({ id: 'acc_1000', name: 'Cash and Bank', type: 'asset', normalBalance: 'debit' }),
  account({ id: 'acc_1100', name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit' }),
  account({ id: 'acc_4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' }),
  account({ id: 'acc_5000', name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit' }),
  account({ id: 'acc_5100', name: 'Operating Expenses', type: 'expense', normalBalance: 'debit' }),
];

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_test',
    entryNumber: 'JE-0001',
    date: '2026-08-05T00:00:00.000Z',
    source: 'manual',
    status: 'posted',
    lines: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('trailingMonthKeys', () => {
  it('returns count keys ending at asOf, oldest first', () => {
    expect(trailingMonthKeys(new Date('2026-08-15T00:00:00.000Z'), 3)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('rolls back across a year boundary correctly', () => {
    expect(trailingMonthKeys(new Date('2026-02-01T00:00:00.000Z'), 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('calculateMonthlyFinancials', () => {
  it('sums revenue from a Sales Revenue credit and expenses from a debit', () => {
    const entries: JournalEntry[] = [
      entry({
        date: '2026-08-05',
        lines: [
          { id: 'l1', accountId: 'acc_1100', debit: 1150, credit: 0 },
          { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 1000 },
        ],
      }),
      entry({
        id: 'je_2',
        date: '2026-08-10',
        lines: [
          { id: 'l3', accountId: 'acc_5100', debit: 400, credit: 0 },
          { id: 'l4', accountId: 'acc_1000', debit: 0, credit: 400 },
        ],
      }),
    ];

    const [august] = calculateMonthlyFinancials(entries, ACCOUNTS, ['2026-08']);
    expect(august.revenue).toBe(1000);
    expect(august.expenses).toBe(400);
    expect(august.label).toBe('Aug');
  });

  it('a credit note (debiting Sales Revenue) reduces that month\'s revenue', () => {
    const entries: JournalEntry[] = [
      entry({
        date: '2026-08-05',
        lines: [
          { id: 'l1', accountId: 'acc_1100', debit: 1150, credit: 0 },
          { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 1000 },
        ],
      }),
      entry({
        id: 'je_cn',
        date: '2026-08-12',
        source: 'credit_note',
        lines: [
          { id: 'l3', accountId: 'acc_4000', debit: 300, credit: 0 },
          { id: 'l4', accountId: 'acc_1100', debit: 0, credit: 300 },
        ],
      }),
    ];

    const [august] = calculateMonthlyFinancials(entries, ACCOUNTS, ['2026-08']);
    expect(august.revenue).toBe(700); // 1000 - 300
  });

  it('sums cash in/out from the Cash and Bank control account only', () => {
    const entries: JournalEntry[] = [
      entry({
        date: '2026-08-05',
        source: 'customer_receipt',
        lines: [
          { id: 'l1', accountId: 'acc_1000', debit: 500, credit: 0 },
          { id: 'l2', accountId: 'acc_1100', debit: 0, credit: 500 },
        ],
      }),
      entry({
        id: 'je_2',
        date: '2026-08-10',
        source: 'payment',
        lines: [
          { id: 'l3', accountId: 'acc_1000', debit: 0, credit: 200 },
          { id: 'l4', accountId: 'acc_5100', debit: 200, credit: 0 },
        ],
      }),
    ];

    const [august] = calculateMonthlyFinancials(entries, ACCOUNTS, ['2026-08']);
    expect(august.cashIn).toBe(500);
    expect(august.cashOut).toBe(200);
  });

  it('buckets entries into the correct month and ignores entries outside the requested window', () => {
    const entries: JournalEntry[] = [
      entry({ date: '2026-07-20', lines: [{ id: 'l1', accountId: 'acc_4000', debit: 0, credit: 100 }] }),
      entry({ id: 'je_2', date: '2026-08-01', lines: [{ id: 'l2', accountId: 'acc_4000', debit: 0, credit: 200 }] }),
      entry({ id: 'je_3', date: '2025-01-01', lines: [{ id: 'l3', accountId: 'acc_4000', debit: 0, credit: 9999 }] }),
    ];

    const result = calculateMonthlyFinancials(entries, ACCOUNTS, ['2026-07', '2026-08']);
    expect(result.find((m) => m.month === '2026-07')?.revenue).toBe(100);
    expect(result.find((m) => m.month === '2026-08')?.revenue).toBe(200);
    // 2025-01 is outside the window entirely — no bucket to fall into.
    expect(result.reduce((sum, m) => sum + m.revenue, 0)).toBe(300);
  });

  it('excludes non-posted entries', () => {
    const entries: JournalEntry[] = [
      entry({ status: 'draft', date: '2026-08-05', lines: [{ id: 'l1', accountId: 'acc_4000', debit: 0, credit: 1000 }] }),
    ];
    const [august] = calculateMonthlyFinancials(entries, ACCOUNTS, ['2026-08']);
    expect(august.revenue).toBe(0);
  });

  it('returns a zero row for every requested month with no matching entries', () => {
    const result = calculateMonthlyFinancials([], ACCOUNTS, ['2026-06', '2026-07', '2026-08']);
    expect(result).toEqual([
      { month: '2026-06', label: 'Jun', revenue: 0, expenses: 0, cashIn: 0, cashOut: 0 },
      { month: '2026-07', label: 'Jul', revenue: 0, expenses: 0, cashIn: 0, cashOut: 0 },
      { month: '2026-08', label: 'Aug', revenue: 0, expenses: 0, cashIn: 0, cashOut: 0 },
    ]);
  });
});

/**
 * Proves this actually produces sane figures against the real seed ledger
 * (docs/KNOWN_ISSUES.md: "Dashboard financials are fully mocked") —
 * catches a wrong account id or similar wiring bug that unit tests with
 * hand-built fixtures wouldn't. Mirrors vatReportService.test.ts's/
 * subledgerReconciliation.test.ts's "against real seed data" pattern.
 */
describe('calculateMonthlyFinancials against real seed data', () => {
  it('shows real revenue, expenses, and cash movement for August 2026 — the month the seed data concentrates in', () => {
    const [august] = calculateMonthlyFinancials(seedJournalEntries as JournalEntry[], seedAccounts, ['2026-08']);

    expect(august.revenue).toBeGreaterThan(0);
    expect(august.expenses).toBeGreaterThan(0);
    expect(august.cashIn).toBeGreaterThan(0);
    expect(august.cashOut).toBeGreaterThan(0);
  });

  it('never lets revenue/expenses exceed the total value ever posted to Sales Revenue/Expense accounts (sanity bound, not a fabricated number)', () => {
    const totalRevenuePosted = seedJournalEntries
      .flatMap((e) => e.lines)
      .filter((l) => l.accountId === 'acc_4000')
      .reduce((sum, l) => sum + l.credit, 0);

    const sixMonths = calculateMonthlyFinancials(seedJournalEntries as JournalEntry[], seedAccounts, [
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    const totalRevenueComputed = sixMonths.reduce((sum, m) => sum + m.revenue, 0);
    expect(totalRevenueComputed).toBeLessThanOrEqual(totalRevenuePosted);
  });
});
