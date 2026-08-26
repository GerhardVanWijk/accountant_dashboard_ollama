import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { Bill, ID } from '@/types';

export interface SupplierBillHistoryTableProps {
  bills: Bill[];
  /** Real outstanding amount per bill, from `billsToOpenBills()` (Math.max(0, total - amountPaid)) —
   * the same figure already computed for the aging/financial-summary cards above this tab. Draft/void
   * bills, and bills already paid in full, are excluded from that conversion, so they render a dash here. */
  outstandingByBillId: Map<ID, number>;
}

/**
 * Real bill transaction history for one supplier — the supplier-scoped
 * slice of `useBills()` SupplierDetailPage already fetches for its
 * aging/financial-summary figures, now also rendered as a list instead of
 * only being summed. Re-uses the shared v0 DataTable, matching every other
 * register in the app (SupplierTable, LedgerTable, JournalsTable). No new
 * financial computation — `total`/`status`/dates come straight off the real
 * Bill record, and `outstanding` is looked up from the already-computed
 * open-bills map, not recalculated here.
 */
export function SupplierBillHistoryTable({ bills, outstandingByBillId }: SupplierBillHistoryTableProps) {
  const columns: DataTableColumn<Bill>[] = [
    {
      key: 'billNumber',
      header: 'Bill',
      sortValue: (b) => b.billNumber,
      cell: (b) => <span className="figure text-sm font-medium text-foreground tabular-nums">{b.billNumber}</span>,
    },
    {
      key: 'issueDate',
      header: 'Date',
      sortValue: (b) => b.issueDate,
      cell: (b) => <span className="whitespace-nowrap">{formatDate(b.issueDate)}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due date',
      sortValue: (b) => b.dueDate,
      hideBelowMd: true,
      cell: (b) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(b.dueDate)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (b) => b.status,
      cell: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (b) => b.total,
      cell: (b) => <Amount value={b.total} className="text-sm font-medium" />,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (b) => outstandingByBillId.get(b.id) ?? 0,
      cell: (b) => {
        const outstanding = outstandingByBillId.get(b.id);
        return outstanding !== undefined && outstanding > 0 ? (
          <Amount value={outstanding} className="text-sm font-medium" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={bills}
      columns={columns}
      getRowKey={(b) => b.id}
      searchable={(b) => [b.billNumber, b.status].join(' ')}
      searchPlaceholder="Search bill number"
      initialSortKey="issueDate"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: Array.from(new Set(bills.map((b) => b.status)))
            .sort()
            .map((status) => {
              const label = status.replace(/_/g, ' ');
              return { value: status, label: label.charAt(0).toUpperCase() + label.slice(1) };
            }),
          match: (b, value) => b.status === value,
        },
      ]}
      emptyTitle="No bills yet"
      emptyDescription="Bills received from this supplier will appear here."
      caption="Bill transaction history"
    />
  );
}
