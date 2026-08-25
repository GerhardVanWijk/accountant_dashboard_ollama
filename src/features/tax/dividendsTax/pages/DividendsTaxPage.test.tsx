import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DividendDeclaration } from '@/types';
import { DividendsTaxPage } from './DividendsTaxPage';
import { dividendDeclarationService } from '../services';
import { formatDate } from '@/lib/app/format';

vi.mock('../services', () => ({
  dividendDeclarationService: {
    getDeclarations: vi.fn(),
    createDeclaration: vi.fn(),
    declare: vi.fn(),
    pay: vi.fn(),
    remitToSars: vi.fn(),
    deleteDraftDeclaration: vi.fn(),
  },
  getRemittanceDueDateHint: (paidDate: string) => {
    const d = new Date(paidDate);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
    return lastDay.toISOString().slice(0, 10);
  },
}));

const mockedGetDeclarations = dividendDeclarationService.getDeclarations as unknown as ReturnType<typeof vi.fn>;
const mockedCreateDeclaration = dividendDeclarationService.createDeclaration as unknown as ReturnType<typeof vi.fn>;
const mockedDeclare = dividendDeclarationService.declare as unknown as ReturnType<typeof vi.fn>;

function makeDeclaration(overrides: Partial<DividendDeclaration> = {}): DividendDeclaration {
  return {
    id: 'divd_1',
    declarationDate: '2026-03-01',
    totalAmount: 100000,
    exemptPortion: 0,
    status: 'draft',
    taxableAmount: 100000,
    ratePercentApplied: 20,
    dividendsTaxWithheld: 20000,
    netPayableToShareholders: 80000,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DividendsTaxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while declarations are being fetched', () => {
    mockedGetDeclarations.mockReturnValue(new Promise(() => {}));
    render(<DividendsTaxPage />);
    expect(screen.getByText(/loading dividend declarations/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetDeclarations.mockRejectedValue(new Error('Network unreachable'));
    render(<DividendsTaxPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no declarations', async () => {
    mockedGetDeclarations.mockResolvedValue([]);
    render(<DividendsTaxPage />);
    expect(await screen.findByText(/no dividend declarations yet/i)).toBeInTheDocument();
  });

  it('renders a declaration row once data loads', async () => {
    mockedGetDeclarations.mockResolvedValue([makeDeclaration()]);
    render(<DividendsTaxPage />);
    expect(await screen.findByText(formatDate('2026-03-01'))).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft declaration through the form', async () => {
    mockedGetDeclarations.mockResolvedValue([]);
    mockedCreateDeclaration.mockResolvedValue(makeDeclaration());
    render(<DividendsTaxPage />);
    await screen.findByText(/no dividend declarations yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new declaration/i })[0]);
    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '100000' } });

    mockedGetDeclarations.mockResolvedValue([makeDeclaration()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateDeclaration).toHaveBeenCalledTimes(1));
    expect(mockedCreateDeclaration.mock.calls[0][0]).toMatchObject({ totalAmount: 100000 });
  });

  it('declares a draft after confirmation', async () => {
    mockedGetDeclarations.mockResolvedValue([makeDeclaration()]);
    mockedDeclare.mockResolvedValue(makeDeclaration({ status: 'declared', declarationJournalEntryId: 'je_1' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DividendsTaxPage />);
    await screen.findByText(formatDate('2026-03-01'));

    fireEvent.click(screen.getByRole('button', { name: /^declare$/i }));
    await waitFor(() => expect(mockedDeclare).toHaveBeenCalledWith('divd_1'));
  });
});
