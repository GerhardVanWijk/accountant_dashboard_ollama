import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useStockMovements } from '../../hooks/useStockMovements';
import { buildSlowMovingRows, SLOW_MOVING_BUCKET_LABEL, type SlowMovingBucket, type SlowMovingRow } from '../../reports/buildSlowMovingRows';

const SLOW_MOVING_EXPORT_COLUMNS: ExportColumn<SlowMovingRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'lastMovement', header: 'Last Movement Date', accessor: (r) => (r.lastMovementAt ? new Date(r.lastMovementAt) : null) },
  { key: 'lastSale', header: 'Last Sale Date', accessor: (r) => (r.lastSaleAt ? new Date(r.lastSaleAt) : null) },
  { key: 'daysSince', header: 'Days Since Last Movement', accessor: (r) => r.daysSinceLastMovement ?? null, align: 'right' },
  { key: 'bucket', header: 'Bucket', accessor: (r) => SLOW_MOVING_BUCKET_LABEL[r.bucket] },
  { key: 'onHand', header: 'Quantity on Hand', accessor: (r) => r.onHand, align: 'right' },
  { key: 'value', header: 'Inventory Value', accessor: (r) => r.inventoryValue, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)) },
];

/**
 * Slow-Moving / Dead Stock — route `/inventory/reports/slow-moving` (spec
 * §16). Every row already holds quantity (`onHand > 0`), bucketed by days
 * since the last ECONOMIC movement (`buildSlowMovingRows` — explicitly
 * excludes transfers; see its own doc comment for the reasoning spec §16
 * asked for). `lastSaleAt` is shown as its own column so "recently active
 * but never actually sold" reads honestly, not as "recently sold".
 */
export function SlowMovingReportPage() {
  const { rows: stockOnHandRows, loading: stockLoading, error: stockError, refetch: refetchStock } = useStockOnHandData();
  const { movements, loading: movementsLoading, error: movementsError, refetch: refetchMovements } = useStockMovements();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<SlowMovingRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = stockLoading || movementsLoading;
  const error = stockError ?? movementsError;
  const asOfDate = useMemo(() => new Date(), []);
  const rows = useMemo(() => buildSlowMovingRows(stockOnHandRows, movements, asOfDate), [stockOnHandRows, movements, asOfDate]);

  const exportDataset: ExportDataset<SlowMovingRow> = {
    title: 'Slow-Moving / Dead Stock',
    subtitle: `As at ${formatDate(asOfDate.toISOString())} — ${visibleRows.length} of ${rows.length} items`,
    filters: activeFilters,
    columns: SLOW_MOVING_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-slow-moving-${asOfDate.toISOString().slice(0, 10)}`,
  };

  const deadStockValue = sumMoney(visibleRows.filter((r) => r.bucket === '180+').map((r) => r.inventoryValue));
  const totalValue = sumMoney(visibleRows.map((r) => r.inventoryValue));
  const neverMovedCount = visibleRows.filter((r) => r.lastMovementAt === undefined).length;

  const columns: DataTableColumn<SlowMovingRow>[] = [
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
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouse.name, sortValue: (r) => r.warehouse.name, hideBelowMd: true },
    {
      key: 'lastMovement',
      header: 'Last movement',
      cell: (r) => (r.lastMovementAt ? <span className="figure text-xs">{formatDate(r.lastMovementAt)}</span> : <span className="text-xs text-muted-foreground">Never</span>),
      sortValue: (r) => r.lastMovementAt ?? '',
    },
    {
      key: 'lastSale',
      header: 'Last sale',
      cell: (r) => (r.lastSaleAt ? <span className="figure text-xs">{formatDate(r.lastSaleAt)}</span> : <span className="text-xs text-muted-foreground">Never sold</span>),
      sortValue: (r) => r.lastSaleAt ?? '',
      hideBelowMd: true,
    },
    { key: 'bucket', header: 'Bucket', cell: (r) => SLOW_MOVING_BUCKET_LABEL[r.bucket], sortValue: (r) => r.daysSinceLastMovement ?? 99999 },
    { key: 'onHand', header: 'On hand', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.onHand}</span>, sortValue: (r) => r.onHand },
    { key: 'value', header: 'Value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
  ];

  const filters: DataTableFilter<SlowMovingRow>[] = [
    {
      key: 'bucket',
      label: 'All buckets',
      options: (Object.keys(SLOW_MOVING_BUCKET_LABEL) as SlowMovingBucket[]).map((b) => ({ value: b, label: SLOW_MOVING_BUCKET_LABEL[b] })),
      match: (r, v) => r.bucket === v,
    },
  ];

  return (
    <InventoryReportShell
      title="Slow-moving / dead stock"
      description="Products still holding quantity, bucketed by days since their last economic movement."
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
          <FigureBlock label="Items with stock" value={String(visibleRows.length)} />
          <FigureBlock label="Never moved" value={String(neverMovedCount)} tone={neverMovedCount > 0 ? 'negative' : 'default'} />
          <FigureBlock label="180+ day value" value={formatCurrency(deadStockValue)} tone={deadStockValue > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Total value shown" value={formatCurrency(totalValue)} />
        </ReportSummaryCard>
      }
      footnote="'Movement' here excludes internal transfers (relocation, not consumption/replenishment) — see docs/INVENTORY_REPORTS.md §16. 'Last sale' is shown separately so recent purchase activity is never mistaken for recent sales."
    >
      <SectionCard title="Slow-moving stock" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => `${r.product.id}::${r.warehouse.id}`}
          searchable={(r) => `${r.product.name} ${r.product.sku} ${r.warehouse.name}`}
          searchPlaceholder="Search SKU, product, warehouse"
          filters={filters}
          initialSortKey="bucket"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="No stock to analyse"
          emptyDescription="Products currently holding quantity appear here."
          onVisibleRowsChange={(r, f) => {
            setVisibleRows(r);
            setActiveFilters(f);
          }}
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
