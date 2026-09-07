import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  CashFlowChart,
  GrossMarginChart,
  PerformanceChart,
  type MonthlySeriesPoint,
} from './dashboard-charts';

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
});

function series(overrides: Partial<MonthlySeriesPoint>[] = []): MonthlySeriesPoint[] {
  const base: MonthlySeriesPoint[] = [
    { month: 'Jul', revenue: 400000, grossProfit: 160000, grossMarginPercent: 40, expenses: 300000, netResult: 100000, cashIn: 420000, cashOut: 310000 },
    { month: 'Aug', revenue: 300000, grossProfit: 90000, grossMarginPercent: 30, expenses: 360000, netResult: -60000, cashIn: 280000, cashOut: 350000 },
    { month: 'Sep', revenue: 520000, grossProfit: 234000, grossMarginPercent: 45, expenses: 390000, netResult: 130000, cashIn: 500000, cashOut: 400000 },
  ];
  return base.map((point, index) => ({ ...point, ...(overrides[index] ?? {}) }));
}

const tdMatcher =
  (test: RegExp) =>
  (_content: string, element: Element | null): boolean =>
    element?.tagName === 'TD' && test.test(element.textContent ?? '');

describe('PerformanceChart', () => {
  it('separates Net result from the Revenue vs Expenses comparison', () => {
    render(<PerformanceChart data={series()} />);
    expect(screen.getByText('Net result')).toBeInTheDocument();
  });

  it('exposes a Table view over the same dataset (Revenue, Expenses, Net result)', () => {
    render(<PerformanceChart data={series()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('Revenue')).toBeInTheDocument();
    expect(within(table).getByText('Expenses')).toBeInTheDocument();
    expect(within(table).getByText('Net result')).toBeInTheDocument();
    expect(within(table).getByText('Sep')).toBeInTheDocument();
    // Aug's -R60,000 net result renders as an exact negative figure.
    expect(within(table).getAllByText(tdMatcher(/^-R\D*60\D*000/)).length).toBeGreaterThan(0);
  });

  it('carries no local time-range control (the dashboard period is global)', () => {
    render(<PerformanceChart data={series()} />);
    expect(screen.queryByRole('button', { name: /^6 months$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^12 months$/i })).not.toBeInTheDocument();
  });
});

describe('GrossMarginChart', () => {
  it('drops months with no margin and shows the rest in the table', () => {
    render(<GrossMarginChart data={series([{ grossMarginPercent: null }, {}, {}])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // header + 2 data rows (Jul dropped for its null margin)
    expect(rows).toHaveLength(3);
    expect(screen.getByText('45.0%')).toBeInTheDocument();
  });

  it('shows an empty message when no month has a margin', () => {
    render(
      <GrossMarginChart
        data={series([
          { grossMarginPercent: null },
          { grossMarginPercent: null },
          { grossMarginPercent: null },
        ])}
      />,
    );
    expect(screen.getByText(/no margin trend/i)).toBeInTheDocument();
  });
});

describe('CashFlowChart', () => {
  it('offers a Table view with Cash in / Cash out figures', () => {
    render(<CashFlowChart data={series()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('Cash in')).toBeInTheDocument();
    expect(within(table).getByText('Cash out')).toBeInTheDocument();
  });

  it('has no local 3M / 6M / 12M control', () => {
    render(<CashFlowChart data={series()} />);
    for (const label of ['3M', '6M', '12M']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});
