import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Account, AccountingPeriod, ID, JournalEntry } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import { findPeriodForDate } from '../utils/periodLookup';

/** The double-entry lines behind one journal, shown when a row is expanded. */
function JournalLines({
  entry,
  accountLabel,
  reversalEntryId,
  reversing,
  onReverse,
}: {
  entry: JournalEntry;
  accountLabel: (id: ID) => string;
  reversalEntryId: ID | undefined;
  reversing: boolean;
  onReverse: () => void;
}) {
  const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Journal lines</p>
        <p className="text-xs text-muted-foreground">
          Source: {entry.source}
          {entry.reversalOfEntryId && <> &middot; reverses entry {entry.reversalOfEntryId}</>}
          {reversalEntryId && <> &middot; reversed by entry {reversalEntryId}</>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-4 text-left font-medium">
                Account
              </th>
              <th scope="col" className="py-2 pr-4 text-left font-medium">
                Description
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Debit
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Credit
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id} className="border-b border-border/50">
                <td className="figure py-2 pr-4 align-top text-xs tabular-nums">{accountLabel(line.accountId)}</td>
                <td className="py-2 pr-4 align-top text-xs text-muted-foreground">{line.description ?? '—'}</td>
                <td className="py-2 pr-4 text-right align-top">
                  {line.debit > 0 ? (
                    <Amount value={line.debit} plain className="text-xs" />
                  ) : (
                    <span className="text-xs text-muted-foreground">&mdash;</span>
                  )}
                </td>
                <td className="py-2 text-right align-top">
                  {line.credit > 0 ? (
                    <Amount value={line.credit} plain className="text-xs" />
                  ) : (
                    <span className="text-xs text-muted-foreground">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="py-2 text-xs font-medium uppercase">
                Totals
              </td>
              <td className="py-2 pr-4 text-right">
                <Amount value={totalDebit} plain className="text-xs font-semibold" />
              </td>
              <td className="py-2 text-right">
                <Amount value={totalCredit} plain className="text-xs font-semibold" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={Boolean(reversalEntryId) || reversing}
          onClick={onReverse}
        >
          {reversing ? 'Reversing…' : reversalEntryId ? 'Already reversed' : 'Reverse entry'}
        </Button>
      </div>
    </div>
  );
}

export interface JournalsTableProps {
  entries: JournalEntry[];
  accounts: Account[];
  periods: AccountingPeriod[];
  reversedByEntryId: Map<ID, ID>;
  onReverse: (entry: JournalEntry) => void;
  reversingEntryId: ID | null;
}

/**
 * Posted journal entries, newest first, expandable to their double-entry
 * lines — re-skinned onto v0's DataTable + renderDetail pattern. "Reversed"
 * is derived purely from `reversedByEntryId` (does another entry point
 * `reversalOfEntryId` at this one), never from a mutated field on the entry
 * itself (docs/LEDGER_ARCHITECTURE.md) — same rule the pre-port
 * JournalEntryList enforced. Period label is a pure lookup via the
 * existing findPeriodForDate() utility, not a stored field on the entry.
 */
export function JournalsTable({ entries, accounts, periods, reversedByEntryId, onReverse, reversingEntryId }: JournalsTableProps) {
  const [openId, setOpenId] = useState<ID | null>(null);

  const accountLabel = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
    return (id: ID) => map.get(id) ?? id;
  }, [accounts]);

  const periodLabel = useMemo(() => {
    return (date: string) => findPeriodForDate(periods, date)?.name;
  }, [periods]);

  const columns: DataTableColumn<JournalEntry>[] = [
    {
      key: 'expand',
      header: '',
      headClassName: 'w-10',
      cell: (entry) => {
        const open = openId === entry.id;
        return (
          <button
            type="button"
            onClick={() => setOpenId(open ? null : entry.id)}
            aria-expanded={open}
            aria-label={open ? `Hide lines for ${entry.entryNumber}` : `Show lines for ${entry.entryNumber}`}
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          </button>
        );
      },
    },
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
      caption="Expand a row to see its double-entry lines"
      renderDetail={(entry) =>
        entry.id === openId ? (
          <div className="px-4 pb-4">
            <JournalLines
              entry={entry}
              accountLabel={accountLabel}
              reversalEntryId={reversedByEntryId.get(entry.id)}
              reversing={reversingEntryId === entry.id}
              onReverse={() => onReverse(entry)}
            />
          </div>
        ) : null
      }
    />
  );
}
