import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CapitalGainsPeriodReport, Company } from '@/types';
import { CapitalGainsPage } from './CapitalGainsPage';
import { capitalGainsService } from '../services';
import { useCompany } from '@/features/admin/hooks/useCompany';

vi.mock('../services', () => ({
  capitalGainsService: {
    getPeriodReport: vi.fn(),
    setSellingCosts: vi.fn(),
  },
}));

vi.mock('@/features/admin/hooks/useCompany', () => ({
  useCompany: vi.fn(),
}));

const mockedGetPeriodReport = capitalGainsService.getPeriodReport as unknown as ReturnType<typeof vi.fn>;
const mockedUseCompany = useCompany as unknown as ReturnType<typeof vi.fn>;

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp_1',
    name: 'Test Co (Pty) Ltd',
    legalEntityType: 'private_company',
    isPublicCompany: false,
    isListed: false,
    hasPublicAccountability: false,
    reportingFramework: 'ifrs_for_smes',
    financialYearEndMonth: 2,
    financialYearEndDay: 28,
    accountingBasis: 'accrual',
    functionalCurrency: 'ZAR',
    presentationCurrency: 'ZAR',
    isVatRegistered: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeReport(overrides: Partial<CapitalGainsPeriodReport> = {}): CapitalGainsPeriodReport {
  return {
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2027-02-28T23:59:59.999Z',
    entityTypeBucket: 'company',
    disposals: [],
    unresolvedDisposalCount: 0,
    netCapitalGainLoss: 0,
    inclusionRatePercent: 80,
    inclusionRateSourceReference: 'test',
    annualExclusionEligible: false,
    annualExclusionAvailable: 0,
    annualExclusionApplied: 0,
    taxableCapitalGain: 0,
    netCapitalLossForPeriod: 0,
    simplificationNotes: ['A documented simplification.'],
    configWarnings: [],
    ...overrides,
  };
}

describe('CapitalGainsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseCompany.mockReturnValue({ company: makeCompany(), loading: false });
  });

  it('shows a loading state while the company is loading', () => {
    mockedUseCompany.mockReturnValue({ company: undefined, loading: true });
    mockedGetPeriodReport.mockReturnValue(new Promise(() => {}));
    render(<CapitalGainsPage />);
    expect(screen.getByText(/computing capital gains tax report/i)).toBeInTheDocument();
  });

  it('shows an error state when the report computation fails', async () => {
    mockedGetPeriodReport.mockRejectedValue(new Error('Something broke'));
    render(<CapitalGainsPage />);
    expect(await screen.findByText(/something broke/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no disposals in the period', async () => {
    mockedGetPeriodReport.mockResolvedValue(makeReport());
    render(<CapitalGainsPage />);
    expect(await screen.findByText(/no disposals in this period/i)).toBeInTheDocument();
  });

  it('renders the reconciliation figures and disposal row once data loads', async () => {
    mockedGetPeriodReport.mockResolvedValue(
      makeReport({
        disposals: [
          {
            disposalId: 'disp_1',
            assetId: 'fa_1',
            assetNumber: 'FA-0001',
            assetName: 'Delivery Van',
            disposalDate: '2026-06-15',
            proceeds: 130000,
            accountingCarryingValue: 0,
            accountingGainLoss: 130000,
            baseCost: 100000,
            sellingCosts: 0,
            capitalGainLoss: 30000,
          },
        ],
        netCapitalGainLoss: 30000,
        taxableCapitalGain: 24000,
      }),
    );
    render(<CapitalGainsPage />);

    expect(await screen.findByText(/FA-0001 - Delivery Van/i)).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(mockedGetPeriodReport).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 'private_company');
  });

  it('surfaces config warnings instead of hiding them', async () => {
    mockedGetPeriodReport.mockResolvedValue(makeReport({ configWarnings: ['No CgtInclusionRateConfig covers this period.'] }));
    render(<CapitalGainsPage />);
    expect(await screen.findByText(/no cgtinclusionrateconfig covers this period/i)).toBeInTheDocument();
  });
});
