import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, JournalEntry } from '@/types';
import { LedgerPage } from './LedgerPage';
import { accountService, journalEntryService } from '../services';
import { useAccountingUiStore } from '../store/accountingUiStore';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accounting/ledger']}>
      <LedgerPage />
    </MemoryRouter>,
  );
}

vi.mock('../services', () => ({
  accountService: {
    getAccounts: vi.fn(),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    hasPostings: vi.fn().mockResolvedValue(false),
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
}));

const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccount = accountService.getAccount as unknown as ReturnType<typeof vi.fn>;
const mockedGetEntries = journalEntryService.getEntries as unknown as ReturnType<typeof vi.fn>;
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

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_0001',
    entryNumber: 'JE-0001',
    date: '2026-01-01T00:00:00.000Z',
    memo: 'Opening balances',
    status: 'posted',
    postedAt: '2026-01-01T00:00:00.000Z',
    source: 'manual',
    lines: [{ id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('LedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountingUiStore.setState({ selectedLedgerAccountId: null });
    mockedGetAccount.mockResolvedValue(undefined);
    mockedGetAccountLedger.mockResolvedValue([]);
  });

  it('shows an empty state when there are no posted lines yet', async () => {
    mockedGetAccounts.mockResolvedValue([]);
    mockedGetEntries.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no ledger entries found/i)).toBeInTheDocument();
  });

  it('renders flat ledger rows across accounts once data loads', async () => {
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
    mockedGetEntries.mockResolvedValue([makeEntry()]);
    renderPage();
    expect(await screen.findByText('JE-0001')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetAccounts.mockResolvedValue([]);
    mockedGetEntries.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });
});
