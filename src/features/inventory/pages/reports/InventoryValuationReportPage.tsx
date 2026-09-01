import { useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { InventoryReconciliationCard } from '../../components/InventoryReconciliationCard';
import { useInventoryReconciliation } from '../../hooks/useInventoryReconciliation';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useWarehouses } from '../../hooks/useWarehouses';
import type { StockOnHandRow } from '../../reports/buildStockOnHandRows';

const VALUATION_EXPORT_COLUMNS: ExportColumn<StockOnHandRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'quantity', header: 'Quantity', accessor: (r) => r.onHand, align: 'right' },
  { key: 'wac', header: 'WAC', accessor: (r) => r.wac, align: 'right' },
  {
    key: 'value',
    header: 'Inventory Value',
    accessor: (r) => r.inventoryValue,
    align: 'right',
    total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)),
  },
];

/**
 * Inventory Valuation — route `/inventory/reports/valuation` (spec §4). The
 * accounting-critical report: line-level `quantity × WAC` (the exact same
 * identity `reconcileInventory()` sums), THEN the real GL 1200/1210 control-
 * account reconciliation reusing `InventoryReconciliationCard` verbatim — no
 * reconciliation math is reproduced on this page (spec: "Do not reproduce
 * reconciliation math in the page").
 */
export function InventoryValuationReportPage() {
  const { rows, loading, error, refetch } = useStockOnHandData();
  const { warehouses } = useWarehouses();
  const reconciliation = useInventoryReconciliation();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<StockOnHandRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const exportDataset: ExportDataset<StockOnHandRow> = {
    title: 'Inventory Valuation',
    subtitle: `${visibleRows.length} of ${rows.length} lines`,
    filters: activeFilters,
    columns: VALUATION_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-valuation-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalValue = sumMoney(visibleRows.map((r) => r.inventoryValue));

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
    { key: 'quantity', header: 'Quantity', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.onHand}</span>, sortValue: (r) => r.onHand },
    { key: 'wac', header: 'WAC', align: 'right', cell: (r) => <Amount value={r.wac} />, sortValue: (r) => r.wac },
    { key: 'value', header: 'Inventory value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
  ];

  const filters: DataTableFilter<StockOnHandRow>[] =
    warehouses.length > 1
      ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r, v) => r.warehouse.id === v }]
      : [];

  return (
    <InventoryReportShell
      title="Inventory valuation"
      description="On-hand inventory value at weighted-average cost, reconciled to the Inventory Asset and Inventory in Transit control accounts."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Inventory subledger value" value={formatCurrency(totalValue)} />
          <FigureBlock label="Filtered lines" value={String(visibleRows.length)} />
          <FigureBlock label="Total lines" value={String(rows.length)} />
          <FigureBlock
            label="Control status"
            value={reconciliation.result ? (reconciliation.result.isReconciled ? 'Reconciled' : 'Investigate') : '—'}
            tone={reconciliation.result ? (reconciliation.result.isReconciled ? 'positive' : 'negative') : 'default'}
          />
        </ReportSummaryCard>
      }
      footnote="Line-level totals above use the same round-after-sum valuation identity as the general-ledger reconciliation below, but are not independently re-summed against it here."
    >
      <SectionCard title="Valuation by line" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => `${r.product.id}::${r.warehouse.id}`}
          searchable={(r) => `${r.product.name} ${r.product.sku} ${r.warehouse.name}`}
          searchPlaceholder="Search SKU, product, warehouse"
          filters={filters}
          initialSortKey="value"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="Nothing to value"
          emptyDescription="Tracked products with a stock balance appear here."
          onVisibleRowsChange={(r, f) => {
            setVisibleRows(r);
            setActiveFilters(f);
          }}
        />
      </SectionCard>

      <InventoryReconciliationCard
        result={reconciliation.result}
        loading={reconciliation.loading}
        error={reconciliation.error}
        onRefresh={reconciliation.refetch}
      />
    </InventoryReportShell>
  );
}
