import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountingPeriods } from '../hooks/useAccountingPeriods';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { JournalsTable } from '../components/JournalsTable';
import { JournalEntryFormModal } from '../components/JournalEntryFormModal';

/**
 * General Journals — manual entry workspace, route `/accounting/journals`
 * (docs/ROUTES.md). Real useJournalEntries()/JournalEntryService data;
 * posting goes through the same service method as before the port — this
 * page never decides balance or period-open rules itself. A row click
 * navigates to the full-page record at `/accounting/journals/:journalEntryId`
 * (`JournalEntryDetailPage`, Part 10) — the lines, audit history and the
 * Reverse action all live there now; legacy `?record=<id>` deep links (every
 * other document's "View journal entry" link still uses this form) redirect
 * there via `useLegacyRecordRedirect`, same mechanism `CreditNotesPage` uses.
 * v0's mock journals assume a draft/awaiting-review approval workflow; the
 * real engine posts immediately and only knows draft/posted/reversed, so
 * those summary tiles are replaced with ones the real data supports — see
 * the M3 report.
 */
export function JournalsPage() {
  useLegacyRecordRedirect('/accounting/journals');
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const { periods } = useAccountingPeriods();
  const { entries, reversedByEntryId, loading, error, refetch, validateLines, postJournalEntry } = useJournalEntries();
  const [showForm, setShowForm] = useState(false);

  const posted = entries.filter((e) => e.status === 'posted' && !reversedByEntryId.has(e.id));
  const reversed = entries.filter((e) => reversedByEntryId.has(e.id));
  const postedValue = posted.reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.debit, 0), 0);

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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Posted value" value={formatCurrency(postedValue)} hint={`${posted.length} entries in the ledger`} />
          <FigureBlock label="Reversals" value={String(reversed.length)} hint="Corrected by a reversing entry" />
          <FigureBlock label="Total entries" value={String(entries.length)} hint="Across every posted period" />
          <FigureBlock label="Accounts in use" value={String(accounts.filter((a) => a.isActive).length)} hint="Active, postable accounts" />
        </div>
      </SectionCard>

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
          periods={periods}
          reversedByEntryId={reversedByEntryId}
          onRowClick={(entry) => navigate(`/accounting/journals/${entry.id}`)}
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
