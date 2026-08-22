import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '@/types';
import { calculateBalanceSheet } from './calculateBalanceSheet';

function account(overrides: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'type' | 'normalBalance'>): Account {
  return {
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const accounts: Account[] = [
  account({ id: 'acc_1000', code: '1000', name: 'Cash and Bank', type: 'asset', subType: 'current_asset', normalBalance: 'debit' }),
  account({ id: 'acc_1100', code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'current_asset', normalBalance: 'debit' }),
  account({ id: 'acc_1500', code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'non_current_asset', normalBalance: 'debit' }),
  account({
    id: 'acc_1590',
    code: '1590',
    name: 'Accumulated Depreciation',
    type: 'asset',
    subType: 'contra_asset',
    normalBalance: 'credit',
  }),
  account({ id: 'acc_2000', code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current_liability', normalBalance: 'credit' }),
  account({ id: 'acc_3000', code: '3000', name: "Owner's Equity", type: 'equity', normalBalance: 'credit' }),
  account({ id: 'acc_3900', code: '3900', name: 'Retained Earnings', type: 'equity', normalBalance: 'credit' }),
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

describe('calculateBalanceSheet', () => {
  it('holds Assets = Liabilities + Equity against a realistic set of posted entries (prior-year opening balance + current-year trading)', () => {
    const entries: JournalEntry[] = [
      // Opening balance, prior year: Dr Cash 100000, Cr Owner's Equity 100000
      entry({
        id: 'je1',
        entryNumber: 'JE-0001',
        date: '2025-01-01',
        lines: [
          { id: 'je1_0', accountId: 'acc_1000', debit: 100000, credit: 0 },
          { id: 'je1_1', accountId: 'acc_3000', debit: 0, credit: 100000 },
        ],
      }),
      // Fixed asset purchase, prior year: Dr Fixed Assets 20000, Cr Cash 20000
      entry({
        id: 'je2',
        entryNumber: 'JE-0002',
        date: '2025-03-01',
        lines: [
          { id: 'je2_0', accountId: 'acc_1500', debit: 20000, credit: 0 },
          { id: 'je2_1', accountId: 'acc_1000', debit: 0, credit: 20000 },
        ],
      }),
      // Depreciation, current year: Dr Operating Expenses 2000, Cr Accumulated Depreciation 2000.
      // Dated inside the current FinancialYear window on purpose — this app
      // has no year-end closing journal (financialYearService's doc
      // comment), so a P&L-affecting entry dated in an unclosed PRIOR year
      // would never make it into Retained Earnings OR Current Year
      // Earnings, breaking Assets = Liabilities + Equity through no fault
      // of the Balance Sheet math itself. Real usage of this app must close
      // out prior years' P&L accounts before a new one starts trading;
      // until that exists, every revenue/expense posting has to land inside
      // the FinancialYear window being reported on.
      entry({
        id: 'je3',
        entryNumber: 'JE-0003',
        date: '2026-01-15',
        lines: [
          { id: 'je3_0', accountId: 'acc_5100', debit: 2000, credit: 0 },
          { id: 'je3_1', accountId: 'acc_1590', debit: 0, credit: 2000 },
        ],
      }),
      // Sale on credit, current year: Dr Accounts Receivable 11500, Cr Sales Revenue 11500
      entry({
        id: 'je4',
        entryNumber: 'JE-0004',
        date: '2026-02-10',
        lines: [
          { id: 'je4_0', accountId: 'acc_1100', debit: 11500, credit: 0 },
          { id: 'je4_1', accountId: 'acc_4000', debit: 0, credit: 11500 },
        ],
      }),
      // COGS, current year: Dr COGS 4000, Cr Cash 4000
      entry({
        id: 'je5',
        entryNumber: 'JE-0005',
        date: '2026-02-11',
        lines: [
          { id: 'je5_0', accountId: 'acc_5000', debit: 4000, credit: 0 },
          { id: 'je5_1', accountId: 'acc_1000', debit: 0, credit: 4000 },
        ],
      }),
      // Bill on credit, current year: Dr Operating Expenses 1500, Cr Accounts Payable 1500
      entry({
        id: 'je6',
        entryNumber: 'JE-0006',
        date: '2026-03-01',
        lines: [
          { id: 'je6_0', accountId: 'acc_5100', debit: 1500, credit: 0 },
          { id: 'je6_1', accountId: 'acc_2000', debit: 0, credit: 1500 },
        ],
      }),
      // Income tax expense accrual, current year: Dr Income Tax Expense 900, Cr Cash 900
      entry({
        id: 'je7',
        entryNumber: 'JE-0007',
        date: '2026-03-15',
        lines: [
          { id: 'je7_0', accountId: 'acc_5500', debit: 900, credit: 0 },
          { id: 'je7_1', accountId: 'acc_1000', debit: 0, credit: 900 },
        ],
      }),
    ];

    const balanceSheet = calculateBalanceSheet(entries, accounts, '2026-06-30', '2026-01-01');

    // Cash: 100000 - 20000 - 4000 - 900 = 75100
    // Accounts Receivable: 11500
    // Fixed Assets: 20000, Accumulated Depreciation: 2000 (contra)
    expect(balanceSheet.totalAssets).toBeCloseTo(75100 + 11500 + 20000 - 2000, 8);
    expect(balanceSheet.totalLiabilities).toBeCloseTo(1500, 8);
    expect(balanceSheet.ownersEquity).toBeCloseTo(100000, 8);
    expect(balanceSheet.retainedEarnings).toBe(0);
    // Current year earnings (2026-01-01 -> 2026-06-30):
    // 11500 revenue - 4000 COGS - (2000 depreciation + 1500 bill) opex - 900 tax = 3100
    expect(balanceSheet.currentYearEarnings).toBeCloseTo(3100, 8);
    expect(balanceSheet.totalEquity).toBeCloseTo(100000 + 3100, 8);

    // The identity that must always hold, by construction.
    expect(balanceSheet.totalAssets).toBeCloseTo(balanceSheet.totalLiabilitiesAndEquity, 8);
    expect(balanceSheet.isBalanced).toBe(true);
    expect(balanceSheet.difference).toBeCloseTo(0, 8);
  });

  it('nets a contra-asset account against its paired asset rather than adding it', () => {
    const entries: JournalEntry[] = [
      entry({
        id: 'je1',
        entryNumber: 'JE-0001',
        date: '2026-01-01',
        lines: [
          { id: 'je1_0', accountId: 'acc_1500', debit: 50000, credit: 0 },
          { id: 'je1_1', accountId: 'acc_3000', debit: 0, credit: 50000 },
        ],
      }),
      entry({
        id: 'je2',
        entryNumber: 'JE-0002',
        date: '2026-06-01',
        lines: [
          { id: 'je2_0', accountId: 'acc_5100', debit: 8000, credit: 0 },
          { id: 'je2_1', accountId: 'acc_1590', debit: 0, credit: 8000 },
        ],
      }),
    ];

    const balanceSheet = calculateBalanceSheet(entries, accounts, '2026-12-31', '2026-01-01');

    expect(balanceSheet.assetLines.find((l) => l.accountId === 'acc_1500')?.amount).toBe(50000);
    expect(balanceSheet.contraAssetLines.find((l) => l.accountId === 'acc_1590')?.amount).toBe(8000);
    // Net carrying value: 50000 - 8000 = 42000
    expect(balanceSheet.totalAssets).toBe(42000);
    expect(balanceSheet.isBalanced).toBe(true);
  });

  it('excludes entries dated after the as-of date', () => {
    const entries: JournalEntry[] = [
      entry({
        id: 'je1',
        entryNumber: 'JE-0001',
        date: '2026-01-01',
        lines: [
          { id: 'je1_0', accountId: 'acc_1000', debit: 1000, credit: 0 },
          { id: 'je1_1', accountId: 'acc_3000', debit: 0, credit: 1000 },
        ],
      }),
      entry({
        id: 'je2',
        entryNumber: 'JE-0002',
        date: '2026-07-01',
        lines: [
          { id: 'je2_0', accountId: 'acc_1000', debit: 500, credit: 0 },
          { id: 'je2_1', accountId: 'acc_3000', debit: 0, credit: 500 },
        ],
      }),
    ];

    const balanceSheet = calculateBalanceSheet(entries, accounts, '2026-06-30', '2026-01-01');

    expect(balanceSheet.totalAssets).toBe(1000);
    expect(balanceSheet.isBalanced).toBe(true);
  });
});
