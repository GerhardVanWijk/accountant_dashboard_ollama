import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { Bill, BillStatus } from '@/types';

export interface BillListProps {
  bills: Bill[];
  suppliersMap?: Record<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

const STATUS_LABELS: Record<BillStatus, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};
const STATUS_OPTIONS: BillStatus[] = ['draft', 'awaiting_payment', 'partially_paid', 'paid', 'overdue', 'void'];

/**
 * Supplier bill register, re-skinned onto v0's DataTable (M8). Real bug
 * fixed while porting: the pre-v0 table rendered `bill.supplierId` raw —
 * `suppliersMap` was already built by BillsPage but never passed down to
 * this component, so every row showed a raw id instead of the supplier's
 * name.
 */
export function BillList({ bills, suppliersMap = {}, onSelect, isLoading = false, error }: BillListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading bills…
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

  const columns: DataTableColumn<Bill>[] = [
    {
      key: 'number',
      header: 'Bill',
      sortValue: (b) => b.billNumber,
      cell: (b) => (
        <RecordLink onClick={() => onSelect?.(b.id)} className="figure text-sm">
          {b.billNumber}
        </RecordLink>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      sortValue: (b) => suppliersMap[b.supplierId] ?? '',
      cell: (b) => suppliersMap[b.supplierId] ?? 'Unknown supplier',
    },
    { key: 'date', header: 'Date', sortValue: (b) => b.issueDate, cell: (b) => formatDate(b.issueDate) },
    { key: 'due', header: 'Due', hideBelowMd: true, sortValue: (b) => b.dueDate, cell: (b) => formatDate(b.dueDate) },
    { key: 'total', header: 'Total', align: 'right', sortValue: (b) => b.total, cell: (b) => <Amount value={b.total} className="text-sm font-medium" /> },
    { key: 'paid', header: 'Paid', align: 'right', hideBelowMd: true, sortValue: (b) => b.amountPaid, cell: (b) => <Amount value={b.amountPaid} className="text-sm text-positive" /> },
    { key: 'outstanding', header: 'Outstanding', align: 'right', sortValue: (b) => b.total - b.amountPaid, cell: (b) => <Amount value={b.total - b.amountPaid} className="text-sm" /> },
    { key: 'status', header: 'Status', sortValue: (b) => b.status, cell: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <DataTable
      rows={bills}
      columns={columns}
      getRowKey={(b) => b.id}
      searchable={(b) => [b.billNumber, suppliersMap[b.supplierId] ?? '', b.notes ?? ''].join(' ')}
      searchPlaceholder="Search bill number, supplier or notes"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          match: (b, value) => b.status === value,
        },
      ]}
      emptyTitle="No bills found"
      emptyDescription="Adjust the filters, or create a new bill."
      caption="Supplier bill register"
      onRowClick={onSelect ? (b) => onSelect(b.id) : undefined}
      getRowAriaLabel={(b) => `Open bill ${b.billNumber}`}
    />
  );
}
