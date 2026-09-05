import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Account, JournalEntry } from '@/types';
import { JournalEntryDetailPage } from './JournalEntryDetailPage';

vi.mock('../hooks/useJournalEntries');
vi.mock('../hooks/useAccounts');
vi.mock('../hooks/useAccountingPeriods');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useJournalEntries } from '../hooks/useJournalEntries';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountingPeriods } from '../hooks/useAccountingPeriods';

const account: Account = {
  id: 'acc_1000', code: '1000', name: 'Cash and Bank', type: 'asset', normalBalance: 'debit',
  isActive: true, createdAt: '', updatedAt: '',
};

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_0001', entryNumber: 'JE-0001', date: '2026-09-01T00:00:00.000Z', memo: 'Opening balances',
    status: 'posted', source: 'manual',
    lines: [
      { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
      { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
    ],
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const reverseJournalEntry = vi.fn();

beforeEach(() => {
  reverseJournalEntry.mockReset().mockResolvedValue(entry({ id: 'je_reversal' }));
  vi.mocked(useJournalEntries).mockReturnValue({
    entries: [entry()], reversedByEntryId: new Map(), loading: false, error: null,
    refetch: vi.fn(), validateLines: vi.fn(), postJournalEntry: vi.fn(), reverseJournalEntry,
  } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [account], postedAccountIds: new Set(), loading: false, error: null, refetch: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn() } as never);
  vi.mocked(useAccountingPeriods).mockReturnValue({ periods: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/accounting/journals/je_0001') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accounting/journals/:journalEntryId" element={<JournalEntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JournalEntryDetailPage', () => {
  it('renders as a full page with the entry number, memo and lines with account labels; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'JE-0001' })).toBeInTheDocument();
    expect(screen.getByText('1000 — Cash and Bank')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('never renders the raw UUID for the record — only its human number', () => {
    renderAt();
    expect(screen.queryByText('je_0001')).not.toBeInTheDocument();
  });

  it('a posted, not-yet-reversed entry offers Reverse entry', async () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Reverse entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reverse entry' }));
    await waitFor(() => expect(reverseJournalEntry).toHaveBeenCalledWith('je_0001'));
  });

  it('an already-reversed entry offers no Reverse action and shows the reversing entry link', () => {
    vi.mocked(useJournalEntries).mockReturnValue({
      entries: [entry(), entry({ id: 'je_0002', entryNumber: 'JE-0002', reversalOfEntryId: 'je_0001', source: 'reversal' })],
      reversedByEntryId: new Map([['je_0001', 'je_0002']]),
      loading: false, error: null, refetch: vi.fn(), validateLines: vi.fn(), postJournalEntry: vi.fn(), reverseJournalEntry,
    } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Reverse entry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'JE-0002' })).toHaveAttribute('href', '/accounting/journals/je_0002');
  });

  it('a reversal entry links back to the entry it reverses', () => {
    vi.mocked(useJournalEntries).mockReturnValue({
      entries: [entry(), entry({ id: 'je_0002', entryNumber: 'JE-0002', reversalOfEntryId: 'je_0001', source: 'reversal' })],
      reversedByEntryId: new Map([['je_0001', 'je_0002']]),
      loading: false, error: null, refetch: vi.fn(), validateLines: vi.fn(), postJournalEntry: vi.fn(), reverseJournalEntry,
    } as never);
    renderAt('/accounting/journals/je_0002');
    expect(screen.getByRole('link', { name: 'JE-0001' })).toHaveAttribute('href', '/accounting/journals/je_0001');
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/accounting/journals/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
