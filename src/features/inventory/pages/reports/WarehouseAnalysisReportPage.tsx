import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildWarehouseAnalysisRows, type WarehouseAnalysisRow } from '../../reports/buildWarehouseAnalysisRows';

const WAREHOUSE_ANALYSIS_EXPORT_COLUMNS: ExportColumn<WarehouseAnalysisRow>[] = [
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouse.name },
  { key: 'items', header: 'Items', accessor: (r) => r.itemCount, align: 'right' },
  { key: 'units', header: 'Units', accessor: (r) => r.units, align: 'right' },
  { key: 'value', header: 'Inventory Value', accessor: (r) => r.inventoryValue, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)) },
  { key: 'low', header: 'Low Stock', accessor: (r) => r.lowStockCount, align: 'right' },
  { key: 'out', header: 'Out of Stock', accessor: (r) => r.outOfStockCount, align: 'right' },
];

/**
 * Warehouse Analysis — route `/inventory/reports/warehouse-analysis` (spec
 * §13). Per-warehouse rollup from `stock_balances`, the authoritative
 * current warehouse balance. "Inbound/In transit" (spec's optional extra)
 * is omitted — see `buildWarehouseAnalysisRows`'s own doc comment for why.
 */
export function WarehouseAnalysisReportPage() {
  const { rows: stockOnHandRows, loading, error, refetch } = useStockOnHandData();
  const { warehouses } = useWarehouses();
  const canExport = useCanAccess('inventory', 'export');

  const rows = buildWarehouseAnalysisRows(stockOnHandRows, warehouses);
  const exportDataset: ExportDataset<WarehouseAnalysisRow> = {
    title: 'Warehouse Analysis',
    subtitle: `${rows.length} warehouses`,
    columns: WAREHOUSE_ANALYSIS_EXPORT_COLUMNS,
    rows,
    filename: `inventory-warehouse-analysis-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalValue = sumMoney(rows.map((r) => r.inventoryValue));

  const columns: DataTableColumn<WarehouseAnalysisRow>[] = [
    { key: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouse.name, sortValue: (r) => r.warehouse.name },
    { key: 'items', header: 'Items', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.itemCount}</span>, sortValue: (r) => r.itemCount },
    { key: 'units', header: 'Units', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.units}</span>, sortValue: (r) => r.units },
    { key: 'value', header: 'Inventory value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
    { key: 'low', header: 'Low stock', align: 'right', cell: (r) => <span className="figure tabular-nums text-warning">{r.lowStockCount}</span>, sortValue: (r) => r.lowStockCount },
    { key: 'out', header: 'Out of stock', align: 'right', cell: (r) => <span className="figure tabular-nums text-negative">{r.outOfStockCount}</span>, sortValue: (r) => r.outOfStockCount },
  ];

  return (
    <InventoryReportShell
      title="Warehouse analysis"
      description="Inventory position by warehouse — items, units, value, and low/out-of-stock counts."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Warehouses" value={String(rows.length)} />
          <FigureBlock label="Total inventory value" value={formatCurrency(totalValue)} />
        </ReportSummaryCard>
      }
    >
      <SectionCard title="By warehouse" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.warehouse.id}
          initialSortKey="value"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="No warehouses"
          emptyDescription="Add a warehouse to see inventory position by location."
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
