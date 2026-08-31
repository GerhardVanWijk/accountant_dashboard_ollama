import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrialBalancePage } from './TrialBalancePage';
import { accountService, journalEntryService } from '../services';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accounting/trial-balance']}>
      <TrialBalancePage />
    </MemoryRouter>,
  );
}

vi.mock('../services', () => ({
  accountService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    hasPostings: vi.fn(),
    getAccountIdsWithPostings: vi.fn().mockResolvedValue(new Set()),
  },
  journalEntryService: {
    getEntries: vi.fn(),
    validateLines: vi.fn(),
    postJournalEntry: vi.fn(),
    reverseJournalEntry: vi.fn(),
    getAccountLedger: vi.fn(),
    computeTrialBalance: vi.fn(),
  },
  accountMappingService: {
    getAccountId: vi.fn(),
  },
  categoryAccountMappingService: {
    resolveForCategory: vi.fn().mockResolvedValue({}),
  },
  // Pulled in transitively via `@/services` → inventory posting engine instance
  // (useSubledgerReconciliation imports invoiceService from the root barrel).
  accountingPeriodService: {
    getPeriodForDate: vi.fn(),
  },
}));

const mockedComputeTrialBalance = journalEntryService.computeTrialBalance as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

describe('TrialBalancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([]);
  });

  it('shows a loading state while the trial balance is computing', () => {
    mockedComputeTrialBalance.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status', { name: /computing trial balance/i })).toBeInTheDocument();
  });

  it('shows an error state when computing fails', async () => {
    mockedComputeTrialBalance.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing has posted', async () => {
    mockedComputeTrialBalance.mockResolvedValue({ rows: [], totalDebits: 0, totalCredits: 0, balanced: true });
    renderPage();
    expect(await screen.findByText(/nothing posted yet/i)).toBeInTheDocument();
  });

  it('renders a balanced trial balance with a clear balanced indicator', async () => {
    mockedComputeTrialBalance.mockResolvedValue({
      rows: [
        { accountId: 'acc_1000', code: '1000', name: 'Cash and Bank', debit: 100, credit: 0 },
        { accountId: 'acc_4000', code: '4000', name: 'Sales Revenue', debit: 0, credit: 100 },
      ],
      totalDebits: 100,
      totalCredits: 100,
      balanced: true,
    });
    renderPage();
    expect(await screen.findByText('Cash and Bank')).toBeInTheDocument();
    expect(screen.getByText(/balanced — total debits equal total credits/i)).toBeInTheDocument();
  });

  it('renders a clear out-of-balance indicator when balanced is false', async () => {
    mockedComputeTrialBalance.mockResolvedValue({
      rows: [{ accountId: 'acc_1000', code: '1000', name: 'Cash and Bank', debit: 100, credit: 0 }],
      totalDebits: 100,
      totalCredits: 0,
      balanced: false,
    });
    renderPage();
    expect(await screen.findByText(/out of balance/i)).toBeInTheDocument();
  });
});
