import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, JournalEntry } from '@/types';
import { JournalsPage } from './JournalsPage';
import { accountService, journalEntryService, accountingPeriodService } from '../services';

function renderPage(initialEntries: string[] = ['/accounting/journals']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <JournalsPage />
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
  accountingPeriodService: {
    getPeriods: vi.fn().mockResolvedValue([]),
  },
  SYSTEM_USER_ID: 'system',
}));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

const mockedGetEntries = journalEntryService.getEntries as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetPeriods = accountingPeriodService.getPeriods as unknown as ReturnType<typeof vi.fn>;

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
    mockedGetPeriods.mockResolvedValue([]);
  });

  it('shows a loading state while entries are being fetched', () => {
    mockedGetEntries.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading journal entries/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetEntries.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no journal entries', async () => {
    mockedGetEntries.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no journals found/i)).toBeInTheDocument();
  });

  it('renders posted entries once data loads', async () => {
    mockedGetEntries.mockResolvedValue([makeEntry()]);
    renderPage();
    expect(await screen.findByText('JE-0001')).toBeInTheDocument();
    expect(screen.getByText('Opening balances')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
  });

  it('marks an entry Reversed when another entry points reversalOfEntryId at it', async () => {
    mockedGetEntries.mockResolvedValue([
      makeEntry(),
      makeEntry({ id: 'je_0002', entryNumber: 'JE-0002', reversalOfEntryId: 'je_0001', source: 'reversal' }),
    ]);
    renderPage();
    await screen.findByText('JE-0001');
    expect(screen.getByText('Reversed')).toBeInTheDocument();
    expect(screen.getByText('Reversal')).toBeInTheDocument();
  });

  it('expands the entry named by ?record= in the URL, showing its lines and audit history', async () => {
    mockedGetEntries.mockResolvedValue([makeEntry()]);
    renderPage(['/accounting/journals?record=je_0001']);
    await screen.findByText('JE-0001');

    expect(screen.getByText('Journal lines')).toBeInTheDocument();
    expect(screen.getByText('Audit history')).toBeInTheDocument();
    expect(await screen.findByText(/no audit entries recorded/i)).toBeInTheDocument();
  });

  it('clicking the expand chevron toggles the lines open and closed', async () => {
    mockedGetEntries.mockResolvedValue([makeEntry()]);
    renderPage();
    await screen.findByText('JE-0001');

    expect(screen.queryByText('Journal lines')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show lines for je-0001/i }));
    expect(await screen.findByText('Journal lines')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide lines for je-0001/i }));
    expect(screen.queryByText('Journal lines')).not.toBeInTheDocument();
  });
});
