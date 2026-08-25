import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { ID, JournalEntry } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountingPeriods } from '../hooks/useAccountingPeriods';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { JournalsTable } from '../components/JournalsTable';
import { JournalEntryFormModal } from '../components/JournalEntryFormModal';

/**
 * General Journals — manual entry workspace, route `/accounting/journals`
 * (docs/ROUTES.md). Real useJournalEntries()/JournalEntryService data;
 * posting and reversal both go through the same service methods as before
 * the port — this page never decides balance or period-open rules itself.
 * v0's mock journals assume a draft/awaiting-review approval workflow;
 * the real engine posts immediately and only knows draft/posted/reversed,
 * so those summary tiles are replaced with ones the real data supports —
 * see the M3 report.
 */
export function JournalsPage() {
  const { accounts } = useAccounts();
  const { periods } = useAccountingPeriods();
  const { entries, reversedByEntryId, loading, error, refetch, validateLines, postJournalEntry, reverseJournalEntry } =
    useJournalEntries();
  const [showForm, setShowForm] = useState(false);
  const [reversingEntryId, setReversingEntryId] = useState<ID | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);

  const posted = entries.filter((e) => e.status === 'posted' && !reversedByEntryId.has(e.id));
  const reversed = entries.filter((e) => reversedByEntryId.has(e.id));
  const postedValue = posted.reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.debit, 0), 0);

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
    <>
      <PageHeader
        title="Journal entries"
        description="Manual adjustments to the ledger. Every entry carries equal debits and credits and posts to the ledger immediately."
        actions={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus data-icon="inline-start" />
            New journal entry
          </Button>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <FigureBlock label="Posted value" value={formatCurrency(postedValue)} hint={`${posted.length} entries in the ledger`} />
          <FigureBlock label="Reversals" value={String(reversed.length)} hint="Corrected by a reversing entry" />
          <FigureBlock label="Total entries" value={String(entries.length)} hint="Across every posted period" />
          <FigureBlock label="Accounts in use" value={String(accounts.filter((a) => a.isActive).length)} hint="Active, postable accounts" />
        </div>
      </SectionCard>

      {reverseError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {reverseError}
        </p>
      )}

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading journal entries…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && (
        <JournalsTable
          entries={entries}
          accounts={accounts}
          periods={periods}
          reversedByEntryId={reversedByEntryId}
          onReverse={handleReverse}
          reversingEntryId={reversingEntryId}
        />
      )}

      {showForm && (
        <JournalEntryFormModal
          accounts={accounts}
          validateLines={validateLines}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => {
            await postJournalEntry(input);
            setShowForm(false);
          }}
        />
      )}
    </>
  );
}
