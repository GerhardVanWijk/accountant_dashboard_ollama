import type { Product, StockAdjustment, StockAdjustmentReason, Warehouse } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';

const REASON_LABEL: Record<StockAdjustmentReason, string> = {
  write_off: 'Write-off',
  shrinkage: 'Shrinkage',
  damage: 'Damage',
  stock_gain: 'Stock gain',
  correction: 'Correction',
  other: 'Other adjustment',
};

export interface StockAdjustmentsTableProps {
  adjustments: StockAdjustment[];
  products: Product[];
  warehouses: Warehouse[];
  onSelect: (adjustment: StockAdjustment) => void;
  /** Omitted (rather than passed a no-op) when the caller lacks delete permission — hides the action entirely. */
  onDelete?: (adjustment: StockAdjustment) => void;
  /** Reports the current search/filter/sort result (Phase 7 export/print infrastructure) — see `DataTable`'s own doc comment. */
  onVisibleRowsChange?: (rows: StockAdjustment[], activeFilters: { label: string; value: string }[]) => void;
}

/** Stock adjustment register — mirrors `AssetsTable`'s shape (draft-then-post lifecycle over `DataTable`). */
export function StockAdjustmentsTable({ adjustments, products, warehouses, onSelect, onDelete, onVisibleRowsChange }: StockAdjustmentsTableProps) {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const productNames = (adjustment: StockAdjustment) =>
    adjustment.lineItems.map((l) => products.find((p) => p.id === l.productId)?.name ?? l.productId).join(', ');

  const columns: DataTableColumn<StockAdjustment>[] = [
    {
      key: 'number',
      header: 'Adjustment',
      sortValue: (a) => a.adjustmentNumber,
      cell: (a) => (
        <div className="flex flex-col">
          <RecordLink onClick={() => onSelect(a)} className="figure text-sm">
            {a.adjustmentNumber}
          </RecordLink>
          <span className="truncate text-xs text-muted-foreground">{productNames(a) || '—'}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      sortValue: (a) => a.reason,
      cell: (a) => <span className="text-xs">{REASON_LABEL[a.reason]}</span>,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      hideBelowMd: true,
      sortValue: (a) => warehouseName(a.warehouseId),
      cell: (a) => <span className="text-xs">{warehouseName(a.warehouseId)}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      hideBelowMd: true,
      sortValue: (a) => a.adjustmentDate,
      cell: (a) => <span className="text-xs text-muted-foreground">{formatDate(a.adjustmentDate)}</span>,
    },
    {
      key: 'effect',
      header: 'Net cost effect',
      align: 'right',
      sortValue: (a) => a.totalCostEffect,
      cell: (a) => <Amount value={a.totalCostEffect} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (a) => a.status,
      cell: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          {onDelete && a.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(a)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={adjustments}
      columns={columns}
      getRowKey={(a) => a.id}
      searchable={(a) => [a.adjustmentNumber, REASON_LABEL[a.reason], productNames(a)].join(' ')}
      searchPlaceholder="Search by number, reason or product"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'reason',
          label: 'All reasons',
          options: Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
          match: (a, value) => a.reason === value,
        },
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'pending_approval', label: 'Pending approval' },
            { value: 'posted', label: 'Posted' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
          match: (a, value) => a.status === value,
        },
      ]}
      emptyTitle="No stock adjustments yet"
      emptyDescription="Record a write-off, shrinkage, damage or stock gain to start the register."
      onRowClick={onSelect}
      getRowAriaLabel={(a) => `Open stock adjustment ${a.adjustmentNumber}`}
      onVisibleRowsChange={onVisibleRowsChange}
    />
  );
}
