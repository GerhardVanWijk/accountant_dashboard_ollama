import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate, formatDueLabel } from '@/lib/app/format';
import { invoiceService } from '@/services';
import type { Invoice } from '@/types';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void', label: 'Void' },
];

export interface InvoiceListProps {
  invoices: Invoice[];
  customers: Map<string, string>; // customerId -> customerName
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * Invoice register, re-skinned onto v0's DataTable. `invoiceService.
 * isOverdue()` (existing, real) drives the "overdue" note on the due-date
 * cell — the persisted `status` field itself is never auto-flipped to
 * 'overdue' by any service method, so a sent/partially-paid invoice past
 * its due date still shows its real status plus this computed hint,
 * rather than a status this app has no way to actually set. See the M4
 * report.
 */
export function InvoiceList({ invoices, customers, onSelect, isLoading = false, error }: InvoiceListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading invoices…
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex min-h-[40vh] items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      sortValue: (inv) => inv.invoiceNumber,
      cell: (inv) => (
        <button
          type="button"
          onClick={() => onSelect?.(inv.id)}
          className="figure text-sm font-medium underline-offset-4 hover:text-brand hover:underline"
        >
          {inv.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (inv) => customers.get(inv.customerId) ?? '',
      cell: (inv) => <span className="max-w-56 truncate text-sm">{customers.get(inv.customerId) ?? 'Unknown customer'}</span>,
    },
    {
      key: 'issueDate',
      header: 'Issued',
      sortValue: (inv) => inv.issueDate,
      hideBelowMd: true,
      cell: (inv) => <span className="figure text-sm text-muted-foreground">{formatDate(inv.issueDate)}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortValue: (inv) => inv.dueDate,
      cell: (inv) => (
        <div className="flex flex-col gap-0.5">
          <span className="figure text-sm">{formatDate(inv.dueDate)}</span>
          {inv.status !== 'paid' && inv.status !== 'void' ? (
            <span className={invoiceService.isOverdue(inv) ? 'text-xs text-negative' : 'text-xs text-muted-foreground'}>
              {formatDueLabel(inv.dueDate)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (inv) => inv.total,
      cell: (inv) => <Amount value={inv.total} className="text-sm" />,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (inv) => inv.total - inv.amountPaid,
      cell: (inv) => {
        const outstanding = inv.total - inv.amountPaid;
        return <Amount value={outstanding} className={outstanding === 0 ? 'text-sm text-muted-foreground' : 'text-sm font-medium'} />;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (inv) => inv.status,
      cell: (inv) => <StatusBadge status={inv.status} />,
    },
  ];

  return (
    <DataTable
      rows={invoices}
      columns={columns}
      getRowKey={(inv) => inv.id}
      searchable={(inv) => `${inv.invoiceNumber} ${customers.get(inv.customerId) ?? ''}`}
      searchPlaceholder="Search invoice or customer"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS,
          match: (inv, value) => inv.status === value,
        },
      ]}
      initialSortKey="dueDate"
      pageSize={10}
      caption="Customer invoices"
      emptyTitle="No invoices found"
      emptyDescription="Adjust the search or status filter, or raise a new invoice."
    />
  );
}
