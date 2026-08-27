import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, FinancialYear, JournalEntry } from '@/types';
import { BalanceSheetPage } from './BalanceSheetPage';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/balance-sheet']}>
      <BalanceSheetPage />
    </MemoryRouter>,
  );
}

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
    id: 'acc_1000',
    code: '1000',
    name: 'Cash and Bank',
    type: 'asset',
    subType: 'current_asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc_3000',
    code: '3000',
    name: "Owner's Equity",
    type: 'equity',
    normalBalance: 'credit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
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
];

// Opening balance 10000 (Owner's Equity) + a 5000 sale -> Cash 15000,
// Owner's Equity 10000, Current Year Earnings 5000 -> Total Equity 15000.
// Assets (15000) == Liabilities (0) + Equity (15000): balanced by construction.
const entries: JournalEntry[] = [
  {
    id: 'je1',
    entryNumber: 'JE-0001',
    date: '2026-01-01T00:00:00.000Z',
    lines: [
      { id: 'je1_0', accountId: 'acc_1000', debit: 10000, credit: 0 },
      { id: 'je1_1', accountId: 'acc_3000', debit: 0, credit: 10000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'je2',
    entryNumber: 'JE-0002',
    date: '2026-02-01T00:00:00.000Z',
    lines: [
      { id: 'je2_0', accountId: 'acc_1000', debit: 5000, credit: 0 },
      { id: 'je2_1', accountId: 'acc_4000', debit: 0, credit: 5000 },
    ],
    status: 'posted',
    source: 'manual',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

describe('BalanceSheetPage', () => {
  it('shows a loading state', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts: [],
      entries: [],
      financialYears: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts: [],
      entries: [],
      financialYears: [],
      loading: false,
      error: new Error('boom'),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders a balanced sheet where Assets = Liabilities + Equity', () => {
    mockedUseFinancialStatementsData.mockReturnValue({
      accounts,
      entries,
      financialYears,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Balance sheet' })).toBeInTheDocument();
    expect(screen.getByText(/Cash and Bank/)).toBeInTheDocument();
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('Total Equity')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();

    // Two "Total Assets"-equal rows share the same figure (Total Assets and
    // Total Liabilities + Equity) — assert it renders at least once.
    // Locale-agnostic regex (en-ZA formatCurrency) rather than an exact string.
    expect(screen.getAllByText(/15.?000,00/).length).toBeGreaterThanOrEqual(1);
  });
});
