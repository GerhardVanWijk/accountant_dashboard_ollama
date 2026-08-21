import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Account } from '@/types';
import { LedgerPage } from './LedgerPage';
import { accountService, journalEntryService } from '../services';
import { useAccountingUiStore } from '../store/accountingUiStore';

vi.mock('../services', () => ({
  accountService: {
    getAccounts: vi.fn(),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    hasPostings: vi.fn().mockResolvedValue(false),
  },
  journalEntryService: {
    getEntries: vi.fn(),
    validateLines: vi.fn(),
    postJournalEntry: vi.fn(),
    reverseJournalEntry: vi.fn(),
    getAccountLedger: vi.fn(),
    computeTrialBalance: vi.fn(),
  },
}));

const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccount = accountService.getAccount as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccountLedger = journalEntryService.getAccountLedger as unknown as ReturnType<typeof vi.fn>;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1000',
    code: '1000',
    name: 'Cash and Bank',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountingUiStore.setState({ selectedLedgerAccountId: null });
  });

  it('shows an empty state when there are no accounts to pick from', async () => {
    mockedGetAccounts.mockResolvedValue([]);
    render(<LedgerPage />);
    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('shows an empty state when the selected account has no postings', async () => {
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
    mockedGetAccount.mockResolvedValue(makeAccount());
    mockedGetAccountLedger.mockResolvedValue([]);
    render(<LedgerPage />);
    expect(await screen.findByText(/no postings yet/i)).toBeInTheDocument();
  });

  it('renders ledger rows with a running balance once data loads', async () => {
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
    mockedGetAccount.mockResolvedValue(makeAccount());
    mockedGetAccountLedger.mockResolvedValue([
      { entryId: 'je_1', entryNumber: 'JE-0001', date: '2026-01-01T00:00:00.000Z', debit: 100, credit: 0, runningBalance: 100 },
    ]);
    render(<LedgerPage />);
    expect(await screen.findByText('JE-0001')).toBeInTheDocument();
  });
});
