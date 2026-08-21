import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaxRatesPage } from './TaxRatesPage';
import { taxRateService } from '../services';
import type { TaxRate } from '@/types';

vi.mock('../services', () => ({
  taxRateService: {
    getTaxRates: vi.fn(),
    getActiveTaxRates: vi.fn(),
    getCurrentlyEffectiveRates: vi.fn(),
    getRateHistory: vi.fn(),
    getEffectiveRate: vi.fn(),
    getCurrentRate: vi.fn(),
    createTaxRate: vi.fn(),
    supersede: vi.fn(),
    deactivate: vi.fn(),
  },
}));

const mockedGetTaxRates = taxRateService.getTaxRates as unknown as ReturnType<typeof vi.fn>;
const mockedCreateTaxRate = taxRateService.createTaxRate as unknown as ReturnType<typeof vi.fn>;
const mockedSupersede = taxRateService.supersede as unknown as ReturnType<typeof vi.fn>;

function makeRate(overrides: Partial<TaxRate> = {}): TaxRate {
  return {
    id: 'tax_std',
    code: 'STD',
    name: 'Standard Rate (15%)',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2018-04-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'test',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TaxRatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no tax codes', async () => {
    mockedGetTaxRates.mockResolvedValue([]);
    render(<TaxRatesPage />);
    expect(await screen.findByText(/no tax codes yet/i)).toBeInTheDocument();
  });

  it('renders a tax code grouped with its current status', async () => {
    mockedGetTaxRates.mockResolvedValue([makeRate()]);
    render(<TaxRatesPage />);
    expect(await screen.findByText('Standard Rate (15%)')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('shows both versions of a superseded code, with only the current one actionable', async () => {
    mockedGetTaxRates.mockResolvedValue([
      makeRate({ id: 'std_v1', rate: 14, effectiveFrom: '2010-01-01T00:00:00.000Z', effectiveTo: '2018-03-31T00:00:00.000Z' }),
      makeRate({ id: 'std_v2', rate: 15, effectiveFrom: '2018-04-01T00:00:00.000Z' }),
    ]);
    render(<TaxRatesPage />);
    expect(await screen.findByText('14%')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    // Only one row (the current version) gets action buttons.
    expect(screen.getAllByText('Supersede')).toHaveLength(1);
  });

  it('creates a new tax code through the form', async () => {
    mockedGetTaxRates.mockResolvedValue([]);
    mockedCreateTaxRate.mockResolvedValue(makeRate({ id: 'new_zero', code: 'ZERO', name: 'Zero-Rated', rate: 0 }));
    render(<TaxRatesPage />);

    fireEvent.click(await screen.findByText('New Tax Code'));
    fireEvent.change(screen.getByPlaceholderText('e.g. STD'), { target: { value: 'zero' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Standard Rate (15%)'), { target: { value: 'Zero-Rated' } });
    fireEvent.change(screen.getByPlaceholderText(/VAT Act 89 of 1991/), { target: { value: 'Test source' } });
    fireEvent.click(screen.getByText('Create Tax Code'));

    await waitFor(() => {
      expect(mockedCreateTaxRate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ZERO', name: 'Zero-Rated', sourceReference: 'Test source' }),
      );
    });
  });

  it('requires a reason when superseding a rate', async () => {
    mockedGetTaxRates.mockResolvedValue([makeRate()]);
    render(<TaxRatesPage />);

    fireEvent.click(await screen.findByText('Supersede'));
    fireEvent.click(screen.getByText('Supersede Rate'));

    expect(await screen.findByText(/source reference and reason are both required/i)).toBeInTheDocument();
    expect(mockedSupersede).not.toHaveBeenCalled();
  });
});
