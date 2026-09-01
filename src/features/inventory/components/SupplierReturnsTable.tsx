import type { Supplier, SupplierReturn } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';

export interface SupplierReturnsTableProps {
  supplierReturns: SupplierReturn[];
  suppliers: Supplier[];
  onSelect: (supplierReturn: SupplierReturn) => void;
  onDelete?: (supplierReturn: SupplierReturn) => void;
  /** Reports the current search/filter/sort result (Phase 7 export/print infrastructure) — see `DataTable`'s own doc comment. */
  onVisibleRowsChange?: (rows: SupplierReturn[], activeFilters: { label: string; value: string }[]) => void;
}

/** Supplier return register — mirrors `StockAdjustmentsTable`'s shape. */
export function SupplierReturnsTable({ supplierReturns, suppliers, onSelect, onDelete, onVisibleRowsChange }: SupplierReturnsTableProps) {
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const columns: DataTableColumn<SupplierReturn>[] = [
    {
      key: 'number',
      header: 'Return',
      sortValue: (r) => r.returnNumber,
      cell: (r) => (
        <div className="flex flex-col">
          <RecordLink onClick={() => onSelect(r)} className="figure text-sm">
            {r.returnNumber}
          </RecordLink>
          <span className="text-xs text-muted-foreground">{supplierName(r.supplierId)}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideBelowMd: true,
      sortValue: (r) => r.reason ?? '',
      cell: (r) => <span className="text-xs">{r.reason ?? '—'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      hideBelowMd: true,
      sortValue: (r) => r.returnDate,
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDate(r.returnDate)}</span>,
    },
    {
      key: 'total',
      header: 'Total credit',
      align: 'right',
      sortValue: (r) => r.total,
      cell: (r) => <Amount value={r.total} plain className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {onDelete && r.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(r)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={supplierReturns}
      columns={columns}
      getRowKey={(r) => r.id}
      searchable={(r) => [r.returnNumber, supplierName(r.supplierId), r.reason ?? ''].join(' ')}
      searchPlaceholder="Search by number, supplier or reason"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'posted', label: 'Posted' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
          match: (r, value) => r.status === value,
        },
      ]}
      emptyTitle="No supplier returns yet"
      emptyDescription="Return goods to a supplier to start the register."
      onRowClick={onSelect}
      getRowAriaLabel={(r) => `Open supplier return ${r.returnNumber}`}
      onVisibleRowsChange={onVisibleRowsChange}
    />
  );
}
