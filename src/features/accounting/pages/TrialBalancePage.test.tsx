import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrialBalancePage } from './TrialBalancePage';
import { journalEntryService } from '../services';

vi.mock('../services', () => ({
  accountService: {
    getAccounts: vi.fn(),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    hasPostings: vi.fn(),
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
}));

const mockedComputeTrialBalance = journalEntryService.computeTrialBalance as unknown as ReturnType<typeof vi.fn>;

describe('TrialBalancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the trial balance is computing', () => {
    mockedComputeTrialBalance.mockReturnValue(new Promise(() => {}));
    render(<TrialBalancePage />);
    expect(screen.getByText(/computing trial balance/i)).toBeInTheDocument();
  });

  it('shows an error state when computing fails', async () => {
    mockedComputeTrialBalance.mockRejectedValue(new Error('Network unreachable'));
    render(<TrialBalancePage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing has posted', async () => {
    mockedComputeTrialBalance.mockResolvedValue({ rows: [], totalDebits: 0, totalCredits: 0, balanced: true });
    render(<TrialBalancePage />);
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
    render(<TrialBalancePage />);
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
    render(<TrialBalancePage />);
    expect(await screen.findByText(/out of balance/i)).toBeInTheDocument();
  });
});
