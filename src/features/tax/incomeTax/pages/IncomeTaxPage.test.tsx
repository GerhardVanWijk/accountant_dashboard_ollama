import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, FinancialYear, TaxComputation } from '@/types';
import { IncomeTaxPage } from './IncomeTaxPage';
import { useIncomeTax } from '../hooks/useIncomeTax';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tax/income-tax']}>
      <IncomeTaxPage />
    </MemoryRouter>,
  );
}

vi.mock('../hooks/useIncomeTax', () => ({
  useIncomeTax: vi.fn(),
}));

const mockedUseIncomeTax = useIncomeTax as unknown as ReturnType<typeof vi.fn>;

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

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp_001',
    name: 'Demo Trading (Pty) Ltd',
    legalEntityType: 'private_company',
    isPublicCompany: false,
    isListed: false,
    hasPublicAccountability: false,
    reportingFramework: 'not_yet_determined',
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    accountingBasis: 'accrual',
    functionalCurrency: 'ZAR',
    presentationCurrency: 'ZAR',
    isVatRegistered: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeComputation(overrides: Partial<TaxComputation> = {}): TaxComputation {
  return {
    id: 'txc_1',
    companyId: 'comp_001',
    financialYearId: 'fy_2026',
    financialYearLabel: 'FY2026',
    status: 'draft',
    accountingProfit: 300000,
    isSbcEligible: false,
    adjustments: [],
    taxableIncome: 300000,
    taxConfigId: 'itc_2026_2027',
    taxConfigTaxYearLabel: '2026/2027',
    taxLiability: 81000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseHookValue(overrides: Partial<ReturnType<typeof useIncomeTax>> = {}) {
  return {
    financialYears: [makeFinancialYear()],
    company: makeCompany(),
    computations: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createComputation: vi.fn(),
    updateAdjustments: vi.fn(),
    deleteComputation: vi.fn(),
    postComputation: vi.fn(),
    setSbcEligibility: vi.fn(),
    ...overrides,
  };
}

describe('IncomeTaxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    mockedUseIncomeTax.mockReturnValue(baseHookValue({ loading: true }));
    renderPage();
    expect(screen.getByText(/loading income tax data/i)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockedUseIncomeTax.mockReturnValue(baseHookValue({ error: new Error('Network unreachable') }));
    renderPage();
    expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('offers to create a tax computation when none exists for the selected financial year', () => {
    mockedUseIncomeTax.mockReturnValue(baseHookValue({ computations: [] }));
    renderPage();
    expect(screen.getByText(/no tax computation yet for fy2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create tax computation/i })).toBeInTheDocument();
  });

  it('calls createComputation when the create button is clicked', async () => {
    const createComputation = vi.fn().mockResolvedValue(makeComputation());
    mockedUseIncomeTax.mockReturnValue(baseHookValue({ computations: [], createComputation }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create tax computation/i }));
    await waitFor(() => expect(createComputation).toHaveBeenCalledWith('fy_2026'));
  });

  it('renders the reconciliation summary and adjustments table for an existing draft computation', () => {
    mockedUseIncomeTax.mockReturnValue(
      baseHookValue({
        computations: [
          makeComputation({
            adjustments: [
              { id: 'a1', category: 'depreciation_addback', description: 'Depreciation add-back', amount: 20000, direction: 'add' },
            ],
          }),
        ],
      }),
    );
    renderPage();

    expect(screen.getByRole('heading', { name: /FY2026 — Draft/ })).toBeInTheDocument();
    expect(screen.getByText('Depreciation add-back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post tax computation/i })).toBeInTheDocument();
  });

  it('renders a posted computation as read-only with no post/delete actions', () => {
    mockedUseIncomeTax.mockReturnValue(
      baseHookValue({
        computations: [makeComputation({ status: 'posted', journalEntryId: 'je_99', postedAt: '2026-12-31T00:00:00.000Z' })],
      }),
    );
    renderPage();

    expect(screen.getByRole('heading', { name: /FY2026 — Posted/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post tax computation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete draft/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view journal entry/i })).toBeInTheDocument();
  });

  it('calls postComputation when the Post action is clicked', async () => {
    const postComputation = vi.fn().mockResolvedValue(makeComputation({ status: 'posted' }));
    mockedUseIncomeTax.mockReturnValue(baseHookValue({ computations: [makeComputation()], postComputation }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /post tax computation/i }));
    await waitFor(() => expect(postComputation).toHaveBeenCalledWith('txc_1'));
  });
});
