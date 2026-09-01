import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useStockOnHandData } from '../../hooks/useStockOnHandData';
import { useProductCategories } from '../../hooks/useProductCategories';
import { buildCategoryAnalysisRows, type CategoryAnalysisRow } from '../../reports/buildCategoryAnalysisRows';

const CATEGORY_ANALYSIS_EXPORT_COLUMNS: ExportColumn<CategoryAnalysisRow>[] = [
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'items', header: 'Items', accessor: (r) => r.itemCount, align: 'right' },
  { key: 'units', header: 'Units on Hand', accessor: (r) => r.units, align: 'right' },
  { key: 'value', header: 'Inventory Value', accessor: (r) => r.inventoryValue, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.inventoryValue)) },
  { key: 'percent', header: '% of Inventory Value', accessor: (r) => r.percentOfInventoryValue, align: 'right' },
];

/**
 * Category Analysis — route `/inventory/reports/category-analysis` (spec
 * §12). STOCK/VALUE only — see `buildCategoryAnalysisRows`'s doc comment for
 * why Sales/COGS/Gross Margin columns are not built (spec §12 classification
 * C: `InvoiceLineItem`/`BillLineItem` carry no `productId` in this schema,
 * so no historical sale is attributable to a category without matching on
 * free text, which spec §12 explicitly forbids).
 */
export function CategoryAnalysisReportPage() {
  const { rows: stockOnHandRows, loading, error, refetch } = useStockOnHandData();
  const { categories } = useProductCategories();
  const canExport = useCanAccess('inventory', 'export');

  const rows = buildCategoryAnalysisRows(stockOnHandRows, categories);
  const exportDataset: ExportDataset<CategoryAnalysisRow> = {
    title: 'Category Analysis',
    subtitle: `${rows.length} categories`,
    columns: CATEGORY_ANALYSIS_EXPORT_COLUMNS,
    rows,
    filename: `inventory-category-analysis-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalValue = sumMoney(rows.map((r) => r.inventoryValue));

  const columns: DataTableColumn<CategoryAnalysisRow>[] = [
    { key: 'category', header: 'Category', cell: (r) => r.categoryName, sortValue: (r) => r.categoryName },
    { key: 'items', header: 'Items', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.itemCount}</span>, sortValue: (r) => r.itemCount },
    { key: 'units', header: 'Units', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.units}</span>, sortValue: (r) => r.units },
    { key: 'value', header: 'Inventory value', align: 'right', cell: (r) => <Amount value={r.inventoryValue} />, sortValue: (r) => r.inventoryValue },
    { key: 'percent', header: '% of value', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.percentOfInventoryValue.toFixed(1)}%</span>, sortValue: (r) => r.percentOfInventoryValue },
  ];

  return (
    <InventoryReportShell
      title="Category analysis"
      description="Inventory position by product category — stock and value only."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Categories" value={String(rows.length)} />
          <FigureBlock label="Total inventory value" value={formatCurrency(totalValue)} />
        </ReportSummaryCard>
      }
      footnote="Sales, COGS and gross margin are not shown here: invoice and bill line items in this system carry no product link, so historical sales cannot be attributed to a category without matching on free text — see docs/INVENTORY_REPORTS.md §12."
    >
      <SectionCard title="By category" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.categoryName}
          initialSortKey="value"
          initialSortDirection="desc"
          pageSize={20}
          emptyTitle="No tracked stock"
          emptyDescription="Tracked products with a stock balance appear here."
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
