import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { useDashboardData, type DashboardData } from '../hooks/useDashboardData';

vi.mock('../hooks/useDashboardData');

const mockedUseDashboardData = vi.mocked(useDashboardData);

beforeAll(() => {
  // Recharts' ResponsiveContainer requires ResizeObserver, which jsdom
  // does not implement.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    kpis: {
      revenue: { label: 'Revenue', value: 512700, trendPercent: 4.8 },
      expenses: { label: 'Expenses', value: 384900, trendPercent: 3.4 },
      netProfit: { label: 'Net Profit', value: 127800, trendPercent: 9.1 },
      cashPosition: { label: 'Cash Position', value: 250000, trendPercent: -1.2 },
    },
    arAging: { current: 1000, bucket30: 500, bucket60: 200, bucket90Plus: 100, total: 1800 },
    apAging: { current: 800, bucket30: 300, bucket60: 100, bucket90Plus: 50, total: 1250 },
    inventoryValuation: 75000,
    activity: [
      {
        id: 'customer_c1',
        icon: 'customers',
        title: 'Acme Trading Co.',
        description: 'New customer added',
        timestamp: new Date().toISOString(),
      },
    ],
    monthlyFinancials: [
      { month: '2026-08', label: 'Aug', revenue: 512700, expenses: 384900, cashIn: 493100, cashOut: 391200 },
    ],
    cashFlowSeries: [{ label: 'Aug', netCashFlow: 101900, cumulativeCash: 101900 }],
    hasAnyData: true,
    ...overrides,
  };
}

describe('DashboardPage', () => {
  it('shows a loading state while fetching', () => {
    mockedUseDashboardData.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument();
  });

  it('shows an error state with retry when the fetch fails', () => {
    mockedUseDashboardData.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Network unavailable'),
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/network unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows an empty state when there is no business data at all', () => {
    mockedUseDashboardData.mockReturnValue({
      data: baseData({
        arAging: { current: 0, bucket30: 0, bucket60: 0, bucket90Plus: 0, total: 0 },
        apAging: { current: 0, bucket30: 0, bucket60: 0, bucket90Plus: 0, total: 0 },
        inventoryValuation: 0,
        activity: [],
        hasAnyData: false,
      }),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it('renders KPIs, charts, aging widgets, and activity feed once data loads', () => {
    mockedUseDashboardData.mockReturnValue({ data: baseData(), loading: false, error: null, refetch: vi.fn() });
    renderPage();

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getByText('Cash Position')).toBeInTheDocument();
    expect(screen.getByText('Revenue and expenses')).toBeInTheDocument();
    expect(screen.getByText('Cash movement')).toBeInTheDocument();
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument();
    expect(screen.getByText('Accounts Payable')).toBeInTheDocument();
    expect(screen.getByText('Inventory Valuation')).toBeInTheDocument();
    expect(screen.getByText('Acme Trading Co.')).toBeInTheDocument();
  });
});
