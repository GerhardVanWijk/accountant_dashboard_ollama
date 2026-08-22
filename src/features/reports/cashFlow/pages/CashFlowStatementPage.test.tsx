import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FinancialYear } from '@/types';
import { CashFlowStatementPage } from './CashFlowStatementPage';
import { useCashFlowStatement } from '../hooks/useCashFlowStatement';
import type { CashFlowStatement } from '../services';

vi.mock('../hooks/useCashFlowStatement', () => ({
  useCashFlowStatement: vi.fn(),
}));

const mockedUseCashFlowStatement = useCashFlowStatement as unknown as ReturnType<typeof vi.fn>;

function makeFinancialYear(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: 'fy_2026',
    companyId: 'comp_001',
    name: 'FY2026',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeStatement(overrides: Partial<CashFlowStatement> = {}): CashFlowStatement {
  return {
    period: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' },
    netProfit: 12000,
    operating: { items: [{ label: 'Net Profit', amount: 12000 }], total: 4000 },
    investing: { items: [{ label: 'Purchase of Fixed Assets', amount: -12000 }], total: -8000 },
    financing: { items: [{ label: "Owner's Equity Movement (Contributions / Drawings)", amount: 100000 }], total: 98000 },
    netCashMovement: 94000,
    actualCashMovement: 94000,
    variance: 0,
    reconciles: true,
    ...overrides,
  };
}

function baseHookValue(overrides: Partial<ReturnType<typeof useCashFlowStatement>> = {}) {
  return {
    financialYears: [makeFinancialYear()],
    statement: makeStatement(),
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('CashFlowStatementPage', () => {
  it('shows a loading state', () => {
    mockedUseCashFlowStatement.mockReturnValue(baseHookValue({ loading: true, statement: undefined }));
    render(<CashFlowStatementPage />);
    expect(screen.getByText(/Loading cash flow statement/i)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockedUseCashFlowStatement.mockReturnValue(
      baseHookValue({ error: new Error('boom'), statement: undefined }),
    );
    render(<CashFlowStatementPage />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('shows an empty state when there are no financial years', () => {
    mockedUseCashFlowStatement.mockReturnValue(baseHookValue({ financialYears: [], statement: undefined }));
    render(<CashFlowStatementPage />);
    expect(screen.getByText(/No financial years yet/i)).toBeInTheDocument();
  });

  it('renders the classified sections and the reconciliation check when data is loaded', () => {
    mockedUseCashFlowStatement.mockReturnValue(baseHookValue());
    render(<CashFlowStatementPage />);
    expect(screen.getByText('Statement of Cash Flows')).toBeInTheDocument();
    expect(screen.getByText('Operating Activities')).toBeInTheDocument();
    expect(screen.getByText('Investing Activities')).toBeInTheDocument();
    expect(screen.getByText('Financing Activities')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation Check')).toBeInTheDocument();
    expect(screen.getByText(/Reconciles to actual cash movement/i)).toBeInTheDocument();
  });

  it('surfaces a non-reconciling statement instead of hiding it', () => {
    mockedUseCashFlowStatement.mockReturnValue(
      baseHookValue({ statement: makeStatement({ reconciles: false, variance: 2000 }) }),
    );
    render(<CashFlowStatementPage />);
    expect(screen.getByText(/Does not reconcile — investigate/i)).toBeInTheDocument();
  });
});
