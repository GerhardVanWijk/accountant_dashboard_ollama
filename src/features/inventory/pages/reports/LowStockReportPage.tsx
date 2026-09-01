import { useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildLowStockRows, type LowStockRow } from '../../reports/buildLowStockRows';

const LOW_STOCK_EXPORT_COLUMNS: ExportColumn<LowStockRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'onHand', header: 'On Hand', accessor: (r) => r.onHand, align: 'right' },
  { key: 'available', header: 'Available', accessor: (r) => r.available, align: 'right' },
  { key: 'reorderLevel', header: 'Reorder Level', accessor: (r) => r.reorderLevel ?? null, align: 'right' },
  { key: 'reorderQuantity', header: 'Reorder Quantity', accessor: (r) => r.reorderQuantity ?? null, align: 'right' },
  { key: 'supplier', header: 'Preferred Supplier', accessor: (r) => r.supplierName },
  { key: 'suggestedOrderQty', header: 'Suggested Order Qty', accessor: (r) => r.suggestedOrderQty ?? null, align: 'right' },
];

/**
 * Low Stock — route `/inventory/reports/low-stock` (spec §5). Every row is
 * already at `status === 'low'` from `buildStockOnHandRows`; the only
 * derived figure is `suggestedOrderQty`, using the one documented formula
 * (`max(reorderQuantity, preferredStockLevel − available)` —
 * `buildStockOnHandRows.suggestedOrderQuantity`).
 */
export function LowStockReportPage() {
  const { rows: stockOnHandRows, loading, error, refetch } = useStockOnHandData();
  const { warehouses } = useWarehouses();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<LowStockRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const rows = buildLowStockRows(stockOnHandRows);

  const exportDataset: ExportDataset<LowStockRow> = {
    title: 'Low Stock',
    subtitle: `${visibleRows.length} of ${rows.length} items`,
    filters: activeFilters,
    columns: LOW_STOCK_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-low-stock-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalSuggestedQty = visibleRows.reduce((sum, r) => sum + (r.suggestedOrderQty ?? 0), 0);

  const columns: DataTableColumn<LowStockRow>[] = [
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
    { key: 'onHand', header: 'On hand', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.onHand}</span>, sortValue: (r) => r.onHand },
    { key: 'reorderLevel', header: 'Reorder level', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.reorderLevel ?? '—'}</span>, sortValue: (r) => r.reorderLevel ?? -1 },
    { key: 'supplier', header: 'Preferred supplier', cell: (r) => r.supplierName, sortValue: (r) => r.supplierName, hideBelowMd: true },
    { key: 'suggested', header: 'Suggested order qty', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.suggestedOrderQty ?? '—'}</span>, sortValue: (r) => r.suggestedOrderQty ?? -1 },
  ];

  const filters: DataTableFilter<LowStockRow>[] =
    warehouses.length > 1
      ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r, v) => r.warehouse.id === v }]
      : [];

  return (
    <InventoryReportShell
      title="Low stock"
      description="Products at or below their reorder level, with a suggested order quantity."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Low-stock items" value={String(rows.length)} tone={rows.length > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Filtered items" value={String(visibleRows.length)} />
          <FigureBlock label="Suggested reorder units" value={totalSuggestedQty.toLocaleString('en-ZA')} />
        </ReportSummaryCard>
      }
    >
      <SectionCard title="Low stock" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => `${r.product.id}::${r.warehouse.id}`}
          searchable={(r) => `${r.product.name} ${r.product.sku} ${r.warehouse.name} ${r.supplierName}`}
          searchPlaceholder="Search SKU, product, supplier"
          filters={filters}
          initialSortKey="onHand"
          pageSize={20}
          emptyTitle="No low-stock items"
          emptyDescription="Nothing is currently at or below its reorder level."
          onVisibleRowsChange={(r, f) => {
            setVisibleRows(r);
            setActiveFilters(f);
          }}
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
