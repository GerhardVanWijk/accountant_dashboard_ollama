import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@/types';
import { ChartOfAccountsPage } from './ChartOfAccountsPage';
import { accountService, journalEntryService } from '../services';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accounting/coa']}>
      <ChartOfAccountsPage />
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
    getEntries: vi.fn().mockResolvedValue([]),
    validateLines: vi.fn(),
    postJournalEntry: vi.fn(),
    reverseJournalEntry: vi.fn(),
    getAccountLedger: vi.fn(),
    computeTrialBalance: vi.fn(),
  },
}));

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

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while accounts are being fetched', () => {
    mockedGetAccounts.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status', { name: /loading chart of accounts/i })).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetAccounts.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no accounts', async () => {
    mockedGetAccounts.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('renders account rows grouped by master type once data loads', async () => {
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
    renderPage();
    expect(await screen.findByText('Cash and Bank')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getAllByText('Assets').length).toBeGreaterThan(0);
  });

  it('filters rows by the search box', async () => {
    mockedGetAccounts.mockResolvedValue([
      makeAccount(),
      makeAccount({ id: 'acc_1100', code: '1100', name: 'Accounts Receivable' }),
    ]);
    renderPage();
    await screen.findByText('Cash and Bank');

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText(/search accounts/i), { target: { value: 'Receivable' } });

    expect(screen.queryByText('Cash and Bank')).not.toBeInTheDocument();
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument();
  });

  it('opens the account detail sheet on the same page instead of navigating away (docs/CURRENT_TASKS.md #6)', async () => {
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
    (accountService.getAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAccount());
    (journalEntryService.getAccountLedger as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(await screen.findByText('Cash and Bank'));

    // Still on the Chart of Accounts page (its search control is still there)…
    expect(screen.getByLabelText(/search accounts/i)).toBeInTheDocument();
    // …with the detail sheet's own actions rendered.
    expect(await screen.findByRole('button', { name: /view ledger/i })).toBeInTheDocument();
    expect(screen.getByText(/no postings yet/i)).toBeInTheDocument();
  });
});
