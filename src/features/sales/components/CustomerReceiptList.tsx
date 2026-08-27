import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { CustomerReceipt } from '@/types';
import { receiptAllocationState } from '../utils/receiptAllocationState';

const METHOD_LABELS: Record<string, string> = {
  eft: 'EFT',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

export interface CustomerReceiptListProps {
  receipts: CustomerReceipt[];
  customers: Map<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * Customer receipt register, re-skinned onto v0's DataTable. There is no
 * v0-equivalent "status" column here — the real CustomerReceipt has no
 * status field, so the badge shows the derived allocation state
 * (receiptAllocationState()) instead of a stored lifecycle status. See the
 * M4 report.
 */
export function CustomerReceiptList({ receipts, customers, onSelect, isLoading = false, error }: CustomerReceiptListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading customer receipts…
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

  const columns: DataTableColumn<CustomerReceipt>[] = [
    {
      key: 'number',
      header: 'Receipt',
      sortValue: (r) => r.receiptNumber,
      cell: (r) => (
        <RecordLink onClick={() => onSelect?.(r.id)} className="figure text-sm">
          {r.receiptNumber}
        </RecordLink>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (r) => customers.get(r.customerId) ?? '',
      cell: (r) => customers.get(r.customerId) ?? 'Unknown customer',
    },
    {
      key: 'method',
      header: 'Method',
      sortValue: (r) => r.method,
      hideBelowMd: true,
      cell: (r) => <span className="text-muted-foreground">{METHOD_LABELS[r.method] ?? r.method}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.date,
      cell: (r) => formatDate(r.date),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (r) => r.amount,
      cell: (r) => <Amount value={r.amount} className="text-sm font-medium text-positive" />,
    },
    {
      key: 'allocation',
      header: 'Allocation',
      sortValue: (r) => receiptAllocationState(r),
      cell: (r) => <StatusBadge status={receiptAllocationState(r)} />,
    },
  ];

  return (
    <DataTable
      rows={receipts}
      columns={columns}
      getRowKey={(r) => r.id}
      searchable={(r) => [r.receiptNumber, customers.get(r.customerId) ?? '', r.reference ?? ''].join(' ')}
      searchPlaceholder="Search receipt, customer or reference"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'allocation',
          label: 'All allocation states',
          options: [
            { value: 'unallocated', label: 'Unallocated' },
            { value: 'partially-allocated', label: 'Partially allocated' },
            { value: 'allocated', label: 'Allocated' },
          ],
          match: (r, value) => receiptAllocationState(r) === value,
        },
      ]}
      emptyTitle="No customer receipts found"
      emptyDescription="Adjust the filters, or record a new receipt."
      caption="Customer receipt register"
      onRowClick={onSelect ? (r) => onSelect(r.id) : undefined}
      getRowAriaLabel={(r) => `Open receipt ${r.receiptNumber}`}
    />
  );
}
