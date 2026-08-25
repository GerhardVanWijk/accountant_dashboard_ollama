import type { BankAccount } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import type { BankTransactionWithAllocations } from '../types';

export interface BankTransactionTableProps {
  transactions: BankTransactionWithAllocations[];
  bankAccountsById: Map<string, BankAccount>;
  showAccountColumn?: boolean;
  onAllocate: (transaction: BankTransactionWithAllocations) => void;
  onDelete: (transaction: BankTransactionWithAllocations) => void;
}

/**
 * Bank transactions list, re-skinned onto v0's DataTable. Real
 * `BankTransactionStatus` (unreconciled/matched/reconciled) — not v0's own
 * mock set (matched/unmatched/needs-review), and no "Balance" or "matched
 * record" columns: the real domain has no per-transaction running balance
 * anywhere (only the account's own `currentBalance` and the reconciliation
 * service's point-in-time `glCashbookBalance`), and `matchedEntityId` has
 * no service that ever populates a human-readable label for it — see the
 * M5 report. Money in/out split into separate columns, matching v0's
 * unambiguous-direction convention.
 */
export function BankTransactionTable({ transactions, bankAccountsById, showAccountColumn = false, onAllocate, onDelete }: BankTransactionTableProps) {
  const columns: DataTableColumn<BankTransactionWithAllocations>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (t) => t.date,
      cell: (t) => <span className="whitespace-nowrap">{formatDate(t.date)}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      sortValue: (t) => t.description,
      cell: (t) => {
        const needsAllocation = t.allocations.length === 0 && !t.transferPairId;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm">
              {t.description}
              {needsAllocation && (
                <Badge variant="outline" className="text-warning">
                  Needs allocation
                </Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{t.reference ?? '—'}</span>
          </div>
        );
      },
    },
    ...(showAccountColumn
      ? [
          {
            key: 'account',
            header: 'Account',
            hideBelowMd: true,
            sortValue: (t: BankTransactionWithAllocations) => bankAccountsById.get(t.bankAccountId)?.name ?? '',
            cell: (t: BankTransactionWithAllocations) => (
              <span className="text-xs text-muted-foreground">{bankAccountsById.get(t.bankAccountId)?.name ?? t.bankAccountId}</span>
            ),
          } satisfies DataTableColumn<BankTransactionWithAllocations>,
        ]
      : []),
    {
      key: 'in',
      header: 'Money in',
      align: 'right',
      sortValue: (t) => (t.direction === 'debit' ? t.amount : 0),
      cell: (t) => (t.direction === 'debit' ? <Amount value={t.amount} plain className="text-sm text-positive" /> : <span className="text-xs text-muted-foreground">&mdash;</span>),
    },
    {
      key: 'out',
      header: 'Money out',
      align: 'right',
      sortValue: (t) => (t.direction === 'credit' ? t.amount : 0),
      cell: (t) => (t.direction === 'credit' ? <Amount value={t.amount} plain className="text-sm" /> : <span className="text-xs text-muted-foreground">&mdash;</span>),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (t) => t.status,
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'actions',
      header: '',
      headClassName: 'w-24',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={Boolean(t.transferPairId)}
            onClick={() => onAllocate(t)}
            aria-label={`Allocate ${t.description}`}
          >
            Allocate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={t.status === 'reconciled'}
            onClick={() => onDelete(t)}
            aria-label={`Delete ${t.description}`}
            className="text-muted-foreground hover:text-destructive"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={transactions}
      columns={columns}
      getRowKey={(t) => t.id}
      searchable={(t) => [t.description, t.reference ?? '', t.category ?? ''].join(' ')}
      searchPlaceholder="Search description or reference"
      initialSortKey="date"
      initialSortDirection="desc"
      pageSize={15}
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'unreconciled', label: 'Unreconciled' },
            { value: 'matched', label: 'Matched' },
            { value: 'reconciled', label: 'Reconciled' },
          ],
          match: (t, value) => t.status === value,
        },
      ]}
      emptyTitle="No transactions found"
      emptyDescription="Adjust the search or filters to widen the view."
    />
  );
}
