import type { Product, StockTransfer, Warehouse } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';

export interface StockTransfersTableProps {
  transfers: StockTransfer[];
  products: Product[];
  warehouses: Warehouse[];
  onSelect: (transfer: StockTransfer) => void;
  onDelete?: (transfer: StockTransfer) => void;
  /** Reports the current search/filter/sort result (Phase 7 export/print infrastructure) — see `DataTable`'s own doc comment. */
  onVisibleRowsChange?: (rows: StockTransfer[], activeFilters: { label: string; value: string }[]) => void;
}

/** Stock transfer register — mirrors `StockAdjustmentsTable`'s shape. */
export function StockTransfersTable({ transfers, products, warehouses, onSelect, onDelete, onVisibleRowsChange }: StockTransfersTableProps) {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const productNames = (transfer: StockTransfer) =>
    transfer.lineItems.map((l) => products.find((p) => p.id === l.productId)?.name ?? l.productId).join(', ');

  const columns: DataTableColumn<StockTransfer>[] = [
    {
      key: 'number',
      header: 'Transfer',
      sortValue: (t) => t.transferNumber,
      cell: (t) => (
        <div className="flex flex-col">
          <RecordLink onClick={() => onSelect(t)} className="figure text-sm">
            {t.transferNumber}
          </RecordLink>
          <span className="truncate text-xs text-muted-foreground">{productNames(t) || '—'}</span>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      sortValue: (t) => `${warehouseName(t.fromWarehouseId)} → ${warehouseName(t.toWarehouseId)}`,
      cell: (t) => (
        <span className="text-xs">
          {warehouseName(t.fromWarehouseId)} → {warehouseName(t.toWarehouseId)}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      hideBelowMd: true,
      sortValue: (t) => t.transferDate,
      cell: (t) => <span className="text-xs text-muted-foreground">{formatDate(t.transferDate)}</span>,
    },
    {
      key: 'cost',
      header: 'Total cost',
      align: 'right',
      sortValue: (t) => t.totalCost,
      cell: (t) => <Amount value={t.totalCost} plain className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (t) => t.status,
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          {onDelete && t.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(t)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={transfers}
      columns={columns}
      getRowKey={(t) => t.id}
      searchable={(t) => [t.transferNumber, warehouseName(t.fromWarehouseId), warehouseName(t.toWarehouseId), productNames(t)].join(' ')}
      searchPlaceholder="Search by number, warehouse or product"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'in_transit', label: 'In transit' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
          match: (t, value) => t.status === value,
        },
      ]}
      emptyTitle="No stock transfers yet"
      emptyDescription="Move stock between warehouses to start the register."
      onRowClick={onSelect}
      getRowAriaLabel={(t) => `Open stock transfer ${t.transferNumber}`}
      onVisibleRowsChange={onVisibleRowsChange}
    />
  );
}
