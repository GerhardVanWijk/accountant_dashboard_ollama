import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { CreditNote } from '@/types';

const REASON_LABELS: Record<string, string> = {
  return: 'Returned goods',
  pricing_error: 'Pricing error',
  discount: 'Discount',
  other: 'Other',
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'void', label: 'Void' },
];

export interface CreditNoteListProps {
  creditNotes: CreditNote[];
  customers: Map<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * Credit note register, re-skinned onto v0's DataTable. Real statuses
 * (draft/issued/allocated/void) — not v0's mock set (draft/issued/applied/
 * cancelled), see the M4 report.
 */
export function CreditNoteList({ creditNotes, customers, onSelect, isLoading = false, error }: CreditNoteListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading credit notes…
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

  const columns: DataTableColumn<CreditNote>[] = [
    {
      key: 'number',
      header: 'Credit note',
      sortValue: (cn) => cn.creditNoteNumber,
      cell: (cn) => (
        <button
          type="button"
          onClick={() => onSelect?.(cn.id)}
          className="figure text-sm font-medium underline-offset-4 hover:text-brand hover:underline"
        >
          {cn.creditNoteNumber}
        </button>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (cn) => customers.get(cn.customerId) ?? '',
      cell: (cn) => customers.get(cn.customerId) ?? 'Unknown customer',
    },
    {
      key: 'reason',
      header: 'Reason',
      sortValue: (cn) => cn.reason,
      hideBelowMd: true,
      cell: (cn) => <span className="text-muted-foreground">{REASON_LABELS[cn.reason] ?? cn.reason}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (cn) => cn.issueDate,
      cell: (cn) => formatDate(cn.issueDate),
    },
    {
      key: 'tax',
      header: 'Tax',
      align: 'right',
      sortValue: (cn) => cn.taxTotal,
      hideBelowMd: true,
      cell: (cn) => <Amount value={cn.taxTotal} className="text-sm text-muted-foreground" />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (cn) => cn.total,
      cell: (cn) => <Amount value={cn.total} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (cn) => cn.status,
      cell: (cn) => <StatusBadge status={cn.status} />,
    },
  ];

  return (
    <DataTable
      rows={creditNotes}
      columns={columns}
      getRowKey={(cn) => cn.id}
      searchable={(cn) => [cn.creditNoteNumber, customers.get(cn.customerId) ?? '', cn.reason].join(' ')}
      searchPlaceholder="Search credit note, customer or reason"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: STATUS_OPTIONS,
          match: (cn, value) => cn.status === value,
        },
      ]}
      emptyTitle="No credit notes found"
      emptyDescription="Adjust the filters, or raise a new credit note against an invoice."
      caption="Credit note register"
    />
  );
}
