import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AccountingPeriod, FinancialYear } from '@/types';
import { FinancialPeriodsPage } from './FinancialPeriodsPage';
import { accountingPeriodService, financialYearService } from '../services';

vi.mock('../services', () => ({
  accountingPeriodService: {
    getPeriods: vi.fn(),
    closePeriod: vi.fn(),
    lockPeriod: vi.fn(),
    reopenPeriod: vi.fn(),
  },
  financialYearService: {
    getFinancialYears: vi.fn(),
    closeFinancialYear: vi.fn(),
  },
  SYSTEM_USER_ID: 'system',
}));

const mockedGetPeriods = accountingPeriodService.getPeriods as unknown as ReturnType<typeof vi.fn>;
const mockedClosePeriod = accountingPeriodService.closePeriod as unknown as ReturnType<typeof vi.fn>;
const mockedReopenPeriod = accountingPeriodService.reopenPeriod as unknown as ReturnType<typeof vi.fn>;
const mockedGetFinancialYears = financialYearService.getFinancialYears as unknown as ReturnType<typeof vi.fn>;

function makeYear(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: 'fy_2026',
    companyId: 'comp_001',
    name: 'FY2026',
    // A deliberately wide range so "today", whenever the test runs, always
    // falls inside it — the page derives "current" from the real clock.
    startDate: '2000-01-01T00:00:00.000Z',
    endDate: '2100-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePeriod(overrides: Partial<AccountingPeriod> = {}): AccountingPeriod {
  return {
    id: 'period_current',
    companyId: 'comp_001',
    financialYearId: 'fy_2026',
    name: 'Test Period Alpha',
    startDate: '2000-01-01T00:00:00.000Z',
    endDate: '2100-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('FinancialPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while periods are being fetched', () => {
    mockedGetFinancialYears.mockResolvedValue([makeYear()]);
    mockedGetPeriods.mockReturnValue(new Promise(() => {}));
    render(<FinancialPeriodsPage />);
    expect(screen.getByText(/loading financial periods/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetFinancialYears.mockResolvedValue([makeYear()]);
    mockedGetPeriods.mockRejectedValue(new Error('Network unreachable'));
    render(<FinancialPeriodsPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('renders the active financial year and highlights the period covering today as current', async () => {
    mockedGetFinancialYears.mockResolvedValue([makeYear()]);
    mockedGetPeriods.mockResolvedValue([makePeriod()]);
    render(<FinancialPeriodsPage />);

    expect(await screen.findByText('FY2026')).toBeInTheDocument();
    // Appears twice by design: once as the "Current period" summary tile's
    // value, once as the matching period card's own heading.
    expect(screen.getAllByText('Test Period Alpha').length).toBe(2);
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
  });

  it('closes an open period via AccountingPeriodService.closePeriod', async () => {
    mockedGetFinancialYears.mockResolvedValue([makeYear()]);
    mockedGetPeriods.mockResolvedValue([makePeriod()]);
    mockedClosePeriod.mockResolvedValue(makePeriod({ status: 'closed' }));
    render(<FinancialPeriodsPage />);

    await screen.findAllByText('Test Period Alpha');
    fireEvent.click(screen.getByRole('button', { name: /close period/i }));

    await waitFor(() => expect(mockedClosePeriod).toHaveBeenCalledWith('period_current', 'system'));
  });

  it('reopening a closed period requires a reason before it calls AccountingPeriodService.reopenPeriod', async () => {
    mockedGetFinancialYears.mockResolvedValue([makeYear()]);
    mockedGetPeriods.mockResolvedValue([makePeriod({ status: 'closed' })]);
    mockedReopenPeriod.mockResolvedValue(makePeriod({ status: 'open' }));
    render(<FinancialPeriodsPage />);

    await screen.findAllByText('Test Period Alpha');
    fireEvent.click(screen.getByRole('button', { name: /^reopen$/i }));

    const confirmButton = await screen.findByRole('button', { name: /reopen period/i });
    fireEvent.click(confirmButton);
    expect(mockedReopenPeriod).not.toHaveBeenCalled();
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Correcting a posting error' } });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockedReopenPeriod).toHaveBeenCalledWith('period_current', 'system', 'Correcting a posting error'),
    );
  });
});
