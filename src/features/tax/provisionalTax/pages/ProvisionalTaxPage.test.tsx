import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FinancialYear } from '@/types';
import type { ProvisionalTaxPeriod } from '@/types/provisionalTax';
import { ProvisionalTaxPage } from './ProvisionalTaxPage';
import { useProvisionalTax } from '../hooks/useProvisionalTax';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tax/provisional-tax']}>
      <ProvisionalTaxPage />
    </MemoryRouter>,
  );
}

vi.mock('../hooks/useProvisionalTax', () => ({
  useProvisionalTax: vi.fn(),
}));

const mockedUseProvisionalTax = useProvisionalTax as unknown as ReturnType<typeof vi.fn>;

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

function makePeriod(overrides: Partial<ProvisionalTaxPeriod> = {}): ProvisionalTaxPeriod {
  return {
    id: 'ptp_1',
    companyId: 'comp_001',
    financialYearId: 'fy_2026',
    financialYearLabel: 'FY2026',
    first: { dueDate: '2026-07-01T00:00:00.000Z' },
    second: { dueDate: '2026-12-31T23:59:59.999Z' },
    topUp: { dueDate: '2027-06-30T00:00:00.000Z' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseHookValue(overrides: Partial<ReturnType<typeof useProvisionalTax>> = {}) {
  return {
    financialYears: [makeFinancialYear()],
    company: undefined,
    periods: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    getOrCreatePeriod: vi.fn(),
    recordEstimate: vi.fn(),
    payProvisionalTax: vi.fn(),
    getReconciliation: vi.fn().mockResolvedValue({ financialYearId: 'fy_2026', totalPaid: 0 }),
    ...overrides,
  };
}

describe('ProvisionalTaxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ loading: true }));
    renderPage();
    expect(screen.getByText(/loading provisional tax data/i)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ error: new Error('Network unreachable') }));
    renderPage();
    expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('offers to create a provisional tax period when none exists for the selected financial year', () => {
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [] }));
    renderPage();
    expect(screen.getByText(/no provisional tax period yet for fy2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create provisional tax period/i })).toBeInTheDocument();
  });

  it('calls getOrCreatePeriod when the create button is clicked', async () => {
    const getOrCreatePeriod = vi.fn().mockResolvedValue(makePeriod());
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [], getOrCreatePeriod }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create provisional tax period/i }));
    await waitFor(() => expect(getOrCreatePeriod).toHaveBeenCalledWith('fy_2026'));
  });

  it('renders the three payment slot cards for an existing period', () => {
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [makePeriod()] }));
    renderPage();

    expect(screen.getByText('First Payment')).toBeInTheDocument();
    expect(screen.getByText('Second Payment')).toBeInTheDocument();
    expect(screen.getByText('Top-up Payment')).toBeInTheDocument();
  });

  it('calls recordEstimate when an estimate is saved for a slot', async () => {
    const recordEstimate = vi.fn().mockResolvedValue(makePeriod());
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [makePeriod()], recordEstimate }));
    renderPage();

    const estimateInput = screen.getByLabelText('Estimated Taxable Income', { selector: '#estimate-first-payment' });
    fireEvent.change(estimateInput, { target: { value: '300000' } });
    fireEvent.click(screen.getAllByRole('button', { name: /save estimate/i })[0]);

    await waitFor(() => expect(recordEstimate).toHaveBeenCalledWith('ptp_1', 'first', 300000));
  });

  it('shows a reconciliation summary once a final tax liability is available', async () => {
    const getReconciliation = vi.fn().mockResolvedValue({
      financialYearId: 'fy_2026',
      totalPaid: 70000,
      finalTaxLiability: 81000,
      variance: 11000,
    });
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [makePeriod()], getReconciliation }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Final Tax Liability')).toBeInTheDocument());
    expect(screen.getByText('Still Owed')).toBeInTheDocument();
  });

  it('mentions the no-interest-rate gap explicitly', () => {
    mockedUseProvisionalTax.mockReturnValue(baseHookValue({ periods: [makePeriod()] }));
    renderPage();
    expect(screen.getByText(/underpayment interest\/penalties are not calculated here/i)).toBeInTheDocument();
  });
});
