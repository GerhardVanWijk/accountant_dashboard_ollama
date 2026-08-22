import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupplierAgingPage } from './SupplierAgingPage';
import { getSupplierAgingReport } from '../services/supplierAgingReportService';
import type { AgingReportRow } from '../types';

vi.mock('../services/supplierAgingReportService', () => ({
  getSupplierAgingReport: vi.fn(),
}));

const mockedGetReport = getSupplierAgingReport as unknown as ReturnType<typeof vi.fn>;

function makeRow(overrides: Partial<AgingReportRow> = {}): AgingReportRow {
  return {
    id: 'sup_1',
    name: 'Highveld Steel',
    buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 },
    ...overrides,
  };
}

describe('SupplierAgingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the report is being computed', () => {
    mockedGetReport.mockReturnValue(new Promise(() => {}));
    render(<SupplierAgingPage />);
    expect(screen.getByText(/computing supplier aging/i)).toBeInTheDocument();
  });

  it('shows an error state when the report fails to load', async () => {
    mockedGetReport.mockRejectedValue(new Error('Network unreachable'));
    render(<SupplierAgingPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows the zero-balance empty state when every supplier is paid up', async () => {
    mockedGetReport.mockResolvedValue([makeRow({ buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } })]);
    render(<SupplierAgingPage />);
    expect(await screen.findByText(/no outstanding supplier balances/i)).toBeInTheDocument();
  });

  it('renders one row per supplier with a balance, sorted largest payable first, plus a grand-total footer', async () => {
    mockedGetReport.mockResolvedValue([
      makeRow({ id: 'sup_small', name: 'Small Payable', buckets: { current: 100, days30: 0, days60: 0, days90Plus: 0, total: 100 } }),
      makeRow({ id: 'sup_large', name: 'Large Payable', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 900, total: 900 } }),
      makeRow({ id: 'sup_zero', name: 'Paid Up Supplier', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } }),
    ]);
    render(<SupplierAgingPage />);

    expect(await screen.findByText('Large Payable')).toBeInTheDocument();
    expect(screen.getByText('Small Payable')).toBeInTheDocument();
    expect(screen.queryByText('Paid Up Supplier')).not.toBeInTheDocument();
    // Grand total across the two visible rows: 100 + 900. Appears both in
    // the "Total Payable" stat card and the table's TOTAL footer row.
    expect(screen.getAllByText('+1,000.00').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('checkbox', { name: /show suppliers with a zero balance/i }));
    expect(await screen.findByText('Paid Up Supplier')).toBeInTheDocument();
  });
});
