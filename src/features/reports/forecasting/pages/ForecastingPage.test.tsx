import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, FinancialPlanLine, JournalEntry } from '@/types';
import { ForecastingPage } from './ForecastingPage';

vi.mock('@/features/reports/financialStatements/hooks/useFinancialStatementsData');
vi.mock('../hooks/useFinancialPlanLines');
vi.mock('../hooks/useFinancialPlanMutations');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/features/admin/hooks/useCompany', () => ({ useCompany: () => ({ company: undefined, loading: false }) }));

import { useFinancialStatementsData } from '@/features/reports/financialStatements/hooks/useFinancialStatementsData';
import { useFinancialPlanLines } from '../hooks/useFinancialPlanLines';
import { useFinancialPlanMutations } from '../hooks/useFinancialPlanMutations';

const officeSupplies: Account = {
  id: 'acc_office', code: '6100', name: 'Office Supplies', type: 'expense', normalBalance: 'debit',
  isActive: true, createdAt: '', updatedAt: '',
};

function thisMonthISO(day: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day)).toISOString();
}

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_1', entryNumber: 'JE-0001', date: thisMonthISO(15), status: 'posted', source: 'bill',
    lines: [{ id: 'l1', accountId: 'acc_office', debit: 52500, credit: 0 }],
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function planLine(overrides: Partial<FinancialPlanLine> = {}): FinancialPlanLine {
  const now = new Date();
  return {
    id: 'fpl_1', planType: 'budget', accountId: 'acc_office', periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1, amount: 40000,
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const upsertPlanLine = vi.fn();

beforeEach(() => {
  upsertPlanLine.mockReset().mockResolvedValue(planLine());
  vi.mocked(useFinancialStatementsData).mockReturnValue({
    accounts: [officeSupplies], entries: [entry()], financialYears: [], loading: false, error: null, refetch: vi.fn(),
  } as never);
  vi.mocked(useFinancialPlanLines).mockReturnValue({
    budgetLines: [planLine()], forecastLines: [], loading: false, error: null, refetch: vi.fn(),
  } as never);
  vi.mocked(useFinancialPlanMutations).mockReturnValue({ upsertPlanLine, isLoading: false, error: null } as never);
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <ForecastingPage />
    </MemoryRouter>,
  );
}

describe('ForecastingPage', () => {
  it('shows the account row with Budget/Actual/Variance from the real calculation, not a fabricated number', () => {
    renderPage();
    expect(screen.getByText(/6100 — Office Supplies/)).toBeInTheDocument();
    // 52,500 actual vs 40,000 budget = 12,500 unfavourable variance, matching the docs worked example
    // (en-ZA formatting: space thousands separator, comma decimal — "12 500,00")
    expect(screen.getAllByText(/12[ ,]500/).length).toBeGreaterThan(0);
  });

  it('renders a deterministic executive summary sentence referencing the real totals', () => {
    renderPage();
    expect(screen.getByText(/total Actual net movement/)).toBeInTheDocument();
  });

  it('opens the variance drill-down on row click, showing evidence grouped by source with no fabricated explanation', () => {
    renderPage();
    fireEvent.click(screen.getByText(/6100 — Office Supplies/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/1 posted journal line/)).toBeInTheDocument();
    expect(screen.getByText(/bill/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'JE-0001' })).toHaveAttribute('href', '/accounting/journals/je_1');
  });

  it('switching the month range to 12 months does not crash and keeps the table populated', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '12 months' }));
    expect(screen.getByText(/6100 — Office Supplies/)).toBeInTheDocument();
  });

  it('the quick-entry form saves a plan line via the mutation hook', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '45000' } });
    // Account picker: base-ui SearchableSelect — select the seeded account.
    fireEvent.click(screen.getByLabelText('Account'));
    const option = await screen.findByRole('option', { name: /6100 — Office Supplies/ });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(upsertPlanLine).toHaveBeenCalledWith(expect.objectContaining({ planType: 'budget', accountId: 'acc_office', amount: 45000 }));
  });

  it('shows a loading state while data is being fetched', () => {
    vi.mocked(useFinancialStatementsData).mockReturnValue({ accounts: [], entries: [], financialYears: [], loading: true, error: null, refetch: vi.fn() } as never);
    renderPage();
    expect(screen.getByText(/loading forecasting data/i)).toBeInTheDocument();
  });
});
