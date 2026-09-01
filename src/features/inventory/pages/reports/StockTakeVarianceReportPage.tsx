import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { DateRangeControl } from '../../components/reports/DateRangeControl';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { useFinancialYears } from '@/features/accounting/hooks/useFinancialYears';
import { useStockTakes } from '../../hooks/useStockTakes';
import { useProducts } from '../../hooks/useProducts';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildStockTakeVarianceRows, summarizeStockTakeVariance, type StockTakeVarianceRow } from '../../reports/buildStockTakeVarianceRows';
import { isWithinDateRange } from '../../reports/dateRange';

const STOCK_TAKE_VARIANCE_EXPORT_COLUMNS: ExportColumn<StockTakeVarianceRow>[] = [
  { key: 'stockTake', header: 'Stock Take', accessor: (r) => r.stockTakeNumber },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouseName },
  { key: 'date', header: 'Date', accessor: (r) => new Date(r.countDate) },
  { key: 'sku', header: 'SKU', accessor: (r) => r.productSku },
  { key: 'product', header: 'Product', accessor: (r) => r.productName },
  { key: 'expected', header: 'Expected', accessor: (r) => r.expectedQty, align: 'right' },
  { key: 'counted', header: 'Counted', accessor: (r) => r.countedQty, align: 'right' },
  { key: 'varianceQty', header: 'Variance Qty', accessor: (r) => r.varianceQty, align: 'right' },
  { key: 'frozenWac', header: 'Frozen WAC', accessor: (r) => r.frozenWac, align: 'right' },
  { key: 'varianceValue', header: 'Variance Value', accessor: (r) => r.varianceValue, align: 'right' },
  { key: 'reason', header: 'Reason', accessor: (r) => r.reason ?? null },
  { key: 'status', header: 'Status', accessor: (r) => r.status },
];

/**
 * Stock Take Variance report — route `/inventory/reports/stock-take-variance`
 * (spec §10). Line-level, across every stock take, date-range-scoped by
 * `countDate`. Every figure is FROZEN evidence from the count sheet itself
 * (`buildStockTakeVarianceRows`) — never today's on-hand or today's WAC.
 */
export function StockTakeVarianceReportPage() {
  const { stockTakes, loading: takesLoading, error, refetch } = useStockTakes();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { financialYears } = useFinancialYears();
  const canExport = useCanAccess('inventory', 'export');
  const dateRange = useDateRangeFilter(financialYears);
  const [visibleRows, setVisibleRows] = useState<StockTakeVarianceRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = takesLoading || productsLoading || warehousesLoading;

  const inRangeTakes = useMemo(
    () => (dateRange.range ? stockTakes.filter((t) => isWithinDateRange(t.countDate, dateRange.range!)) : []),
    [stockTakes, dateRange.range],
  );
  const rows = useMemo(() => buildStockTakeVarianceRows(inRangeTakes, products, warehouses), [inRangeTakes, products, warehouses]);

  const exportDataset: ExportDataset<StockTakeVarianceRow> = {
    title: 'Stock Take Variance Report',
    subtitle: dateRange.range ? `${dateRange.range.start} to ${dateRange.range.end} — ${visibleRows.length} of ${rows.length} lines` : `${visibleRows.length} of ${rows.length} lines`,
    filters: activeFilters,
    columns: STOCK_TAKE_VARIANCE_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-stock-take-variance-${new Date().toISOString().slice(0, 10)}`,
  };

  const summary = summarizeStockTakeVariance(visibleRows);

  const columns: DataTableColumn<StockTakeVarianceRow>[] = [
    { key: 'stockTake', header: 'Stock take', cell: (r) => <span className="figure text-xs">{r.stockTakeNumber}</span>, sortValue: (r) => r.stockTakeNumber },
    { key: 'date', header: 'Date', cell: (r) => formatDate(r.countDate), sortValue: (r) => r.countDate },
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.productName}</span>
          <span className="figure text-xs text-muted-foreground">{r.productSku}</span>
        </div>
      ),
      sortValue: (r) => r.productName,
    },
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouseName, sortValue: (r) => r.warehouseName, hideBelowMd: true },
    { key: 'expected', header: 'Expected', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.expectedQty}</span>, sortValue: (r) => r.expectedQty, hideBelowMd: true },
    { key: 'counted', header: 'Counted', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.countedQty}</span>, sortValue: (r) => r.countedQty },
    { key: 'varianceQty', header: 'Variance', align: 'right', cell: (r) => <span className={`figure tabular-nums ${r.varianceQty < 0 ? 'text-negative' : r.varianceQty > 0 ? 'text-positive' : ''}`}>{r.varianceQty > 0 ? `+${r.varianceQty}` : r.varianceQty}</span>, sortValue: (r) => r.varianceQty },
    { key: 'varianceValue', header: 'Variance value', align: 'right', cell: (r) => <Amount value={r.varianceValue} />, sortValue: (r) => r.varianceValue },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—', sortValue: (r) => r.reason ?? '', hideBelowMd: true },
  ];

  const filters: DataTableFilter<StockTakeVarianceRow>[] = [
    { key: 'stockTake', label: 'All stock takes', options: [...new Set(rows.map((r) => r.stockTakeNumber))].map((n) => ({ value: n, label: n })), match: (r, v) => r.stockTakeNumber === v },
    ...(warehouses.length > 1 ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.name, label: w.name })), match: (r: StockTakeVarianceRow, v: string) => r.warehouseName === v } satisfies DataTableFilter<StockTakeVarianceRow>] : []),
  ];

  return (
    <InventoryReportShell
      title="Stock take variance report"
      description="Counted variance from every stock take in the selected period, valued at the frozen weighted-average cost."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      headerExtra={<DateRangeControl idPrefix="stock-take-variance-report" preset={dateRange.preset} onPresetChange={dateRange.setPreset} start={dateRange.customStart} end={dateRange.customEnd} onCustomChange={dateRange.setCustom} />}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Positive variance" value={formatCurrency(summary.positiveVariance)} tone="positive" />
          <FigureBlock label="Negative variance" value={formatCurrency(summary.negativeVariance)} tone="negative" />
          <FigureBlock label="Net variance" value={formatCurrency(summary.netVariance)} />
          <FigureBlock label="Mismatched items" value={String(summary.mismatchedItemCount)} />
        </ReportSummaryCard>
      }
    >
      {!dateRange.range ? (
        <SectionCard>
          <p className="py-6 text-center text-sm text-muted-foreground">
            This company has no financial years defined yet, so "This financial year" cannot be resolved. Choose a different date range preset.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Variance lines" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.lineId}
            searchable={(r) => `${r.productName} ${r.productSku} ${r.stockTakeNumber} ${r.warehouseName}`}
            searchPlaceholder="Search product, stock take"
            filters={filters}
            initialSortKey="date"
            initialSortDirection="desc"
            pageSize={20}
            emptyTitle="No counted variance in this period"
            emptyDescription="Try a different date range, or a stock take that has been counted."
            onVisibleRowsChange={(r, f) => {
              setVisibleRows(r);
              setActiveFilters(f);
            }}
          />
        </SectionCard>
      )}
    </InventoryReportShell>
  );
}
