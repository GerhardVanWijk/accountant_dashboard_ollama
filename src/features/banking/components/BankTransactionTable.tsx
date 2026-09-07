import type { ReactNode } from 'react';
import type { BankAccount } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
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
  onSelect?: (transaction: BankTransactionWithAllocations) => void;
  /** Rendered on the right of the table's filter toolbar. */
  toolbar?: ReactNode;
  /** Rendered at the start of the filter toolbar, before the search box (the bank-account selector). */
  toolbarLeading?: ReactNode;
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
export function BankTransactionTable({ transactions, bankAccountsById, showAccountColumn = false, onAllocate, onDelete, onSelect, toolbar, toolbarLeading }: BankTransactionTableProps) {
  const columns: DataTableColumn<BankTransactionWithAllocations>[] = [
    {
      key: 'date',
      header: 'Date',
      headClassName: 'w-[7.5rem]',
      sortValue: (t) => t.date,
      cell: (t) => <span className="whitespace-nowrap text-sm">{formatDate(t.date)}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      sortValue: (t) => t.description,
      cell: (t) => {
        const needsAllocation = t.allocations.length === 0 && !t.transferPairId;
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="block max-w-[48ch] truncate text-sm font-medium" title={t.description}>
              {onSelect ? (
                <RecordLink onClick={() => onSelect(t)}>{t.description}</RecordLink>
              ) : (
                t.description
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-xs text-muted-foreground" title={t.reference ?? undefined}>
                {t.reference ?? '—'}
              </span>
              {needsAllocation && (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 gap-1 whitespace-nowrap border-status-warning/40 px-1.5 text-[0.6875rem] text-status-warning"
                >
                  <span className="size-1.5 rounded-full bg-status-warning" aria-hidden="true" />
                  Needs allocation
                </Badge>
              )}
            </span>
          </div>
        );
      },
    },
    ...(showAccountColumn
      ? [
          {
            key: 'account',
            header: 'Account',
            headClassName: 'w-[13rem]',
            hideBelowMd: true,
            sortValue: (t: BankTransactionWithAllocations) => bankAccountsById.get(t.bankAccountId)?.name ?? '',
            cell: (t: BankTransactionWithAllocations) => (
              <span className="block max-w-[16rem] truncate text-xs text-muted-foreground" title={bankAccountsById.get(t.bankAccountId)?.name ?? undefined}>
                {bankAccountsById.get(t.bankAccountId)?.name ?? t.bankAccountId}
              </span>
            ),
          } satisfies DataTableColumn<BankTransactionWithAllocations>,
        ]
      : []),
    {
      key: 'in',
      header: 'Money in',
      align: 'right',
      headClassName: 'w-[8.5rem] border-l border-border',
      cellClassName: 'border-l border-border',
      sortValue: (t) => (t.direction === 'debit' ? t.amount : 0),
      cell: (t) =>
        t.direction === 'debit' ? (
          <Amount value={t.amount} plain className="text-sm font-medium" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: 'out',
      header: 'Money out',
      align: 'right',
      headClassName: 'w-[8.5rem]',
      sortValue: (t) => (t.direction === 'credit' ? t.amount : 0),
      cell: (t) =>
        t.direction === 'credit' ? (
          <Amount value={t.amount} plain className="text-sm font-medium" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      headClassName: 'w-[7.5rem]',
      sortValue: (t) => t.status,
      cell: (t) => <StatusBadge status={t.status} className="whitespace-nowrap" />,
    },
    {
      key: 'actions',
      header: '',
      headClassName: 'w-[7.5rem]',
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
      toolbar={toolbar}
      toolbarLeading={toolbarLeading}
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
      onRowClick={onSelect}
      getRowAriaLabel={(t) => `Open transaction ${t.description}`}
    />
  );
}
