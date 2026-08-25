import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Account, FinancialYear, JournalEntry } from '@/types';
import { IncomeStatementPage } from './IncomeStatementPage';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';

vi.mock('../hooks/useFinancialStatementsData', () => ({
  useFinancialStatementsData: vi.fn(),
}));

const mockedUseFinancialStatementsData = useFinancialStatementsData as unknown as ReturnType<typeof vi.fn>;

const financialYears: FinancialYear[] = [
  {
    id: 'fy_2026',
    companyId: 'comp_001',
    name: 'FY2026',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const accounts: Account[] = [
  {
    id: 'acc_4000',
    code: '4000',
    name: 'Sales Revenue',
    type: 'revenue',
    normalBalance: 'credit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc_5000',
    code: '5000',
    name: 'Cost of Goods Sold',
    type: 'expense',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc_5100',
    code: '5100',
    name: 'Operating Expenses',
    type: 'expense',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc_5500',
    code: '5500',
    name: 'Income Tax Expense',
    type: 'expense',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// Revenue 10000, COGS 3000 -> Gross Profit 7000, OpEx 2000 -> Profit Before
// Tax 5000, Income Tax 1000 -> Net Profit After Tax 4000. Every intermediate
// total is a distinct number so text assertions below are unambiguous.
const entries: JournalEntry[] = [
  {
    id: 'je1',
    entryNumber: 'JE-0001',
    date: '2026-03-01T00:00:00.000Z',
    lines: [
      { id: 'je1_0', accountId: 'acc_1000', debit: 10000, credit: 0 },
      { id: 'je1_1', accountId: 'acc_4000', debit: 0, credit: 10000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'je2',
    entryNumber: 'JE-0002',
    date: '2026-03-02T00:00:00.000Z',
    lines: [
      { id: 'je2_0', accountId: 'acc_5000', debit: 3000, credit: 0 },
      { id: 'je2_1', accountId: 'acc_1000', debit: 0, credit: 3000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
  },
  {
    id: 'je3',
    entryNumber: 'JE-0003',
    date: '2026-03-03T00:00:00.000Z',
    lines: [
      { id: 'je3_0', accountId: 'acc_5100', debit: 2000, credit: 0 },
      { id: 'je3_1', accountId: 'acc_1000', debit: 0, credit: 2000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-03-03T00:00:00.000Z',
  },
  {
    id: 'je4',
    entryNumber: 'JE-0004',
    date: '2026-03-04T00:00:00.000Z',
    lines: [
      { id: 'je4_0', accountId: 'acc_5500', debit: 1000, credit: 0 },
      { id: 'je4_1', accountId: 'acc_1000', debit: 0, credit: 1000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z',
  },
];

describe('IncomeStatementPage', () => {
  it('shows a loading state', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts: [],
      entries: [],
      financialYears: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncomeStatementPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts: [],
      entries: [],
      financialYears: [],
      loading: false,
      error: new Error('boom'),
      refetch,
    });

    render(<IncomeStatementPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows an empty state when there are no financial years', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts: [],
      entries: [],
      financialYears: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncomeStatementPage />);
    expect(screen.getByText('No financial years yet')).toBeInTheDocument();
  });

  it('renders a classified P&L for the default (latest) financial year', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts,
      entries,
      financialYears,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncomeStatementPage />);

    expect(screen.getByRole('heading', { name: 'Income statement' })).toBeInTheDocument();
    expect(screen.getByText(/Sales Revenue/)).toBeInTheDocument();
    expect(screen.getByText('Net Profit After Tax')).toBeInTheDocument();

    // Revenue 10000 -> COGS 3000 -> Gross Profit 7000 -> OpEx 2000 ->
    // Profit Before Tax 5000 -> Income Tax 1000 -> Net Profit After Tax 4000.
    // Expense/deduction rows are distinguished by section header and
    // indentation, not a negated value or a "+" sign (v0's own statement
    // convention, M9) — each single-account category's line item and its
    // category total render the same figure twice; Gross/Pre-Tax/Net Profit
    // are aggregate-only rows and render once. `Amount`'s `statement` mode
    // (formatStatementAmount) has no currency symbol, just a locale-agnostic
    // grouped/decimal number, anchored to the whole element text (each
    // figure is its own DOM node, so there's no risk of one number's regex
    // matching inside a different, larger rendered number).
    expect(screen.getAllByText(/^10.?000,00$/)).toHaveLength(2);
    expect(screen.getAllByText(/^3.?000,00$/)).toHaveLength(2);
    expect(screen.getByText(/^7.?000,00$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^2.?000,00$/)).toHaveLength(2);
    expect(screen.getByText(/^5.?000,00$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^1.?000,00$/)).toHaveLength(2);
    expect(screen.getByText(/^4.?000,00$/)).toBeInTheDocument();
  });
});
