import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { Quote } from '@/types';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

export interface QuoteListProps {
  quotes: Quote[];
  customers: Map<string, string>; // customerId -> customerName
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

/** Quote register, re-skinned onto v0's DataTable (M13) — mirrors InvoiceList.tsx's shape. */
export function QuoteList({ quotes, customers, onSelect, isLoading = false, error }: QuoteListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading quotes…
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

  const columns: DataTableColumn<Quote>[] = [
    {
      key: 'number',
      header: 'Quote',
      sortValue: (q) => q.quoteNumber,
      cell: (q) => (
        <RecordLink onClick={() => onSelect?.(q.id)} className="figure text-sm">
          {q.quoteNumber}
        </RecordLink>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (q) => customers.get(q.customerId) ?? '',
      cell: (q) => <span className="max-w-56 truncate text-sm">{customers.get(q.customerId) ?? 'Unknown customer'}</span>,
    },
    {
      key: 'issueDate',
      header: 'Issued',
      sortValue: (q) => q.issueDate,
      hideBelowMd: true,
      cell: (q) => <span className="figure text-sm text-muted-foreground">{formatDate(q.issueDate)}</span>,
    },
    {
      key: 'expiryDate',
      header: 'Expires',
      sortValue: (q) => q.expiryDate,
      cell: (q) => <span className="figure text-sm text-muted-foreground">{formatDate(q.expiryDate)}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (q) => q.total,
      cell: (q) => <Amount value={q.total} className="text-sm" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (q) => q.status,
      cell: (q) => <StatusBadge status={q.status} />,
    },
  ];

  return (
    <DataTable
      rows={quotes}
      columns={columns}
      getRowKey={(q) => q.id}
      searchable={(q) => `${q.quoteNumber} ${customers.get(q.customerId) ?? ''}`}
      searchPlaceholder="Search quote or customer"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS,
          match: (q, value) => q.status === value,
        },
      ]}
      initialSortKey="issueDate"
      initialSortDirection="desc"
      pageSize={10}
      caption="Customer quotes"
      emptyTitle="No quotes found"
      emptyDescription="Adjust the search or status filter, or raise a new quote."
      onRowClick={onSelect ? (q) => onSelect(q.id) : undefined}
      getRowAriaLabel={(q) => `Open quote ${q.quoteNumber}`}
    />
  );
}
