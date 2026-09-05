import { useMemo } from 'react';
import type { AccountingPeriod, ID, JournalEntry } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { findPeriodForDate } from '../utils/periodLookup';

export interface JournalsTableProps {
  entries: JournalEntry[];
  periods: AccountingPeriod[];
  reversedByEntryId: Map<ID, ID>;
  /** Row click navigates to the full-page record (Part 10) — same convention as every other document list. */
  onRowClick: (entry: JournalEntry) => void;
}

/**
 * Posted journal entries, newest first — re-skinned onto v0's DataTable.
 * Row click navigates to `JournalEntryDetailPage` (`/accounting/journals/:id`)
 * — the inline expand-to-lines mechanic this table used before Part 10 is
 * gone; the full page owns the lines, audit history, and the Reverse
 * action now. "Reversed" is derived purely from `reversedByEntryId` (does
 * another entry point `reversalOfEntryId` at this one), never from a
 * mutated field on the entry itself (docs/LEDGER_ARCHITECTURE.md). Period
 * label is a pure lookup via the existing findPeriodForDate() utility, not
 * a stored field on the entry.
 */
export function JournalsTable({ entries, periods, reversedByEntryId, onRowClick }: JournalsTableProps) {
  const periodLabel = useMemo(() => {
    return (date: string) => findPeriodForDate(periods, date)?.name;
  }, [periods]);

  const columns: DataTableColumn<JournalEntry>[] = [
    {
      key: 'number',
      header: 'Journal',
      sortValue: (e) => e.entryNumber,
      cell: (e) => (
        <div className="flex flex-col">
          <span className="figure font-medium text-foreground">{e.entryNumber}</span>
          {e.reversalOfEntryId && <span className="text-xs text-muted-foreground">Reversal</span>}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortValue: (e) => e.memo ?? '',
      cell: (e) => (
        <div className="flex flex-col">
          <span>{e.memo || '—'}</span>
          <span className="text-xs text-muted-foreground">{e.lines.length} lines</span>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (e) => e.date,
      cell: (e) => (
        <div className="flex flex-col">
          <span>{formatDate(e.date)}</span>
          <span className="text-xs text-muted-foreground">{periodLabel(e.date) ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'totalDebit',
      header: 'Value',
      align: 'right',
      sortValue: (e) => e.lines.reduce((sum, l) => sum + l.debit, 0),
      cell: (e) => <Amount value={e.lines.reduce((sum, l) => sum + l.debit, 0)} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (e) => (reversedByEntryId.has(e.id) ? 'reversed' : e.status),
      cell: (e) => <StatusBadge status={reversedByEntryId.has(e.id) ? 'reversed' : e.status} />,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [e.entryNumber, e.memo ?? '', e.source].join(' ')}
      searchPlaceholder="Search journal or description"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'source',
          label: 'All sources',
          options: Array.from(new Set(entries.map((e) => e.source)))
            .sort()
            .map((source) => ({ value: source, label: source })),
          match: (e, value) => e.source === value,
        },
      ]}
      emptyTitle="No journals found"
      emptyDescription="Adjust the filters, or capture a new journal entry."
      caption="Select a row to view its double-entry lines"
      onRowClick={onRowClick}
    />
  );
}
