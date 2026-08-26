import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { ID, Invoice } from '@/types';

export interface CustomerInvoiceHistoryTableProps {
  invoices: Invoice[];
  /** Real outstanding amount per invoice, from `invoicesToOpenItems()` (Math.max(0, total - amountPaid)) —
   * the same figure already computed for the aging/financial-summary cards above this tab. Draft/void
   * invoices are excluded from that conversion (no real AR outstanding), so they render a dash here. */
  outstandingByInvoiceId: Map<ID, number>;
}

/**
 * Real invoice transaction history for one customer — the customer-scoped
 * slice of `useInvoices()` CustomerDetailPage already fetches for its
 * aging/financial-summary figures, now also rendered as a list instead of
 * only being summed. Re-uses the shared v0 DataTable, matching every other
 * register in the app (CustomerTable, LedgerTable, JournalsTable). No new
 * financial computation — `total`/`status`/dates come straight off the real
 * Invoice record, and `outstanding` is looked up from the already-computed
 * open-items map, not recalculated here.
 */
export function CustomerInvoiceHistoryTable({ invoices, outstandingByInvoiceId }: CustomerInvoiceHistoryTableProps) {
  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      sortValue: (inv) => inv.invoiceNumber,
      cell: (inv) => <span className="figure text-sm font-medium text-foreground tabular-nums">{inv.invoiceNumber}</span>,
    },
    {
      key: 'issueDate',
      header: 'Date',
      sortValue: (inv) => inv.issueDate,
      cell: (inv) => <span className="whitespace-nowrap">{formatDate(inv.issueDate)}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due date',
      sortValue: (inv) => inv.dueDate,
      hideBelowMd: true,
      cell: (inv) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(inv.dueDate)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (inv) => inv.status,
      cell: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (inv) => inv.total,
      cell: (inv) => <Amount value={inv.total} className="text-sm font-medium" />,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (inv) => outstandingByInvoiceId.get(inv.id) ?? 0,
      cell: (inv) => {
        const outstanding = outstandingByInvoiceId.get(inv.id);
        return outstanding !== undefined && outstanding > 0 ? (
          <Amount value={outstanding} className="text-sm font-medium text-negative" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={invoices}
      columns={columns}
      getRowKey={(inv) => inv.id}
      searchable={(inv) => [inv.invoiceNumber, inv.status].join(' ')}
      searchPlaceholder="Search invoice number"
      initialSortKey="issueDate"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: Array.from(new Set(invoices.map((inv) => inv.status)))
            .sort()
            .map((status) => {
              const label = status.replace(/_/g, ' ');
              return { value: status, label: label.charAt(0).toUpperCase() + label.slice(1) };
            }),
          match: (inv, value) => inv.status === value,
        },
      ]}
      emptyTitle="No invoices yet"
      emptyDescription="Invoices raised against this customer will appear here."
      caption="Invoice transaction history"
    />
  );
}
