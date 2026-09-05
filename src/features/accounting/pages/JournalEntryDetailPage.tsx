import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DocumentLineTable,
  RecordActionBar,
  RecordActivitySection,
  RecordField,
  RecordPageHeader,
  RecordPageSection,
  RecordPageShell,
  RecordSummaryGrid,
  type DocumentLineColumn,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountingPeriods } from '../hooks/useAccountingPeriods';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { findPeriodForDate } from '../utils/periodLookup';

type Line = ReturnType<typeof useJournalEntries>['entries'][number]['lines'][number];

/**
 * Full-page Journal Entry detail — route `/accounting/journals/:journalEntryId`
 * (Part 10, whole-project completion audit). The last transaction record
 * that was still sheet-backed — every other document type in the app links
 * here via `?record=<id>`, which now redirects to this canonical page
 * (`useLegacyRecordRedirect`, wired on `JournalsPage`) instead of expanding
 * an inline row. Immutability is structural, not a UI choice: a posted
 * journal entry has no edit action anywhere in this codebase — the only
 * lifecycle transition is a NEW reversing entry (docs/LEDGER_ARCHITECTURE.md,
 * "ledger rows are append-only").
 */
export function JournalEntryDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ journalEntryId: string }>();
  const journalEntryId = recordId ?? params.journalEntryId;

  const { entries, reversedByEntryId, loading, error, reverseJournalEntry } = useJournalEntries();
  const { accounts } = useAccounts();
  const { periods } = useAccountingPeriods();

  const entry = entries.find((e) => e.id === journalEntryId);
  const reversingEntryId = entry ? reversedByEntryId.get(entry.id) : undefined;
  const reversingEntry = reversingEntryId ? entries.find((e) => e.id === reversingEntryId) : undefined;
  const reversedEntry = entry?.reversalOfEntryId ? entries.find((e) => e.id === entry.reversalOfEntryId) : undefined;

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [isReversing, setIsReversing] = useState(false);

  const accountLabel = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
    return (id: string) => map.get(id) ?? id;
  }, [accounts]);

  const totalDebit = entry ? entry.lines.reduce((s, l) => s + l.debit, 0) : 0;
  const totalCredit = entry ? entry.lines.reduce((s, l) => s + l.credit, 0) : 0;

  function lineColumns(): DocumentLineColumn<Line>[] {
    return [
      { key: 'account', header: 'Account', cell: (l) => accountLabel(l.accountId) },
      { key: 'description', header: 'Description', cell: (l) => l.description ?? '—' },
      { key: 'debit', header: 'Debit', align: 'right', cell: (l) => (l.debit > 0 ? <Amount value={l.debit} plain /> : '—') },
      { key: 'credit', header: 'Credit', align: 'right', cell: (l) => (l.credit > 0 ? <Amount value={l.credit} plain /> : '—') },
    ];
  }

  async function handleReverse() {
    if (!entry) return;
    setActionError(null);
    setIsReversing(true);
    try {
      await reverseJournalEntry(entry.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reverse this journal entry.');
    } finally {
      setIsReversing(false);
    }
  }

  const state = loading ? 'loading' : error ? 'error' : entry ? 'ready' : 'not-found';
  const status = entry ? (reversingEntryId ? 'reversed' : entry.status) : undefined;
  const canReverse = entry?.status === 'posted' && !reversingEntryId;
  const period = entry ? findPeriodForDate(periods, entry.date) : undefined;

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Journal entries', to: '/accounting/journals' },
        { label: entry?.entryNumber ?? 'Journal entry' },
      ]}
      backTo="/accounting/journals"
      backLabel="Journal entries"
      embedded={embedded}
      state={state}
      notFoundMessage="This journal entry could not be found — it may have been deleted."
    >
      {entry && (
        <>
          <RecordPageHeader
            recordNumber={entry.entryNumber}
            title={entry.memo || 'Journal entry'}
            meta={`${formatDate(entry.date)}${period ? ` · ${period.name}` : ''} · source: ${entry.source}`}
            status={status && <StatusBadge status={status} />}
            actions={
              <RecordActionBar
                busy={isReversing}
                primary={canReverse ? { label: 'Reverse entry', onClick: () => setConfirmReverse(true) } : undefined}
              />
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <RecordPageSection title="Overview">
            <RecordSummaryGrid>
              <RecordField label="Date" value={formatDate(entry.date)} />
              <RecordField label="Financial period" value={period?.name ?? '—'} />
              <RecordField label="Source" value={entry.source} />
              <RecordField label="Status" value={status && <StatusBadge status={status} />} />
              <RecordField label="Total debit" value={<Amount value={totalDebit} />} />
              <RecordField label="Total credit" value={<Amount value={totalCredit} />} />
              {entry.currency && <RecordField label="Currency" value={entry.currency} />}
              {reversedEntry && (
                <RecordField
                  label="Reverses"
                  value={<Link className="font-medium text-brand hover:underline" to={`/accounting/journals/${reversedEntry.id}`}>{reversedEntry.entryNumber}</Link>}
                />
              )}
              {reversingEntry && (
                <RecordField
                  label="Reversed by"
                  value={<Link className="font-medium text-brand hover:underline" to={`/accounting/journals/${reversingEntry.id}`}>{reversingEntry.entryNumber}</Link>}
                />
              )}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Journal lines">
            <DocumentLineTable columns={lineColumns()} rows={entry.lines} rowKey={(l) => l.id} />
          </RecordPageSection>

          <RecordActivitySection
            recordType="JournalEntry"
            recordId={entry.id}
            title="Record activity"
            subtitle="Changes and lifecycle events for this journal entry."
          />

          <ConfirmDialog
            open={confirmReverse}
            onOpenChange={setConfirmReverse}
            title={`Reverse ${entry.entryNumber}?`}
            description="This posts a NEW journal entry with every debit and credit swapped, exactly offsetting this one. The original entry is never edited or deleted — the ledger stays append-only."
            confirmLabel="Reverse entry"
            destructive
            onConfirm={() => {
              setConfirmReverse(false);
              void handleReverse();
            }}
          />
        </>
      )}
    </RecordPageShell>
  );
}
