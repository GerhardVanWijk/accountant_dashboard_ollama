import { useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatDateTime } from '@/lib/app/format';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useStockMovements } from '../../hooks/useStockMovements';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildOutOfStockRows, type OutOfStockRow } from '../../reports/buildOutOfStockRows';

const OUT_OF_STOCK_EXPORT_COLUMNS: ExportColumn<OutOfStockRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'supplier', header: 'Preferred Supplier', accessor: (r) => r.supplierName },
  { key: 'reorderLevel', header: 'Reorder Level', accessor: (r) => r.reorderLevel ?? null, align: 'right' },
  { key: 'reorderQuantity', header: 'Reorder Quantity', accessor: (r) => r.reorderQuantity ?? null, align: 'right' },
  { key: 'lastMovement', header: 'Last Movement', accessor: (r) => (r.lastMovementAt ? new Date(r.lastMovementAt) : null) },
  { key: 'productStatus', header: 'Product Status', accessor: (r) => r.productStatus },
];

/**
 * Out of Stock — route `/inventory/reports/out-of-stock` (spec §6), separate
 * from Low Stock: `quantity <= 0` specifically, regardless of whether a
 * reorder level is even configured. Surfaces the product's own
 * active/inactive status explicitly so a discontinued SKU doesn't read as
 * an ordinary "reorder now" alert.
 */
export function OutOfStockReportPage() {
  const { rows: stockOnHandRows, loading: stockLoading, error: stockError, refetch: refetchStock } = useStockOnHandData();
  const { movements, loading: movementsLoading, error: movementsError, refetch: refetchMovements } = useStockMovements();
  const { warehouses } = useWarehouses();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<OutOfStockRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = stockLoading || movementsLoading;
  const error = stockError ?? movementsError;
  const rows = buildOutOfStockRows(stockOnHandRows, movements);

  const exportDataset: ExportDataset<OutOfStockRow> = {
    title: 'Out of Stock',
    subtitle: `${visibleRows.length} of ${rows.length} items`,
    filters: activeFilters,
    columns: OUT_OF_STOCK_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-out-of-stock-${new Date().toISOString().slice(0, 10)}`,
  };

  const inactiveCount = visibleRows.filter((r) => r.productStatus === 'inactive').length;

  const columns: DataTableColumn<OutOfStockRow>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.product.name}</span>
          <span className="figure text-xs text-muted-foreground">{r.product.sku}</span>
        </div>
      ),
      sortValue: (r) => r.product.name,
    },
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouse.name, sortValue: (r) => r.warehouse.name },
    { key: 'supplier', header: 'Preferred supplier', cell: (r) => r.supplierName, sortValue: (r) => r.supplierName, hideBelowMd: true },
    {
      key: 'lastMovement',
      header: 'Last movement',
      cell: (r) => (r.lastMovementAt ? <span className="figure text-xs">{formatDateTime(r.lastMovementAt)}</span> : <span className="text-xs text-muted-foreground">Never</span>),
      sortValue: (r) => r.lastMovementAt ?? '',
    },
    {
      key: 'status',
      header: 'Product status',
      cell: (r) => (
        <span className={r.productStatus === 'inactive' ? 'text-muted-foreground' : 'text-foreground'}>
          {r.productStatus === 'inactive' ? 'Inactive' : 'Active'}
        </span>
      ),
      sortValue: (r) => r.productStatus,
    },
  ];

  const filters: DataTableFilter<OutOfStockRow>[] = [
    { key: 'productStatus', label: 'Any status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }], match: (r, v) => r.productStatus === v },
    ...(warehouses.length > 1 ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r: OutOfStockRow, v: string) => r.warehouse.id === v } satisfies DataTableFilter<OutOfStockRow>] : []),
  ];

  return (
    <InventoryReportShell
      title="Out of stock"
      description="Products at zero or negative on-hand quantity, with product status and last movement date."
      loading={loading}
      error={error}
      onRetry={() => {
        void refetchStock();
        void refetchMovements();
      }}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Out-of-stock items" value={String(rows.length)} tone={rows.length > 0 ? 'negative' : 'default'} />
          <FigureBlock label="Filtered items" value={String(visibleRows.length)} />
          <FigureBlock label="Inactive products among these" value={String(inactiveCount)} />
        </ReportSummaryCard>
      }
    >
      <SectionCard title="Out of stock" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => `${r.product.id}::${r.warehouse.id}`}
          searchable={(r) => `${r.product.name} ${r.product.sku} ${r.warehouse.name}`}
          searchPlaceholder="Search SKU, product, warehouse"
          filters={filters}
          initialSortKey="lastMovement"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="Nothing out of stock"
          emptyDescription="Every tracked product currently has on-hand quantity."
          onVisibleRowsChange={(r, f) => {
            setVisibleRows(r);
            setActiveFilters(f);
          }}
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
