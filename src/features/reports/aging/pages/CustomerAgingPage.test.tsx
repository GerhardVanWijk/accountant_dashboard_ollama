import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerAgingPage } from './CustomerAgingPage';
import { getCustomerAgingReport } from '../services/customerAgingReportService';
import type { AgingReportRow } from '../types';

vi.mock('../services/customerAgingReportService', () => ({
  getCustomerAgingReport: vi.fn(),
}));

const mockedGetReport = getCustomerAgingReport as unknown as ReturnType<typeof vi.fn>;

function makeRow(overrides: Partial<AgingReportRow> = {}): AgingReportRow {
  return {
    id: 'cust_1',
    name: 'Acme Trading Co.',
    buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 },
    ...overrides,
  };
}

describe('CustomerAgingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the report is being computed', () => {
    mockedGetReport.mockReturnValue(new Promise(() => {}));
    render(<CustomerAgingPage />);
    expect(screen.getByText(/computing customer aging/i)).toBeInTheDocument();
  });

  it('shows an error state when the report fails to load', async () => {
    mockedGetReport.mockRejectedValue(new Error('Network unreachable'));
    render(<CustomerAgingPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows the zero-balance empty state when every customer is paid up', async () => {
    mockedGetReport.mockResolvedValue([makeRow({ buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } })]);
    render(<CustomerAgingPage />);
    expect(await screen.findByText(/no outstanding customer balances/i)).toBeInTheDocument();
  });

  it('renders one row per customer with a balance, sorted worst debtor first, plus a grand-total footer', async () => {
    mockedGetReport.mockResolvedValue([
      makeRow({ id: 'cust_small', name: 'Small Debtor', buckets: { current: 100, days30: 0, days60: 0, days90Plus: 0, total: 100 } }),
      makeRow({ id: 'cust_large', name: 'Large Debtor', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 900, total: 900 } }),
      makeRow({ id: 'cust_zero', name: 'Paid Up Customer', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } }),
    ]);
    render(<CustomerAgingPage />);

    const largeRow = await screen.findByText('Large Debtor');
    expect(largeRow).toBeInTheDocument();
    expect(screen.getByText('Small Debtor')).toBeInTheDocument();
    // Zero-balance customer excluded by default.
    expect(screen.queryByText('Paid Up Customer')).not.toBeInTheDocument();
    // Grand total across the two visible rows: 100 + 900. Appears both in
    // the "Total Receivable" stat card and the table's TOTAL footer row.
    // Locale-agnostic regex (en-ZA formatCurrency uses a non-breaking space
    // thousands separator and comma decimal) rather than an exact string.
    expect(screen.getAllByText(/1.?000,00/).length).toBeGreaterThanOrEqual(2);

    // Toggle "show all" — the zero-balance customer should now appear.
    fireEvent.click(screen.getByRole('checkbox', { name: /show customers with a zero balance/i }));
    expect(await screen.findByText('Paid Up Customer')).toBeInTheDocument();
  });
});
