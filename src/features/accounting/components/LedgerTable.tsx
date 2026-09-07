import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
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
export function LedgerTable({
  rows,
  toolbar,
  toolbarLeading,
  singleAccount = false,
}: {
  rows: LedgerViewRow[];
  toolbar?: ReactNode;
  toolbarLeading?: ReactNode;
  /** True when the view is narrowed to one account — the balance column is then a real running balance. */
  singleAccount?: boolean;
}) {
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
      headClassName: 'w-[7rem]',
      sortValue: (r) => r.date,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>,
    },
    {
      key: 'account',
      header: 'Account',
      headClassName: 'w-[12rem]',
      sortValue: (r) => r.accountCode,
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="figure text-xs tabular-nums">{r.accountCode}</span>
          <span className="block max-w-[11rem] truncate text-xs text-muted-foreground" title={r.accountName}>
            {r.accountName}
          </span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortValue: (r) => r.description ?? '',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="block max-w-[56ch] truncate text-sm font-medium text-foreground" title={r.description || undefined}>
            {r.description || '—'}
          </span>
          <RecordLink
            onClick={() => navigate(`/accounting/journals?record=${r.entryId}`)}
            className="figure inline-flex w-fit items-center gap-1 text-xs"
          >
            <FileText className="size-3" aria-hidden="true" />
            {r.entryNumber}
          </RecordLink>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      headClassName: 'w-[7.5rem]',
      hideBelowMd: true,
      sortValue: (r) => r.source ?? '',
      cell: (r) =>
        r.source ? (
          <Badge variant="outline" className="gap-1 text-xs font-normal capitalize">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
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
      headClassName: 'w-[8.5rem] border-l border-border',
      cellClassName: 'border-l border-border',
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
      headClassName: 'w-[8.5rem]',
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
      header: singleAccount ? 'Running balance' : 'Account balance',
      align: 'right',
      headClassName: 'w-[9.5rem]',
      hideBelowMd: true,
      sortValue: (r) => r.balance ?? 0,
      cell: (r) =>
        r.balance === undefined ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Amount value={r.balance} plain className="text-sm font-medium text-foreground" />
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
      toolbar={toolbar}
      toolbarLeading={toolbarLeading}
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
      caption={
        singleAccount
          ? 'Running balance is the selected account only, oldest to newest'
          : 'Account balance shows only once the view is narrowed to a single account'
      }
    />
  );
}
