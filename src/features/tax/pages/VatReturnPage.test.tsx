import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VatReturnPage } from './VatReturnPage';
import { useVatReport, type UseVatReportResult } from '../hooks/useVatReport';
import type { VatReport, VatTransactionRow } from '../services/vatReportService';

vi.mock('../hooks/useVatReport', () => ({
  useVatReport: vi.fn(),
}));

const mockedUseVatReport = useVatReport as unknown as ReturnType<typeof vi.fn>;

function makeReport(overrides: Partial<VatReport> = {}): VatReport {
  return {
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T23:59:59.999Z',
    outputVat: { byTreatment: [{ treatment: 'standard_rated', taxBase: 1000, vatAmount: 150 }], total: 150 },
    inputVat: { byTreatment: [{ treatment: 'standard_rated', taxBase: 500, vatAmount: 75 }], nonDeductibleTotal: 0, total: 75 },
    netVatPayable: 75,
    unresolvedLineCount: 0,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<VatTransactionRow> = {}): VatTransactionRow {
  return {
    id: 'inv_1',
    documentType: 'invoice',
    documentNumber: 'INV-0001',
    date: '2026-08-10T00:00:00.000Z',
    direction: 'output',
    treatment: 'standard_rated',
    taxBase: 1000,
    vatAmount: 150,
    ...overrides,
  };
}

function mockResult(overrides: Partial<UseVatReportResult> = {}): UseVatReportResult {
  return {
    report: makeReport(),
    reconciliation: null,
    transactions: [makeTransaction()],
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('VatReturnPage', () => {
  it('renders the real Output/Input/Net VAT figures from the service, not mock data', () => {
    mockedUseVatReport.mockReturnValue(mockResult());
    render(<VatReturnPage />);

    expect(screen.getAllByText('Output VAT').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/150[,.]00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Net VAT payable')).toBeInTheDocument();
  });

  it('shows the real posted document behind the VAT figures (transaction traceability)', () => {
    mockedUseVatReport.mockReturnValue(mockResult());
    render(<VatReturnPage />);

    expect(screen.getByText('Supporting transactions')).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
  });

  it('does not show a persisted filing/submission status anywhere — no SARS submission concept exists', () => {
    mockedUseVatReport.mockReturnValue(mockResult());
    render(<VatReturnPage />);

    expect(screen.queryByText(/submitted to sars/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^submitted$/i)).not.toBeInTheDocument();
  });

  it('shows the GL reconciliation when the service provides one', () => {
    mockedUseVatReport.mockReturnValue(
      mockResult({
        reconciliation: {
          outputVat: { controlAccountId: 'acc_2100', controlAccountMovement: 150, reportTotal: 150, variance: 0, isReconciled: true },
          inputVat: { controlAccountId: 'acc_2110', controlAccountMovement: 75, reportTotal: 75, variance: 0, isReconciled: true },
        },
      }),
    );
    render(<VatReturnPage />);

    expect(screen.getByText('GL Reconciliation')).toBeInTheDocument();
    expect(screen.getAllByText('Reconciled')).toHaveLength(2);
  });

  it('flags unresolved line items rather than silently dropping them', () => {
    mockedUseVatReport.mockReturnValue(mockResult({ report: makeReport({ unresolvedLineCount: 2 }) }));
    render(<VatReturnPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/2 line items could not be matched/i);
  });

  it('shows a loading state while the report is being computed', () => {
    mockedUseVatReport.mockReturnValue(mockResult({ report: null, loading: true }));
    render(<VatReturnPage />);
    expect(screen.getByText(/computing vat report/i)).toBeInTheDocument();
  });

  it('shows an error state when the report fails to compute', () => {
    mockedUseVatReport.mockReturnValue(mockResult({ report: null, error: new Error('Network unreachable') }));
    render(<VatReturnPage />);
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
  });
});
