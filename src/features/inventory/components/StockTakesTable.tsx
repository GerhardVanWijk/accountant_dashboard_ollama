import type { StockTake, Warehouse } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';

const SCOPE_LABEL = { all: 'All products', category: 'Category', items: 'Hand-picked' } as const;

export interface StockTakesTableProps {
  stockTakes: StockTake[];
  warehouses: Warehouse[];
  onSelect: (stockTake: StockTake) => void;
  onDelete?: (stockTake: StockTake) => void;
}

/** Stock take register — mirrors `StockAdjustmentsTable`'s shape. */
export function StockTakesTable({ stockTakes, warehouses, onSelect, onDelete }: StockTakesTableProps) {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  const columns: DataTableColumn<StockTake>[] = [
    {
      key: 'number',
      header: 'Stock take',
      sortValue: (s) => s.stockTakeNumber,
      cell: (s) => (
        <div className="flex flex-col">
          <RecordLink onClick={() => onSelect(s)} className="figure text-sm">
            {s.stockTakeNumber}
          </RecordLink>
          <span className="text-xs text-muted-foreground">{SCOPE_LABEL[s.scope]}</span>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      hideBelowMd: true,
      sortValue: (s) => warehouseName(s.warehouseId),
      cell: (s) => <span className="text-xs">{warehouseName(s.warehouseId)}</span>,
    },
    {
      key: 'date',
      header: 'Count date',
      hideBelowMd: true,
      sortValue: (s) => s.countDate,
      cell: (s) => <span className="text-xs text-muted-foreground">{formatDate(s.countDate)}</span>,
    },
    {
      key: 'variance',
      header: 'Net variance',
      align: 'right',
      sortValue: (s) => s.totalVarianceValue,
      cell: (s) => <Amount value={s.totalVarianceValue} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (s) => s.status,
      cell: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          {onDelete && s.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(s)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={stockTakes}
      columns={columns}
      getRowKey={(s) => s.id}
      searchable={(s) => [s.stockTakeNumber, warehouseName(s.warehouseId), SCOPE_LABEL[s.scope]].join(' ')}
      searchPlaceholder="Search by number or warehouse"
      initialSortKey="date"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'counting', label: 'Counting' },
            { value: 'ready_for_review', label: 'Ready for review' },
            { value: 'posted', label: 'Posted' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
          match: (s, value) => s.status === value,
        },
      ]}
      emptyTitle="No stock takes yet"
      emptyDescription="Start a physical count to start the register."
      onRowClick={onSelect}
      getRowAriaLabel={(s) => `Open stock take ${s.stockTakeNumber}`}
    />
  );
}
