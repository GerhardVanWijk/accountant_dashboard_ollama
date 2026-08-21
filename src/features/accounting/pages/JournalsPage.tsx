import { useMemo, useState } from 'react';
import type { ID, JournalEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAccounts } from '../hooks/useAccounts';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { JournalEntryForm } from '../components/JournalEntryForm';
import { JournalEntryList } from '../components/JournalEntryList';
import { Modal } from '../components/Modal';
import { defaultJournalEntryFilters, type JournalEntryFilters } from '../types/journalEntry.types';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** General Journals — manual entry workspace, route `/accounting/journals` (docs/ROUTES.md). */
export function JournalsPage() {
  const { accounts } = useAccounts();
  const { entries, reversedByEntryId, loading, error, refetch, validateLines, postJournalEntry, reverseJournalEntry } =
    useJournalEntries();
  const [filters, setFilters] = useState<JournalEntryFilters>(defaultJournalEntryFilters);
  const [showForm, setShowForm] = useState(false);
  const [reversingEntryId, setReversingEntryId] = useState<ID | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);

  const sources = useMemo(() => Array.from(new Set(entries.map((e) => e.source))).sort(), [entries]);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (search) {
        const haystack = `${entry.entryNumber} ${entry.memo ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.source !== 'all' && entry.source !== filters.source) return false;
      return true;
    });
  }, [entries, filters]);

  async function handleReverse(entry: JournalEntry): Promise<void> {
    setReverseError(null);
    setReversingEntryId(entry.id);
    try {
      await reverseJournalEntry(entry.id);
    } catch (err) {
      setReverseError(err instanceof Error ? err.message : 'Could not reverse journal entry.');
    } finally {
      setReversingEntryId(null);
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">General Journals</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Post manual, balanced double-entry journal entries directly to the general ledger.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <Icon name="add" size={16} />
          New Journal Entry
        </Button>
      </div>

      <Card className="flex flex-col gap-sm md:flex-row md:items-center">
        <label className="flex flex-1 flex-col gap-xs text-sm">
          <span className="sr-only">Search journal entries</span>
          <input
            aria-label="Search journal entries"
            className={inputClass}
            placeholder="Search by entry number or memo…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <select
          aria-label="Filter by source"
          className={inputClass}
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
        >
          <option value="all">All Sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </Card>

      {reverseError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {reverseError}
        </p>
      )}

      {loading && <Spinner label="Loading journal entries…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          title="No journal entries yet"
          message="Post your first manual journal entry to start the general ledger."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>
              New Journal Entry
            </Button>
          }
        />
      )}

      {!loading && !error && entries.length > 0 && filtered.length === 0 && (
        <EmptyState title="No matching journal entries" message="Try adjusting your search or filters." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <JournalEntryList
          entries={filtered}
          accounts={accounts}
          reversedByEntryId={reversedByEntryId}
          onReverse={handleReverse}
          reversingEntryId={reversingEntryId}
        />
      )}

      {showForm && (
        <Modal title="New Journal Entry" onClose={() => setShowForm(false)} wide>
          <JournalEntryForm
            accounts={accounts}
            validateLines={validateLines}
            onCancel={() => setShowForm(false)}
            onSubmit={async (input) => {
              await postJournalEntry(input);
              setShowForm(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
