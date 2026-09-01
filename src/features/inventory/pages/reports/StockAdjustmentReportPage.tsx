import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency, formatDateTime } from '@/lib/app/format';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { DateRangeControl } from '../../components/reports/DateRangeControl';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { useFinancialYears } from '@/features/accounting/hooks/useFinancialYears';
import { useStockAdjustments } from '../../hooks/useStockAdjustments';
import { useProducts } from '../../hooks/useProducts';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildAdjustmentReportRows, summarizeAdjustmentReport, type AdjustmentReportRow } from '../../reports/buildAdjustmentReportRows';
import { isWithinDateRange } from '../../reports/dateRange';
import type { StockAdjustmentReason } from '@/types';

// Mirrors `StockAdjustmentsTable`/`StockAdjustmentDetail`/`StockAdjustmentDocumentForm`'s
// own local `REASON_LABEL` — this codebase keeps that map per-file rather
// than centralized (pre-existing convention, not something this phase
// changes).
const ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  write_off: 'Write-off',
  shrinkage: 'Shrinkage',
  damage: 'Damage',
  stock_gain: 'Stock gain',
  correction: 'Correction',
  other: 'Other adjustment',
};

const ADJUSTMENT_REPORT_EXPORT_COLUMNS: ExportColumn<AdjustmentReportRow>[] = [
  { key: 'date', header: 'Date', accessor: (r) => new Date(r.date) },
  { key: 'number', header: 'Adjustment Number', accessor: (r) => r.adjustmentNumber },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouseName },
  { key: 'product', header: 'Product', accessor: (r) => r.productName },
  { key: 'reason', header: 'Reason', accessor: (r) => ADJUSTMENT_REASON_LABELS[r.reason] },
  { key: 'direction', header: 'Gain/Loss', accessor: (r) => (r.direction === 'gain' ? 'Gain' : 'Loss') },
  { key: 'quantity', header: 'Quantity', accessor: (r) => r.quantity, align: 'right' },
  { key: 'unitCost', header: 'Unit Cost', accessor: (r) => r.unitCost, align: 'right' },
  { key: 'value', header: 'Value', accessor: (r) => r.value, align: 'right' },
  { key: 'status', header: 'Status', accessor: (r) => r.status },
  { key: 'journalEntry', header: 'Journal Entry', accessor: (r) => r.journalEntryId ?? null },
];

/**
 * Stock Adjustment report — route `/inventory/reports/adjustments` (spec
 * §8). Line-level (`buildAdjustmentReportRows`), date-range-scoped by
 * `adjustmentDate`, with the four totals spec §8/§21 asks for. Reads the
 * same `stockAdjustmentService` data the operational register does — never
 * a separate write path.
 */
export function StockAdjustmentReportPage() {
  const { adjustments, loading: adjLoading, error, refetch } = useStockAdjustments();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { financialYears } = useFinancialYears();
  const canExport = useCanAccess('inventory', 'export');
  const dateRange = useDateRangeFilter(financialYears);
  const [visibleRows, setVisibleRows] = useState<AdjustmentReportRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = adjLoading || productsLoading || warehousesLoading;

  const inRangeAdjustments = useMemo(
    () => (dateRange.range ? adjustments.filter((a) => isWithinDateRange(a.adjustmentDate, dateRange.range!)) : []),
    [adjustments, dateRange.range],
  );
  const rows = useMemo(() => buildAdjustmentReportRows(inRangeAdjustments, products, warehouses), [inRangeAdjustments, products, warehouses]);

  const exportDataset: ExportDataset<AdjustmentReportRow> = {
    title: 'Stock Adjustment Report',
    subtitle: dateRange.range ? `${dateRange.range.start} to ${dateRange.range.end} — ${visibleRows.length} of ${rows.length} lines` : `${visibleRows.length} of ${rows.length} lines`,
    filters: activeFilters,
    columns: ADJUSTMENT_REPORT_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-adjustment-report-${new Date().toISOString().slice(0, 10)}`,
  };

  const summary = summarizeAdjustmentReport(visibleRows);

  const columns: DataTableColumn<AdjustmentReportRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => <span className="figure text-xs whitespace-nowrap">{formatDateTime(r.date)}</span>, sortValue: (r) => r.date },
    { key: 'number', header: 'Adjustment', cell: (r) => <span className="figure text-xs">{r.adjustmentNumber}</span>, sortValue: (r) => r.adjustmentNumber },
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
    { key: 'reason', header: 'Reason', cell: (r) => ADJUSTMENT_REASON_LABELS[r.reason], sortValue: (r) => r.reason, hideBelowMd: true },
    { key: 'qty', header: 'Quantity', align: 'right', cell: (r) => <span className={`figure tabular-nums ${r.direction === 'loss' ? 'text-negative' : 'text-positive'}`}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</span>, sortValue: (r) => r.quantity },
    { key: 'value', header: 'Value', align: 'right', cell: (r) => <Amount value={r.value} />, sortValue: (r) => r.value },
    { key: 'status', header: 'Status', cell: (r) => r.status, sortValue: (r) => r.status },
  ];

  const filters: DataTableFilter<AdjustmentReportRow>[] = [
    { key: 'reason', label: 'All reasons', options: (Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReportRow['reason'][]).map((r) => ({ value: r, label: ADJUSTMENT_REASON_LABELS[r] })), match: (r, v) => r.reason === v },
    { key: 'status', label: 'All statuses', options: [{ value: 'draft', label: 'Draft' }, { value: 'pending_approval', label: 'Pending approval' }, { value: 'posted', label: 'Posted' }, { value: 'cancelled', label: 'Cancelled' }], match: (r, v) => r.status === v },
  ];

  return (
    <InventoryReportShell
      title="Stock adjustment report"
      description="Every posted stock-adjustment line in the selected period, by reason, gain/loss and value."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      headerExtra={<DateRangeControl idPrefix="adjustment-report" preset={dateRange.preset} onPresetChange={dateRange.setPreset} start={dateRange.customStart} end={dateRange.customEnd} onCustomChange={dateRange.setCustom} />}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Total gains" value={formatCurrency(summary.totalGains)} tone="positive" />
          <FigureBlock label="Total losses" value={formatCurrency(summary.totalLosses)} tone="negative" />
          <FigureBlock label="Net adjustment" value={formatCurrency(summary.netAdjustment)} />
          <FigureBlock label="Total write-offs" value={formatCurrency(summary.totalWriteOffs)} />
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
        <SectionCard title="Adjustment lines" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.lineId}
            searchable={(r) => `${r.productName} ${r.productSku} ${r.adjustmentNumber} ${r.warehouseName}`}
            searchPlaceholder="Search product, adjustment number"
            filters={filters}
            initialSortKey="date"
            initialSortDirection="desc"
            pageSize={20}
            emptyTitle="No adjustments in this period"
            emptyDescription="Try a different date range."
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
