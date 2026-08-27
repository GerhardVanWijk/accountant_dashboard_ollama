import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatDate } from '@/lib/app/format';
import type { Payment } from '@/types';

export interface PaymentListProps {
  payments: Payment[];
  suppliersMap?: Record<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

const METHOD_LABELS: Record<string, string> = {
  eft: 'EFT',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

/** Supplier payment register, re-skinned onto v0's DataTable (M8) — mirrors CustomerReceiptList's shape for the AP side. */
export function PaymentList({ payments, suppliersMap = {}, onSelect, isLoading = false, error }: PaymentListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading payments…
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

  const columns: DataTableColumn<Payment>[] = [
    {
      key: 'number',
      header: 'Payment',
      sortValue: (p) => p.paymentNumber,
      cell: (p) => (
        <RecordLink onClick={() => onSelect?.(p.id)} className="figure text-sm">
          {p.paymentNumber}
        </RecordLink>
      ),
    },
    { key: 'supplier', header: 'Supplier', sortValue: (p) => suppliersMap[p.supplierId] ?? '', cell: (p) => suppliersMap[p.supplierId] ?? 'Unknown supplier' },
    { key: 'method', header: 'Method', hideBelowMd: true, sortValue: (p) => p.method, cell: (p) => <span className="text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</span> },
    { key: 'reference', header: 'Reference', hideBelowMd: true, sortValue: (p) => p.reference ?? '', cell: (p) => p.reference ?? '—' },
    { key: 'date', header: 'Date', sortValue: (p) => p.date, cell: (p) => formatDate(p.date) },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, cell: (p) => <Amount value={p.amount} className="text-sm font-medium" /> },
    {
      key: 'unallocated',
      header: 'Unallocated',
      align: 'right',
      sortValue: (p) => p.unallocatedAmount,
      cell: (p) => <Amount value={p.unallocatedAmount} className={p.unallocatedAmount > 0 ? 'text-sm text-warning' : 'text-sm'} />,
    },
  ];

  return (
    <DataTable
      rows={payments}
      columns={columns}
      getRowKey={(p) => p.id}
      searchable={(p) => [p.paymentNumber, suppliersMap[p.supplierId] ?? '', p.reference ?? ''].join(' ')}
      searchPlaceholder="Search payment, supplier or reference"
      initialSortKey="date"
      initialSortDirection="desc"
      emptyTitle="No payments recorded yet"
      emptyDescription="Record a payment to a supplier to see it here."
      caption="Supplier payment register"
      onRowClick={onSelect ? (p) => onSelect(p.id) : undefined}
      getRowAriaLabel={(p) => `Open payment ${p.paymentNumber}`}
    />
  );
}
