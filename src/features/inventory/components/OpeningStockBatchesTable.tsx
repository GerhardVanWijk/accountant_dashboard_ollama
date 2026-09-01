import type { OpeningStockBatch, Warehouse } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';

export interface OpeningStockBatchesTableProps {
  batches: OpeningStockBatch[];
  warehouses: Warehouse[];
  onSelect: (batch: OpeningStockBatch) => void;
  onDelete?: (batch: OpeningStockBatch) => void;
  /** Reports the current search/filter/sort result (Phase 7 export/print infrastructure) — see `DataTable`'s own doc comment. */
  onVisibleRowsChange?: (rows: OpeningStockBatch[], activeFilters: { label: string; value: string }[]) => void;
}

/** Opening stock batch register — mirrors `StockAdjustmentsTable`'s shape. */
export function OpeningStockBatchesTable({ batches, warehouses, onSelect, onDelete, onVisibleRowsChange }: OpeningStockBatchesTableProps) {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  const columns: DataTableColumn<OpeningStockBatch>[] = [
    {
      key: 'number',
      header: 'Batch',
      sortValue: (b) => b.batchNumber,
      cell: (b) => (
        <RecordLink onClick={() => onSelect(b)} className="figure text-sm">
          {b.batchNumber}
        </RecordLink>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      hideBelowMd: true,
      sortValue: (b) => warehouseName(b.warehouseId),
      cell: (b) => <span className="text-xs">{warehouseName(b.warehouseId)}</span>,
    },
    {
      key: 'date',
      header: 'Effective date',
      hideBelowMd: true,
      sortValue: (b) => b.effectiveDate,
      cell: (b) => <span className="text-xs text-muted-foreground">{formatDate(b.effectiveDate)}</span>,
    },
    {
      key: 'total',
      header: 'Total cost',
      align: 'right',
      sortValue: (b) => b.totalCost,
      cell: (b) => <Amount value={b.totalCost} plain className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (b) => b.status,
      cell: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (b) => (
        <div className="flex justify-end gap-1">
          {onDelete && b.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(b)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={batches}
      columns={columns}
      getRowKey={(b) => b.id}
      searchable={(b) => [b.batchNumber, warehouseName(b.warehouseId)].join(' ')}
      searchPlaceholder="Search by number or warehouse"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
          match: (b, value) => b.status === value,
        },
      ]}
      emptyTitle="No opening stock batches yet"
      emptyDescription="Capture opening inventory to start the register."
      onRowClick={onSelect}
      getRowAriaLabel={(b) => `Open opening stock batch ${b.batchNumber}`}
      onVisibleRowsChange={onVisibleRowsChange}
    />
  );
}
