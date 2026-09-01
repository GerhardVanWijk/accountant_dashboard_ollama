import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatDateTime } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { DateRangeControl } from '../../components/reports/DateRangeControl';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { useFinancialYears } from '@/features/accounting/hooks/useFinancialYears';
import { useStockMovements } from '../../hooks/useStockMovements';
import { useProducts } from '../../hooks/useProducts';
import { useWarehouses } from '../../hooks/useWarehouses';
import { MOVEMENT_TYPE_LABELS } from '../../constants';
import { isWithinDateRange } from '../../reports/dateRange';
import type { StockMovement } from '@/types';

interface MovementReportRow {
  movement: StockMovement;
  productName: string;
  productSku: string;
  warehouseName: string;
  when: string;
}

const MOVEMENT_REPORT_EXPORT_COLUMNS: ExportColumn<MovementReportRow>[] = [
  { key: 'when', header: 'Date', accessor: (r) => new Date(r.when) },
  { key: 'sku', header: 'SKU', accessor: (r) => r.productSku },
  { key: 'product', header: 'Product', accessor: (r) => r.productName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouseName },
  { key: 'type', header: 'Movement', accessor: (r) => MOVEMENT_TYPE_LABELS[r.movement.type] },
  { key: 'qty', header: 'Quantity', accessor: (r) => r.movement.quantityDelta, align: 'right' },
  { key: 'unitCost', header: 'Unit Cost', accessor: (r) => r.movement.unitCost ?? null, align: 'right' },
  { key: 'value', header: 'Value', accessor: (r) => r.movement.totalCost ?? null, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.movement.totalCost ?? 0)) },
  { key: 'source', header: 'Source', accessor: (r) => r.movement.sourceDocumentType ?? null },
  { key: 'reference', header: 'Reference', accessor: (r) => r.movement.reference ?? null },
  { key: 'reversal', header: 'Reverses Movement', accessor: (r) => r.movement.reversalOfMovementId ?? null },
];

/**
 * Stock Movement report — route `/inventory/reports/movements` (spec §7). A
 * date-range-scoped, report-framed view over the same append-only
 * `stock_movements` ledger `StockMovementsPage` (the operational register)
 * reads — this page adds the date-range control and explicit
 * increases/decreases/net/value totals spec §7/§21 ask for; it never edits
 * or re-derives a movement. No opening-balance-at-an-arbitrary-date figure
 * is shown: the ledger can be summed exactly for any period, but a
 * point-in-time "opening balance" would require replaying the whole ledger
 * from the beginning of time for every warehouse/product, which this report
 * does not attempt (spec: "do not fabricate historical opening balances").
 */
export function StockMovementReportPage() {
  const { movements, loading: movementsLoading, error: movementsError, refetch } = useStockMovements();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { financialYears } = useFinancialYears();
  const canExport = useCanAccess('inventory', 'export');
  const dateRange = useDateRangeFilter(financialYears);
  const [visibleRows, setVisibleRows] = useState<MovementReportRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = movementsLoading || productsLoading || warehousesLoading;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const rows: MovementReportRow[] = useMemo(() => {
    const inRange = dateRange.range
      ? movements.filter((m) => isWithinDateRange(m.movementDate ?? m.createdAt, dateRange.range!))
      : [];
    return [...inRange]
      .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt))
      .map((movement) => ({
        movement,
        productName: productById.get(movement.productId)?.name ?? movement.productId,
        productSku: productById.get(movement.productId)?.sku ?? '',
        warehouseName: warehouseById.get(movement.warehouseId)?.name ?? movement.warehouseId,
        when: movement.movementDate ?? movement.createdAt,
      }));
  }, [movements, productById, warehouseById, dateRange.range]);

  const exportDataset: ExportDataset<MovementReportRow> = {
    title: 'Stock Movement Report',
    subtitle: dateRange.range ? `${dateRange.range.start} to ${dateRange.range.end} — ${visibleRows.length} of ${rows.length} movements` : `${visibleRows.length} of ${rows.length} movements`,
    filters: activeFilters,
    columns: MOVEMENT_REPORT_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-movement-report-${new Date().toISOString().slice(0, 10)}`,
  };

  const increases = sumMoney(visibleRows.filter((r) => r.movement.quantityDelta > 0).map((r) => r.movement.totalCost ?? 0));
  const decreases = sumMoney(visibleRows.filter((r) => r.movement.quantityDelta < 0).map((r) => r.movement.totalCost ?? 0));
  const netUnits = visibleRows.reduce((sum, r) => sum + r.movement.quantityDelta, 0);

  const columns: DataTableColumn<MovementReportRow>[] = [
    { key: 'when', header: 'Date', cell: (r) => <span className="figure text-xs whitespace-nowrap">{formatDateTime(r.when)}</span>, sortValue: (r) => r.when },
    {
      key: 'product',
      header: 'Item',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.productName}</span>
          <span className="figure text-xs text-muted-foreground">{r.productSku}</span>
        </div>
      ),
      sortValue: (r) => r.productName,
    },
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouseName, sortValue: (r) => r.warehouseName, hideBelowMd: true },
    { key: 'type', header: 'Movement', cell: (r) => MOVEMENT_TYPE_LABELS[r.movement.type], sortValue: (r) => r.movement.type },
    {
      key: 'qty',
      header: 'Qty change',
      align: 'right',
      cell: (r) => <span className={`figure tabular-nums ${r.movement.quantityDelta < 0 ? 'text-negative' : 'text-positive'}`}>{r.movement.quantityDelta > 0 ? `+${r.movement.quantityDelta}` : r.movement.quantityDelta}</span>,
      sortValue: (r) => r.movement.quantityDelta,
    },
    { key: 'value', header: 'Value', align: 'right', cell: (r) => (r.movement.totalCost != null ? <Amount value={r.movement.totalCost} /> : <span className="text-xs text-muted-foreground">—</span>), sortValue: (r) => r.movement.totalCost ?? -1 },
  ];

  const filters: DataTableFilter<MovementReportRow>[] = [
    { key: 'type', label: 'All types', options: (Object.keys(MOVEMENT_TYPE_LABELS) as StockMovement['type'][]).map((t) => ({ value: t, label: MOVEMENT_TYPE_LABELS[t] })), match: (r, v) => r.movement.type === v },
    ...(warehouses.length > 1 ? [{ key: 'warehouse', label: 'All warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r: MovementReportRow, v: string) => r.movement.warehouseId === v } satisfies DataTableFilter<MovementReportRow>] : []),
  ];

  return (
    <InventoryReportShell
      title="Stock movement report"
      description="Every quantity change in the selected period, with increases, decreases and net movement value."
      loading={loading}
      error={movementsError}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      headerExtra={<DateRangeControl idPrefix="movement-report" preset={dateRange.preset} onPresetChange={dateRange.setPreset} start={dateRange.customStart} end={dateRange.customEnd} onCustomChange={dateRange.setCustom} />}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Movements" value={String(visibleRows.length)} />
          <FigureBlock label="Increases (value)" value={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(increases)} tone="positive" />
          <FigureBlock label="Decreases (value)" value={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(decreases)} tone="negative" />
          <FigureBlock label="Net units" value={netUnits.toLocaleString('en-ZA')} />
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
        <SectionCard title="Movements" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.movement.id}
            searchable={(r) => `${r.productName} ${r.productSku} ${r.movement.reference ?? ''} ${r.warehouseName}`}
            searchPlaceholder="Search item, reference, warehouse"
            filters={filters}
            initialSortKey="when"
            initialSortDirection="desc"
            pageSize={20}
            emptyTitle="No movements in this period"
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
