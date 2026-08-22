import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '@/types';
import { calculateIncomeStatement } from './calculateIncomeStatement';

function account(overrides: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'type' | 'normalBalance'>): Account {
  return {
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const accounts: Account[] = [
  account({ id: 'acc_1000', code: '1000', name: 'Cash and Bank', type: 'asset', normalBalance: 'debit' }),
  account({ id: 'acc_4000', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' }),
  account({ id: 'acc_5000', code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit' }),
  account({ id: 'acc_5100', code: '5100', name: 'Operating Expenses', type: 'expense', normalBalance: 'debit' }),
  account({ id: 'acc_5500', code: '5500', name: 'Income Tax Expense', type: 'expense', normalBalance: 'debit' }),
];

function entry(overrides: Partial<JournalEntry> & Pick<JournalEntry, 'id' | 'entryNumber' | 'date' | 'lines'>): JournalEntry {
  return {
    status: 'posted',
    source: 'manual',
    currency: 'ZAR',
    createdAt: overrides.date,
    updatedAt: overrides.date,
    ...overrides,
  };
}

describe('calculateIncomeStatement', () => {
  it('builds a classified P&L: Revenue -> COGS -> Gross Profit -> OpEx -> Profit Before Tax -> Income Tax -> Net Profit After Tax', () => {
    const entries: JournalEntry[] = [
      // Sale: Dr Cash 11500, Cr Sales Revenue 11500
      entry({
        id: 'je1',
        entryNumber: 'JE-0001',
        date: '2026-02-10',
        lines: [
          { id: 'je1_0', accountId: 'acc_1000', debit: 11500, credit: 0 },
          { id: 'je1_1', accountId: 'acc_4000', debit: 0, credit: 11500 },
        ],
      }),
      // COGS: Dr COGS 4000, Cr Cash 4000 (simplified, no inventory account modeled here)
      entry({
        id: 'je2',
        entryNumber: 'JE-0002',
        date: '2026-02-11',
        lines: [
          { id: 'je2_0', accountId: 'acc_5000', debit: 4000, credit: 0 },
          { id: 'je2_1', accountId: 'acc_1000', debit: 0, credit: 4000 },
        ],
      }),
      // Operating expense: Dr Operating Expenses 2000, Cr Cash 2000
      entry({
        id: 'je3',
        entryNumber: 'JE-0003',
        date: '2026-02-12',
        lines: [
          { id: 'je3_0', accountId: 'acc_5100', debit: 2000, credit: 0 },
          { id: 'je3_1', accountId: 'acc_1000', debit: 0, credit: 2000 },
        ],
      }),
      // Income tax expense: Dr Income Tax Expense 1500, Cr Cash 1500
      entry({
        id: 'je4',
        entryNumber: 'JE-0004',
        date: '2026-02-13',
        lines: [
          { id: 'je4_0', accountId: 'acc_5500', debit: 1500, credit: 0 },
          { id: 'je4_1', accountId: 'acc_1000', debit: 0, credit: 1500 },
        ],
      }),
    ];

    const statement = calculateIncomeStatement(entries, accounts, '2026-01-01', '2026-12-31');

    expect(statement.revenueTotal).toBe(11500);
    expect(statement.costOfGoodsSoldTotal).toBe(4000);
    expect(statement.grossProfit).toBe(7500);
    expect(statement.operatingExpenseTotal).toBe(2000);
    expect(statement.profitBeforeTax).toBe(5500);
    expect(statement.incomeTaxExpenseTotal).toBe(1500);
    expect(statement.netProfitAfterTax).toBe(4000);

    expect(statement.revenueLines).toEqual([{ accountId: 'acc_4000', code: '4000', name: 'Sales Revenue', amount: 11500 }]);
    expect(statement.costOfGoodsSoldLines).toEqual([
      { accountId: 'acc_5000', code: '5000', name: 'Cost of Goods Sold', amount: 4000 },
    ]);
    expect(statement.incomeTaxExpenseLines).toEqual([
      { accountId: 'acc_5500', code: '5500', name: 'Income Tax Expense', amount: 1500 },
    ]);
  });

  it('a reversal entry nets its original back out to zero automatically, with no special-casing', () => {
    const original = entry({
      id: 'je10',
      entryNumber: 'JE-0010',
      date: '2026-03-01',
      lines: [
        { id: 'je10_0', accountId: 'acc_1000', debit: 5000, credit: 0 },
        { id: 'je10_1', accountId: 'acc_4000', debit: 0, credit: 5000 },
      ],
    });
    // Reversal: debit/credit swapped from the original, same as
    // journalEntryService.reverseJournalEntry() produces.
    const reversal = entry({
      id: 'je11',
      entryNumber: 'JE-0011',
      date: '2026-03-02',
      reversalOfEntryId: 'je10',
      lines: [
        { id: 'je11_0', accountId: 'acc_1000', debit: 0, credit: 5000 },
        { id: 'je11_1', accountId: 'acc_4000', debit: 5000, credit: 0 },
      ],
    });

    const statement = calculateIncomeStatement([original, reversal], accounts, '2026-01-01', '2026-12-31');

    expect(statement.revenueTotal).toBe(0);
    expect(statement.revenueLines).toEqual([]);
    expect(statement.netProfitAfterTax).toBe(0);
  });

  it('excludes entries dated outside the requested range', () => {
    const entries: JournalEntry[] = [
      entry({
        id: 'je20',
        entryNumber: 'JE-0020',
        date: '2025-12-31',
        lines: [
          { id: 'je20_0', accountId: 'acc_1000', debit: 1000, credit: 0 },
          { id: 'je20_1', accountId: 'acc_4000', debit: 0, credit: 1000 },
        ],
      }),
      entry({
        id: 'je21',
        entryNumber: 'JE-0021',
        date: '2026-06-15',
        lines: [
          { id: 'je21_0', accountId: 'acc_1000', debit: 2000, credit: 0 },
          { id: 'je21_1', accountId: 'acc_4000', debit: 0, credit: 2000 },
        ],
      }),
    ];

    const statement = calculateIncomeStatement(entries, accounts, '2026-01-01', '2026-12-31');

    expect(statement.revenueTotal).toBe(2000);
  });

  it('ignores non-posted (draft/reversed-marker) entries', () => {
    const draft: JournalEntry = {
      ...entry({
        id: 'je30',
        entryNumber: 'JE-0030',
        date: '2026-05-01',
        lines: [
          { id: 'je30_0', accountId: 'acc_1000', debit: 999, credit: 0 },
          { id: 'je30_1', accountId: 'acc_4000', debit: 0, credit: 999 },
        ],
      }),
      status: 'draft',
    };

    const statement = calculateIncomeStatement([draft], accounts, '2026-01-01', '2026-12-31');

    expect(statement.revenueTotal).toBe(0);
  });
});
