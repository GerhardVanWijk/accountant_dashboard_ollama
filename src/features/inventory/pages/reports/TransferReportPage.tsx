import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatDate } from '@/lib/app/format';
import { sumMoney } from '../../services/inventoryValuation';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { DateRangeControl } from '../../components/reports/DateRangeControl';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { useFinancialYears } from '@/features/accounting/hooks/useFinancialYears';
import { useStockTransfers } from '../../hooks/useStockTransfers';
import { useWarehouses } from '../../hooks/useWarehouses';
import { buildTransferReportRows, type TransferReportRow } from '../../reports/buildTransferReportRows';
import { isWithinDateRange } from '../../reports/dateRange';

const TRANSFER_STATUS_LABEL: Record<TransferReportRow['status'], string> = {
  draft: 'Draft',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TRANSFER_REPORT_EXPORT_COLUMNS: ExportColumn<TransferReportRow>[] = [
  { key: 'number', header: 'Transfer Number', accessor: (r) => r.transferNumber },
  { key: 'date', header: 'Date', accessor: (r) => new Date(r.transferDate) },
  { key: 'from', header: 'From', accessor: (r) => r.fromWarehouseName },
  { key: 'to', header: 'To', accessor: (r) => r.toWarehouseName },
  { key: 'status', header: 'Status', accessor: (r) => TRANSFER_STATUS_LABEL[r.status] },
  { key: 'items', header: 'Items', accessor: (r) => r.itemCount, align: 'right' },
  { key: 'quantity', header: 'Quantity', accessor: (r) => r.quantity, align: 'right' },
  { key: 'value', header: 'Value', accessor: (r) => r.value, align: 'right', total: (rows) => sumMoney(rows.map((r) => r.value)) },
  { key: 'dispatch', header: 'Dispatch Date', accessor: (r) => new Date(r.dispatchDate) },
  { key: 'receipt', header: 'Receipt Date', accessor: (r) => (r.receiptDate ? new Date(r.receiptDate) : null) },
  { key: 'inTransitDays', header: 'In-Transit Days', accessor: (r) => r.inTransitDays ?? null, align: 'right' },
];

/**
 * Transfer report — route `/inventory/reports/transfers` (spec §9).
 * Document-level, date-range-scoped by dispatch date; clearly distinguishes
 * draft / in-transit / completed / cancelled via the shared `StatusBadge`
 * (never invents an "immediate vs in-transit" concept beyond the two real
 * lifecycle paths the domain already has).
 */
export function TransferReportPage() {
  const { transfers, loading: transfersLoading, error, refetch } = useStockTransfers();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { financialYears } = useFinancialYears();
  const canExport = useCanAccess('inventory', 'export');
  const dateRange = useDateRangeFilter(financialYears);
  const [visibleRows, setVisibleRows] = useState<TransferReportRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const loading = transfersLoading || warehousesLoading;

  const inRangeTransfers = useMemo(
    () => (dateRange.range ? transfers.filter((t) => isWithinDateRange(t.transferDate, dateRange.range!)) : []),
    [transfers, dateRange.range],
  );
  const rows = useMemo(() => buildTransferReportRows(inRangeTransfers, warehouses), [inRangeTransfers, warehouses]);

  const exportDataset: ExportDataset<TransferReportRow> = {
    title: 'Transfer Report',
    subtitle: dateRange.range ? `${dateRange.range.start} to ${dateRange.range.end} — ${visibleRows.length} of ${rows.length} transfers` : `${visibleRows.length} of ${rows.length} transfers`,
    filters: activeFilters,
    columns: TRANSFER_REPORT_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-transfer-report-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalValue = sumMoney(visibleRows.map((r) => r.value));
  const inTransitCount = visibleRows.filter((r) => r.status === 'in_transit').length;
  const completedCount = visibleRows.filter((r) => r.status === 'completed').length;

  const columns: DataTableColumn<TransferReportRow>[] = [
    { key: 'number', header: 'Transfer', cell: (r) => <span className="figure text-xs">{r.transferNumber}</span>, sortValue: (r) => r.transferNumber },
    { key: 'date', header: 'Date', cell: (r) => formatDate(r.transferDate), sortValue: (r) => r.transferDate },
    { key: 'from', header: 'From', cell: (r) => r.fromWarehouseName, sortValue: (r) => r.fromWarehouseName },
    { key: 'to', header: 'To', cell: (r) => r.toWarehouseName, sortValue: (r) => r.toWarehouseName },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
    { key: 'quantity', header: 'Quantity', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.quantity}</span>, sortValue: (r) => r.quantity, hideBelowMd: true },
    { key: 'value', header: 'Value', align: 'right', cell: (r) => <Amount value={r.value} />, sortValue: (r) => r.value },
    { key: 'inTransitDays', header: 'In transit', align: 'right', cell: (r) => <span className="figure tabular-nums">{r.inTransitDays ?? '—'}</span>, sortValue: (r) => r.inTransitDays ?? -1, hideBelowMd: true },
  ];

  const filters: DataTableFilter<TransferReportRow>[] = [
    { key: 'status', label: 'All statuses', options: (Object.keys(TRANSFER_STATUS_LABEL) as TransferReportRow['status'][]).map((s) => ({ value: s, label: TRANSFER_STATUS_LABEL[s] })), match: (r, v) => r.status === v },
    ...(warehouses.length > 1
      ? [
          { key: 'from', label: 'Any from-warehouse', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r: TransferReportRow, v: string) => r.transfer.fromWarehouseId === v } satisfies DataTableFilter<TransferReportRow>,
          { key: 'to', label: 'Any to-warehouse', options: warehouses.map((w) => ({ value: w.id, label: w.name })), match: (r: TransferReportRow, v: string) => r.transfer.toWarehouseId === v } satisfies DataTableFilter<TransferReportRow>,
        ]
      : []),
  ];

  return (
    <InventoryReportShell
      title="Transfer report"
      description="Inter-warehouse transfers dispatched in the selected period, with status, value and in-transit duration."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      headerExtra={<DateRangeControl idPrefix="transfer-report" preset={dateRange.preset} onPresetChange={dateRange.setPreset} start={dateRange.customStart} end={dateRange.customEnd} onCustomChange={dateRange.setCustom} />}
      summary={
        <ReportSummaryCard>
          <FigureBlock label="Transfers" value={String(visibleRows.length)} />
          <FigureBlock label="In transit" value={String(inTransitCount)} tone={inTransitCount > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Completed" value={String(completedCount)} tone="positive" />
          <FigureBlock label="Total value" value={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalValue)} />
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
        <SectionCard title="Transfers" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.transfer.id}
            searchable={(r) => `${r.transferNumber} ${r.fromWarehouseName} ${r.toWarehouseName}`}
            searchPlaceholder="Search transfer number, warehouse"
            filters={filters}
            initialSortKey="date"
            initialSortDirection="desc"
            pageSize={20}
            emptyTitle="No transfers in this period"
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
