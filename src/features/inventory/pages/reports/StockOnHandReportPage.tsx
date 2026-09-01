import { useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useProductCategories } from '../../hooks/useProductCategories';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useWarehouses } from '../../hooks/useWarehouses';
import { STOCK_ON_HAND_STATUS_LABEL, type StockOnHandRow } from '../../reports/buildStockOnHandRows';

const STOCK_ON_HAND_EXPORT_COLUMNS: ExportColumn<StockOnHandRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'onHand', header: 'On Hand', accessor: (r) => r.onHand, align: 'right' },
  { key: 'available', header: 'Available', accessor: (r) => r.available, align: 'right' },
  { key: 'committed', header: 'Committed', accessor: (r) => r.committed, align: 'right' },
  { key: 'reorderLevel', header: 'Reorder Level', accessor: (r) => r.reorderLevel ?? null, align: 'right' },
  { key: 'reorderQuantity', header: 'Reorder Quantity', accessor: (r) => r.reorderQuantity ?? null, align: 'right' },
  { key: 'wac', header: 'WAC', accessor: (r) => r.wac, align: 'right' },
  {
    key: 'value',
    header: 'Inventory Value',
    accessor: (r) => r.inventoryValue,
    align: 'right',
    total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)),
  },
  { key: 'status', header: 'Status', accessor: (r) => STOCK_ON_HAND_STATUS_LABEL[r.status] },
];

/**
 * Stock on Hand — route `/inventory/reports/stock-on-hand` (spec §3). One
 * row per (product, warehouse), sourced straight from `useStockOnHandData()`
 * (classification A — no independent recalculation). Filters and totals
 * operate on the full result via `DataTable`'s own `onVisibleRowsChange`.
 */
export function StockOnHandReportPage() {
  const { rows, loading, error, refetch } = useStockOnHandData();
  const { categories } = useProductCategories();
  const { suppliers } = useSuppliers();
  const { warehouses } = useWarehouses();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<StockOnHandRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const exportDataset: ExportDataset<StockOnHandRow> = {
    title: 'Stock on Hand',
    subtitle: `${visibleRows.length} of ${rows.length} lines`,
    filters: activeFilters,
    columns: STOCK_ON_HAND_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-stock-on-hand-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalUnits = visibleRows.reduce((sum, r) => sum + r.onHand, 0);
  const totalValue = sumMoney(visibleRows.map((r) => r.inventoryValue));
  const lowCount = visibleRows.filter((r) => r.status === 'low').length;
  const outCount = visibleRows.filter((r) => r.status === 'out').length;
  const skuCount = new Set(visibleRows.map((r) => r.product.id)).size;

  const columns: DataTableColumn<StockOnHandRow>[] = [
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
    { key: 'category', header: 'Category', cell: (r) => r.categoryName, sortValue: (r) => r.categoryName, hideBelowMd: true },
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouse.name, sortValue: (r) => r.warehouse.name },
    { key: 'onHand', header: 'On hand', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.onHand}</span>, sortValue: (r) => r.onHand },
    { key: 'available', header: 'Available', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.available}</span>, sortValue: (r) => r.available, hideBelowMd: true },
    { key: 'reorderLevel', header: 'Reorder level', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.reorderLevel ?? '—'}</span>, sortValue: (r) => r.reorderLevel ?? -1, hideBelowMd: true },
    { key: 'wac', header: 'WAC', align: 'right', cell: (r) => <Amount value={r.wac} />, sortValue: (r) => r.wac, hideBelowMd: true },
    { key: 'value', header: 'Inventory value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className={r.status === 'out' ? 'text-negative' : r.status === 'low' ? 'text-warning' : 'text-muted-foreground'}>
          {STOCK_ON_HAND_STATUS_LABEL[r.status]}
        </span>
      ),
      sortValue: (r) => r.status,
    },
  ];

  const filters: DataTableFilter<StockOnHandRow>[] = [
    { key: 'status', label: 'All statuses', options: (Object.keys(STOCK_ON_HAND_STATUS_LABEL) as (keyof typeof STOCK_ON_HAND_STATUS_LABEL)[]).map((s) => ({ value: s, label: STOCK_ON_HAND_STATUS_LABEL[s] })), match: (r, v) => r.status === v },
    ...(warehouses.length > 1 ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r: StockOnHandRow, v: string) => r.warehouse.id === v } satisfies DataTableFilter<StockOnHandRow>] : []),
    ...(categories.length > 0 ? [{ key: 'category', label: 'All categories', options: categories.map((c) => ({ value: c.name, label: c.name })), match: (r: StockOnHandRow, v: string) => r.categoryName === v } satisfies DataTableFilter<StockOnHandRow>] : []),
    ...(suppliers.length > 0 ? [{ key: 'supplier', label: 'All suppliers', options: suppliers.map((s) => ({ value: s.name, label: s.name })), match: (r: StockOnHandRow, v: string) => r.supplierName === v } satisfies DataTableFilter<StockOnHandRow>] : []),
  ];

  return (
    <InventoryReportShell
      title="Stock on hand"
      description="Current on-hand, available and committed quantity by product and warehouse, valued at weighted-average cost."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="SKUs" value={String(skuCount)} />
          <FigureBlock label="Total units" value={totalUnits.toLocaleString('en-ZA')} />
          <FigureBlock label="Inventory value" value={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalValue)} />
          <FigureBlock label="Low / out of stock" value={`${lowCount} / ${outCount}`} tone={outCount > 0 ? 'negative' : lowCount > 0 ? 'warning' : 'default'} />
        </ReportSummaryCard>
      }
    >
      <SectionCard title="Stock on hand" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => `${r.product.id}::${r.warehouse.id}`}
          searchable={(r) => `${r.product.name} ${r.product.sku} ${r.warehouse.name} ${r.categoryName}`}
          searchPlaceholder="Search SKU, product, warehouse"
          filters={filters}
          initialSortKey="product"
          pageSize={20}
          emptyTitle="No tracked stock"
          emptyDescription="Tracked products with a stock balance appear here."
          onVisibleRowsChange={(r, f) => {
            setVisibleRows(r);
            setActiveFilters(f);
          }}
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
