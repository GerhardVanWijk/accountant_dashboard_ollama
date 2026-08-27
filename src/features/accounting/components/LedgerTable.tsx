import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Badge } from '@/components/ui/shadcn/badge';
import { formatDate } from '@/lib/app/format';
import type { LedgerViewRow } from '../utils/buildLedgerRows';

/**
 * Every posted line that hit the ledger, newest first — re-skinned onto
 * v0's DataTable. `balance` is only populated once the page has narrowed
 * to a single account (see buildLedgerRows.ts); until then the column
 * reads as a dash rather than a total, so it's never mistaken for a
 * cross-account sum.
 */
export function LedgerTable({ rows }: { rows: LedgerViewRow[] }) {
  const navigate = useNavigate();
  // Real `source` values (e.g. "manual", "invoice", "bill") come straight
  // from JournalEntry.source — a free-form string, not a fixed enum like
  // v0's mock ("Invoice"/"Payment"/"Expense"/"Journal"/"Bank"), so the
  // filter's options are derived from what's actually present in `rows`
  // rather than a hardcoded list that could hide real values.
  const sourceOptions = [...new Set(rows.map((r) => r.source).filter((s): s is string => Boolean(s)))]
    .sort()
    .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  const columns: DataTableColumn<LedgerViewRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.date,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>,
    },
    {
      key: 'account',
      header: 'Account',
      sortValue: (r) => r.accountCode,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="figure text-xs tabular-nums">{r.accountCode}</span>
          <span className="text-xs text-muted-foreground">{r.accountName}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortValue: (r) => r.description ?? '',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-sm">{r.description || '—'}</span>
          <RecordLink onClick={() => navigate(`/accounting/journals?record=${r.entryId}`)} className="figure text-xs">
            {r.entryNumber}
          </RecordLink>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      hideBelowMd: true,
      sortValue: (r) => r.source ?? '',
      cell: (r) =>
        r.source ? (
          <Badge variant="outline" className="text-xs font-normal capitalize">
            {r.source}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      sortValue: (r) => r.debit,
      cell: (r) =>
        r.debit > 0 ? (
          <Amount value={r.debit} plain className="text-sm" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      sortValue: (r) => r.credit,
      cell: (r) =>
        r.credit > 0 ? (
          <Amount value={r.credit} plain className="text-sm" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: 'balance',
      header: 'Account balance',
      align: 'right',
      hideBelowMd: true,
      sortValue: (r) => r.balance ?? 0,
      cell: (r) =>
        r.balance === undefined ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Amount value={r.balance} plain className="text-sm text-muted-foreground" />
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      searchable={(r) => [r.entryNumber, r.description ?? '', r.accountCode, r.accountName].join(' ')}
      searchPlaceholder="Search entry, description or account"
      initialSortKey="date"
      initialSortDirection="desc"
      pageSize={15}
      filters={
        sourceOptions.length > 0
          ? [
              {
                key: 'source',
                label: 'All sources',
                options: sourceOptions,
                match: (r, value) => r.source === value,
              },
            ]
          : []
      }
      emptyTitle="No ledger entries found"
      emptyDescription="Adjust the search or account filter to widen the view."
      caption="Account balance is only shown once the view is narrowed to a single account"
    />
  );
}
