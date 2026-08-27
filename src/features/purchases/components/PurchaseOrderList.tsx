import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/types';

export interface PurchaseOrderListProps {
  purchaseOrders: PurchaseOrder[];
  suppliersMap?: Record<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
};
const STATUS_OPTIONS: PurchaseOrderStatus[] = ['draft', 'sent', 'partially_received', 'received', 'cancelled'];

/** Purchase order register, re-skinned onto v0's DataTable (M8). Same raw-supplierId display bug fixed as BillList — suppliersMap now actually threaded through. */
export function PurchaseOrderList({ purchaseOrders, suppliersMap = {}, onSelect, isLoading = false, error }: PurchaseOrderListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading purchase orders…
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

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: 'number',
      header: 'PO',
      sortValue: (po) => po.poNumber,
      cell: (po) => (
        <RecordLink onClick={() => onSelect?.(po.id)} className="figure text-sm">
          {po.poNumber}
        </RecordLink>
      ),
    },
    { key: 'supplier', header: 'Supplier', sortValue: (po) => suppliersMap[po.supplierId] ?? '', cell: (po) => suppliersMap[po.supplierId] ?? 'Unknown supplier' },
    { key: 'date', header: 'Order date', sortValue: (po) => po.orderDate, cell: (po) => formatDate(po.orderDate) },
    { key: 'expected', header: 'Expected', hideBelowMd: true, sortValue: (po) => po.expectedDate ?? '', cell: (po) => (po.expectedDate ? formatDate(po.expectedDate) : '—') },
    { key: 'total', header: 'Total', align: 'right', sortValue: (po) => po.total, cell: (po) => <Amount value={po.total} className="text-sm font-medium" /> },
    { key: 'status', header: 'Status', sortValue: (po) => po.status, cell: (po) => <StatusBadge status={po.status} /> },
  ];

  return (
    <DataTable
      rows={purchaseOrders}
      columns={columns}
      getRowKey={(po) => po.id}
      searchable={(po) => [po.poNumber, suppliersMap[po.supplierId] ?? '', po.notes ?? ''].join(' ')}
      searchPlaceholder="Search PO number, supplier or notes"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          match: (po, value) => po.status === value,
        },
      ]}
      emptyTitle="No purchase orders found"
      emptyDescription="Adjust the filters, or create a new purchase order."
      caption="Purchase order register"
      onRowClick={onSelect ? (po) => onSelect(po.id) : undefined}
      getRowAriaLabel={(po) => `Open purchase order ${po.poNumber}`}
    />
  );
}
