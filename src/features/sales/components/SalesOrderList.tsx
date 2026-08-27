import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { SalesOrder } from '@/types';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

export interface SalesOrderListProps {
  salesOrders: SalesOrder[];
  customers: Map<string, string>; // customerId -> customerName
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

/** Sales Order register, re-skinned onto v0's DataTable (M13) — mirrors InvoiceList.tsx/QuoteList.tsx's shape. */
export function SalesOrderList({ salesOrders, customers, onSelect, isLoading = false, error }: SalesOrderListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading sales orders…
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

  const columns: DataTableColumn<SalesOrder>[] = [
    {
      key: 'number',
      header: 'Order',
      sortValue: (o) => o.orderNumber,
      cell: (o) => (
        <RecordLink onClick={() => onSelect?.(o.id)} className="figure text-sm">
          {o.orderNumber}
        </RecordLink>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (o) => customers.get(o.customerId) ?? '',
      cell: (o) => <span className="max-w-56 truncate text-sm">{customers.get(o.customerId) ?? 'Unknown customer'}</span>,
    },
    {
      key: 'orderDate',
      header: 'Ordered',
      sortValue: (o) => o.orderDate,
      hideBelowMd: true,
      cell: (o) => <span className="figure text-sm text-muted-foreground">{formatDate(o.orderDate)}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => <Amount value={o.total} className="text-sm" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (o) => o.status,
      cell: (o) => <StatusBadge status={o.status} />,
    },
  ];

  return (
    <DataTable
      rows={salesOrders}
      columns={columns}
      getRowKey={(o) => o.id}
      searchable={(o) => `${o.orderNumber} ${customers.get(o.customerId) ?? ''}`}
      searchPlaceholder="Search order or customer"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS,
          match: (o, value) => o.status === value,
        },
      ]}
      initialSortKey="orderDate"
      initialSortDirection="desc"
      pageSize={10}
      caption="Customer sales orders"
      emptyTitle="No sales orders found"
      emptyDescription="Adjust the search or status filter, or raise a new sales order."
      onRowClick={onSelect ? (o) => onSelect(o.id) : undefined}
      getRowAriaLabel={(o) => `Open sales order ${o.orderNumber}`}
    />
  );
}
