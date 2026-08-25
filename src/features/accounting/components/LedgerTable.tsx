import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
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
          <span className="text-xs text-muted-foreground">{r.entryNumber}</span>
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
      emptyTitle="No ledger entries found"
      emptyDescription="Adjust the search or account filter to widen the view."
      caption="Account balance is only shown once the view is narrowed to a single account"
    />
  );
}
