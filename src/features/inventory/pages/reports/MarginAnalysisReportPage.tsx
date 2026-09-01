import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useProducts } from '../../hooks/useProducts';
import { buildMarginAnalysisRows, type MarginAnalysisRow } from '../../reports/buildMarginAnalysisRows';

const MARGIN_ANALYSIS_EXPORT_COLUMNS: ExportColumn<MarginAnalysisRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'product', header: 'Product', accessor: (r) => r.product.name },
  { key: 'sellingPrice', header: 'Selling Price', accessor: (r) => r.sellingPrice, align: 'right' },
  { key: 'wac', header: 'Current WAC', accessor: (r) => r.currentWac, align: 'right' },
  { key: 'unitMargin', header: 'Unit Margin', accessor: (r) => r.unitMargin, align: 'right' },
  { key: 'marginPercent', header: 'Margin %', accessor: (r) => r.marginPercent, align: 'right' },
];

/**
 * Margin Analysis — route `/inventory/reports/margin-analysis` (spec §15).
 * CURRENT THEORETICAL margin only — `sellingPrice − currentWac` at TODAY's
 * list price and TODAY's weighted-average cost, never realised historical
 * gross margin (this schema cannot attribute a historical sale to a
 * product's actual COGS at time of sale — see
 * `buildMarginAnalysisRows`'s doc comment). The "current theoretical" label
 * stays attached to the title, the subtitle, and the printed report; it is
 * never dropped anywhere a viewer might read this as realised margin.
 */
export function MarginAnalysisReportPage() {
  const { products, loading, error, refetch } = useProducts();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<MarginAnalysisRow[]>([]);

  const rows = buildMarginAnalysisRows(products);
  const exportDataset: ExportDataset<MarginAnalysisRow> = {
    title: 'Margin Analysis (Current Theoretical)',
    subtitle: `${visibleRows.length} of ${rows.length} products — today's selling price vs today's WAC, not realised gross margin`,
    columns: MARGIN_ANALYSIS_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-margin-analysis-${new Date().toISOString().slice(0, 10)}`,
  };

  const positiveMarginCount = visibleRows.filter((r) => (r.marginPercent ?? 0) > 0).length;
  const negativeMarginCount = visibleRows.filter((r) => r.marginPercent !== null && r.marginPercent <= 0).length;
  const avgMarginPercent = (() => {
    const withMargin = visibleRows.filter((r) => r.marginPercent !== null);
    if (withMargin.length === 0) return null;
    return withMargin.reduce((sum, r) => sum + (r.marginPercent ?? 0), 0) / withMargin.length;
  })();

  const columns: DataTableColumn<MarginAnalysisRow>[] = [
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
    { key: 'sellingPrice', header: 'Selling price', align: 'right', cell: (r) => <Amount value={r.sellingPrice} />, sortValue: (r) => r.sellingPrice },
    { key: 'wac', header: 'Current WAC', align: 'right', cell: (r) => <Amount value={r.currentWac} />, sortValue: (r) => r.currentWac },
    { key: 'unitMargin', header: 'Unit margin', align: 'right', cell: (r) => <Amount value={r.unitMargin} />, sortValue: (r) => r.unitMargin },
    {
      key: 'marginPercent',
      header: 'Margin %',
      align: 'right',
      cell: (r) => (r.marginPercent === null ? <span className="text-xs text-muted-foreground">—</span> : <span className={`figure tabular-nums ${r.marginPercent < 0 ? 'text-negative' : 'text-positive'}`}>{r.marginPercent.toFixed(1)}%</span>),
      sortValue: (r) => r.marginPercent ?? -9999,
    },
  ];

  return (
    <InventoryReportShell
      title="Margin analysis"
      description="Current theoretical margin per product — today's selling price against today's weighted-average cost."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Products" value={String(visibleRows.length)} />
          <FigureBlock label="Positive margin" value={String(positiveMarginCount)} tone="positive" />
          <FigureBlock label="Zero/negative margin" value={String(negativeMarginCount)} tone={negativeMarginCount > 0 ? 'negative' : 'default'} />
          <FigureBlock label="Average margin %" value={avgMarginPercent === null ? '—' : `${avgMarginPercent.toFixed(1)}%`} />
        </ReportSummaryCard>
      }
      footnote="This is CURRENT THEORETICAL margin (today's price vs today's WAC), not realised historical gross margin — invoice lines carry no product link in this system, so a past sale's actual margin cannot be reconstructed. See docs/INVENTORY_REPORTS.md §15."
    >
      <SectionCard title="Margin by product" bodyClassName="p-4 sm:p-5">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.product.id}
          searchable={(r) => `${r.product.name} ${r.product.sku}`}
          searchPlaceholder="Search SKU, product"
          initialSortKey="marginPercent"
          pageSize={20}
          emptyTitle="No goods to analyse"
          emptyDescription="Products of type 'good' with a selling price and cost appear here."
          onVisibleRowsChange={(r) => setVisibleRows(r)}
        />
      </SectionCard>
    </InventoryReportShell>
  );
}
