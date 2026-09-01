import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { buildSupplierAnalysisRows, type SupplierAnalysisRow } from '../../reports/buildSupplierAnalysisRows';

const SUPPLIER_ANALYSIS_EXPORT_COLUMNS: ExportColumn<SupplierAnalysisRow>[] = [
  { key: 'supplier', header: 'Supplier', accessor: (r) => r.supplier.name },
  { key: 'items', header: 'Preferred Items', accessor: (r) => r.itemCount, align: 'right' },
  { key: 'value', header: 'Inventory Value', accessor: (r) => r.inventoryValue, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)) },
  { key: 'lowStock', header: 'Low Stock Items', accessor: (r) => r.lowStockCount, align: 'right' },
  { key: 'replenishment', header: 'Outstanding Replenishment Qty', accessor: (r) => r.outstandingReplenishmentQty, align: 'right' },
];

/**
 * Supplier Analysis — route `/inventory/reports/supplier-analysis` (spec
 * §14). INVENTORY POSITION only, never "profitability" or "purchase
 * activity" — see `buildSupplierAnalysisRows`'s doc comment for exactly why
 * this schema cannot honestly support either (no `supplierId` on
 * `StockMovement`, no `productId` on `Bill` lines).
 */
export function SupplierAnalysisReportPage() {
  const { rows: stockOnHandRows, loading: stockLoading, error: stockError, refetch: refetchStock } = useStockOnHandData();
  const { suppliers, loading: suppliersLoading, error: suppliersError, refetch: refetchSuppliers } = useSuppliers();
  const canExport = useCanAccess('inventory', 'export');

  const loading = stockLoading || suppliersLoading;
  const error = stockError ?? suppliersError;
  const rows = buildSupplierAnalysisRows(stockOnHandRows, suppliers);

  const exportDataset: ExportDataset<SupplierAnalysisRow> = {
    title: 'Supplier Analysis',
    subtitle: `${rows.length} suppliers with preferred items`,
    columns: SUPPLIER_ANALYSIS_EXPORT_COLUMNS,
    rows,
    filename: `inventory-supplier-analysis-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalValue = sumMoney(rows.map((r) => r.inventoryValue));

  const columns: DataTableColumn<SupplierAnalysisRow>[] = [
    { key: 'supplier', header: 'Supplier', cell: (r) => r.supplier.name, sortValue: (r) => r.supplier.name },
    { key: 'items', header: 'Preferred items', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.itemCount}</span>, sortValue: (r) => r.itemCount },
    { key: 'value', header: 'Inventory value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
    { key: 'lowStock', header: 'Low stock', align: 'right', cell: (r) => <span className="figure tabular-nums text-warning">{r.lowStockCount}</span>, sortValue: (r) => r.lowStockCount },
    { key: 'replenishment', header: 'Outstanding reorder qty', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.outstandingReplenishmentQty}</span>, sortValue: (r) => r.outstandingReplenishmentQty },
  ];

  return (
    <InventoryReportShell
      title="Supplier analysis"
      description="Inventory position by preferred supplier — items, value, and outstanding replenishment need."
      loading={loading}
      error={error}
      onRetry={() => {
        void refetchStock();
        void refetchSuppliers();
      }}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Suppliers with preferred items" value={String(rows.length)} />
          <FigureBlock label="Total inventory value" value={formatCurrency(totalValue)} />
        </ReportSummaryCard>
      }
      footnote="Purchase activity and profitability are not shown: no stock movement records which supplier a receipt came from, and bill line items carry no product link — this is inventory POSITION by preferred supplier only. See docs/INVENTORY_REPORTS.md §14."
    >
      <SectionCard title="By supplier" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.supplier.id}
          initialSortKey="value"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="No supplier relationships"
          emptyDescription="Set a preferred supplier on a product to see it here."
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
