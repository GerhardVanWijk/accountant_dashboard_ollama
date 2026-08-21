import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Account, JournalEntry } from '@/types';
import { JournalsPage } from './JournalsPage';
import { accountService, journalEntryService } from '../services';

vi.mock('../services', () => ({
  accountService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    hasPostings: vi.fn().mockResolvedValue(false),
  },
  journalEntryService: {
    getEntries: vi.fn(),
    validateLines: vi.fn().mockResolvedValue({ valid: false, errors: [] }),
    postJournalEntry: vi.fn(),
    reverseJournalEntry: vi.fn(),
    getAccountLedger: vi.fn(),
    computeTrialBalance: vi.fn(),
  },
}));

const mockedGetEntries = journalEntryService.getEntries as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

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
    lines: [
      { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
      { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('JournalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while entries are being fetched', () => {
    mockedGetEntries.mockReturnValue(new Promise(() => {}));
    render(<JournalsPage />);
    expect(screen.getByText(/loading journal entries/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetEntries.mockRejectedValue(new Error('Network unreachable'));
    render(<JournalsPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no journal entries', async () => {
    mockedGetEntries.mockResolvedValue([]);
    render(<JournalsPage />);
    expect(await screen.findByText(/no journal entries yet/i)).toBeInTheDocument();
  });

  it('renders posted entries once data loads', async () => {
    mockedGetEntries.mockResolvedValue([makeEntry()]);
    render(<JournalsPage />);
    expect(await screen.findByText('JE-0001')).toBeInTheDocument();
    expect(screen.getByText('Opening balances')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
  });

  it('marks an entry Reversed when another entry points reversalOfEntryId at it', async () => {
    mockedGetEntries.mockResolvedValue([
      makeEntry(),
      makeEntry({ id: 'je_0002', entryNumber: 'JE-0002', reversalOfEntryId: 'je_0001', source: 'reversal' }),
    ]);
    render(<JournalsPage />);
    await screen.findByText('JE-0001');
    expect(screen.getByText('Reversed')).toBeInTheDocument();
    expect(screen.getByText('Reversal')).toBeInTheDocument();
  });
});
