import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { StockMovement } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { formatDate } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useFinancialYears } from '@/features/accounting/hooks/useFinancialYears';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockMovementResolvers } from '../hooks/useStockMovementResolvers';
import { resolveDateRangePreset, type DateRangePreset } from '../reports/dateRange';
import { MOVEMENT_TYPE_LABELS } from '../constants';
import { MovementEvidenceDrawer } from '../components/MovementEvidenceDrawer';
import {
  buildMovementEvidenceContext,
  hasNoSourceEvidence,
  type MovementEvidenceContext,
} from '../utils/movementEvidence';

interface MovementRow {
  movement: StockMovement;
  productName: string;
  productSku: string;
  warehouseName: string;
  fromTo: string;
  sourceLabel: string;
  sourceNumber?: string;
  sourcePath?: string;
  party?: string;
  missingEvidence: boolean;
  balanceAfter?: number;
  when: string;
}

const MOVEMENT_EXPORT_COLUMNS: ExportColumn<MovementRow>[] = [
  { key: 'when', header: 'Date', accessor: (r) => new Date(r.when) },
  { key: 'sku', header: 'SKU', accessor: (r) => r.productSku },
  { key: 'product', header: 'Product', accessor: (r) => r.productName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouseName },
  { key: 'type', header: 'Movement', accessor: (r) => MOVEMENT_TYPE_LABELS[r.movement.type] },
  { key: 'in', header: 'Qty In', accessor: (r) => (r.movement.quantityDelta > 0 ? r.movement.quantityDelta : null), align: 'right' },
  { key: 'out', header: 'Qty Out', accessor: (r) => (r.movement.quantityDelta < 0 ? -r.movement.quantityDelta : null), align: 'right' },
  { key: 'balance', header: 'Balance', accessor: (r) => r.balanceAfter ?? null, align: 'right' },
  { key: 'unitCost', header: 'Unit Cost', accessor: (r) => r.movement.unitCost ?? null, align: 'right' },
  { key: 'value', header: 'Value', accessor: (r) => r.movement.totalCost ?? null, align: 'right' },
  { key: 'sourceDoc', header: 'Source Document', accessor: (r) => r.sourceNumber ?? r.sourceLabel },
  { key: 'party', header: 'Party', accessor: (r) => r.party ?? null },
  { key: 'evidence', header: 'Evidence', accessor: (r) => (r.missingEvidence ? 'No source link' : 'Linked') },
];

const PERIOD_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_financial_year', label: 'This financial year' },
];

/**
 * Stock movements — route `/inventory/movements`. The append-only record of
 * every quantity change across the whole company, in the same professional
 * shape as the Product workspace's Traceability tab: resolved product,
 * warehouse and source-document names (never a raw UUID), a per-product
 * running balance, an evidence badge, and a row-click that opens the full
 * evidence drawer over the page. Read-only.
 */
export function StockMovementsPage() {
  const { movements, loading, error, refetch } = useStockMovements();
  const resolvers = useStockMovementResolvers();
  const { financialYears } = useFinancialYears();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<MovementRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);
  const [drawer, setDrawer] = useState<MovementEvidenceContext | null>(null);

  const rows: MovementRow[] = useMemo(() => {
    // Per-product running balance, forward from the earliest movement.
    const chronological = [...movements].sort((a, b) =>
      (a.movementDate ?? a.createdAt).localeCompare(b.movementDate ?? b.createdAt),
    );
    const runningByProduct = new Map<string, number>();
    const balanceAfter = new Map<string, number>();
    for (const m of chronological) {
      const next = (runningByProduct.get(m.productId) ?? 0) + m.quantityDelta;
      runningByProduct.set(m.productId, next);
      balanceAfter.set(m.id, next);
    }

    return [...movements]
      .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt))
      .map((movement) => {
        const src = resolvers.resolveSource(movement);
        let fromTo = '';
        if ((movement.type === 'transfer_in' || movement.type === 'transfer_out') && movement.sourceDocumentId) {
          const t = resolvers.transfers.find((tr) => tr.id === movement.sourceDocumentId);
          if (t) {
            fromTo = `${resolvers.warehouseName(t.fromWarehouseId)} → ${resolvers.warehouseName(t.toWarehouseId)}`;
          }
        }
        return {
          movement,
          productName: resolvers.productName(movement.productId),
          productSku: resolvers.productSku(movement.productId),
          warehouseName: resolvers.warehouseName(movement.warehouseId),
          fromTo,
          sourceLabel: src?.label ?? (movement.sourceDocumentType ?? '—'),
          sourceNumber: src?.number,
          sourcePath: src?.path,
          party: resolvers.resolveParty(movement),
          missingEvidence: hasNoSourceEvidence(movement),
          balanceAfter: balanceAfter.get(movement.id),
          when: movement.movementDate ?? movement.createdAt,
        };
      });
  }, [movements, resolvers]);

  const exportDataset: ExportDataset<MovementRow> = {
    title: 'Stock Movements',
    subtitle: `${visibleRows.length} of ${movements.length} movements`,
    filters: activeFilters,
    columns: MOVEMENT_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `stock-movements-${new Date().toISOString().slice(0, 10)}`,
  };

  const totalIn = movements.filter((m) => m.quantityDelta > 0).reduce((s, m) => s + m.quantityDelta, 0);
  const totalOut = movements.filter((m) => m.quantityDelta < 0).reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const missingCount = movements.filter(hasNoSourceEvidence).length;

  function openMovement(r: MovementRow) {
    setDrawer(
      buildMovementEvidenceContext(r.movement, resolvers, {
        runningQuantity: r.balanceAfter,
        currentWac: resolvers.products.find((p) => p.id === r.movement.productId)?.costPrice,
        showProductLabel: true,
      }),
    );
  }

  const columns: DataTableColumn<MovementRow>[] = [
    {
      key: 'when',
      header: 'Date',
      cell: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.when)}</span>,
      sortValue: (r) => r.when,
    },
    {
      key: 'product',
      header: 'Item',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{r.productName}</span>
          <span className="figure text-xs text-muted-foreground">{r.productSku}</span>
        </div>
      ),
      sortValue: (r) => r.productName,
    },
    {
      key: 'type',
      header: 'Movement',
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {MOVEMENT_TYPE_LABELS[r.movement.type]}
            {r.missingEvidence && (
              <span className="rounded border border-status-warning-outline bg-status-warning-surface/50 px-1 py-px text-[0.65rem] font-medium text-status-warning">
                no source
              </span>
            )}
            {r.movement.reversalOfMovementId && (
              <span className="rounded border border-border bg-muted px-1 py-px text-[0.65rem] text-muted-foreground">reversal</span>
            )}
          </span>
          {r.fromTo && <span className="text-xs text-muted-foreground">{r.fromTo}</span>}
        </div>
      ),
      sortValue: (r) => r.movement.type,
    },
    {
      key: 'in',
      header: 'In',
      align: 'right',
      cell: (r) => (r.movement.quantityDelta > 0 ? <span className="figure tabular-nums text-status-positive">+{r.movement.quantityDelta}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => (r.movement.quantityDelta > 0 ? r.movement.quantityDelta : 0),
    },
    {
      key: 'out',
      header: 'Out',
      align: 'right',
      cell: (r) => (r.movement.quantityDelta < 0 ? <span className="figure tabular-nums text-status-negative">{r.movement.quantityDelta}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => (r.movement.quantityDelta < 0 ? -r.movement.quantityDelta : 0),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (r) => <span className="figure tabular-nums text-muted-foreground">{r.balanceAfter ?? '—'}</span>,
      sortValue: (r) => r.balanceAfter ?? 0,
      hideBelowLg: true,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.warehouseName}</span>,
      sortValue: (r) => r.warehouseName,
      hideBelowMd: true,
    },
    {
      key: 'source',
      header: 'Source document',
      cell: (r) =>
        r.sourceNumber ? (
          <span className="text-sm">
            <span className="font-medium text-foreground">{r.sourceNumber}</span>
            <span className="ml-1 text-xs text-muted-foreground">{r.sourceLabel}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{r.sourceLabel}</span>
        ),
      sortValue: (r) => r.sourceNumber ?? r.sourceLabel,
      hideBelowMd: true,
    },
    {
      key: 'party',
      header: 'Party',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.party ?? '—'}</span>,
      sortValue: (r) => r.party ?? '',
      hideBelowXl: true,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (r) => (r.movement.totalCost != null ? <Amount value={r.movement.totalCost} /> : <span className="text-xs text-muted-foreground">—</span>),
      sortValue: (r) => r.movement.totalCost ?? -1,
    },
  ];

  const warehouseOptions = resolvers.warehouses.map((w) => ({ value: w.id, label: w.name }));
  const productOptions = [...resolvers.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }));

  const filters: DataTableFilter<MovementRow>[] = [
    {
      key: 'period',
      label: 'Any date',
      options: PERIOD_PRESETS,
      match: (r, value) => {
        const range = resolveDateRangePreset(value as DateRangePreset, new Date(), financialYears);
        if (!range) return true;
        const d = (r.when ?? '').slice(0, 10);
        return d >= range.start && d <= range.end;
      },
    },
    {
      key: 'type',
      label: 'All movement types',
      options: (Object.keys(MOVEMENT_TYPE_LABELS) as StockMovement['type'][]).map((t) => ({ value: t, label: MOVEMENT_TYPE_LABELS[t] })),
      match: (r, value) => r.movement.type === value,
    },
    {
      key: 'direction',
      label: 'Any direction',
      options: [
        { value: 'in', label: 'Stock in' },
        { value: 'out', label: 'Stock out' },
      ],
      match: (r, value) => (value === 'in' ? r.movement.quantityDelta > 0 : r.movement.quantityDelta < 0),
    },
    ...(warehouseOptions.length > 1
      ? [{ key: 'warehouse', label: 'All warehouses', options: warehouseOptions, match: (r: MovementRow, v: string) => r.movement.warehouseId === v } satisfies DataTableFilter<MovementRow>]
      : []),
    {
      key: 'product',
      label: 'All products',
      options: productOptions,
      match: (r, value) => r.movement.productId === value,
    },
    {
      key: 'sourceType',
      label: 'Any source type',
      options: [
        { value: 'invoice', label: 'Invoice' },
        { value: 'bill', label: 'Bill' },
        { value: 'credit_note', label: 'Credit note' },
        { value: 'stock_transfer', label: 'Transfer' },
        { value: 'stock_adjustment', label: 'Adjustment' },
        { value: 'stock_take', label: 'Stock take' },
        { value: 'supplier_return', label: 'Supplier return' },
        { value: 'opening_stock_batch', label: 'Opening stock' },
        { value: 'delivery_note', label: 'Delivery note' },
        { value: 'none', label: 'No source link' },
      ],
      match: (r, value) =>
        value === 'none' ? !r.movement.sourceDocumentType : r.movement.sourceDocumentType === value,
    },
    {
      key: 'exceptions',
      label: 'All movements',
      options: [{ value: 'missing', label: 'Exceptions only (no source link)' }],
      match: (r) => r.missingEvidence,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock movements"
        description="The append-only ledger of every quantity change — the single record of why stock moved."
        actions={<ExportMenu dataset={exportDataset} allowed={canExport} />}
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-4">
          <FigureBlock label="Movements" value={String(movements.length)} hint="All time" />
          <FigureBlock label="Units in" value={totalIn.toLocaleString('en-ZA')} hint="Receipts, returns, gains, opening" tone="positive" />
          <FigureBlock label="Units out" value={totalOut.toLocaleString('en-ZA')} hint="Sales, transfers out, write-offs" />
          <FigureBlock
            label="Missing evidence"
            value={String(missingCount)}
            hint="No source-document link"
            tone={missingCount > 0 ? 'warning' : 'default'}
          />
        </div>
      </SectionCard>

      {loading ? (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading movements…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <SectionCard title="Movement ledger" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.movement.id}
            searchable={(r) => `${r.productName} ${r.productSku} ${r.sourceNumber ?? ''} ${r.sourceLabel} ${r.party ?? ''} ${r.warehouseName} ${r.movement.reference ?? ''}`}
            searchPlaceholder="Search item, SKU, document, party, warehouse"
            filters={filters}
            initialSortKey="when"
            initialSortDirection="desc"
            pageSize={20}
            onRowClick={openMovement}
            getRowAriaLabel={(r) => `Open evidence for ${MOVEMENT_TYPE_LABELS[r.movement.type]} of ${r.productName} on ${formatDate(r.when)}`}
            emptyTitle="No stock movements"
            emptyDescription="Movements appear here as documents post and stock actions are recorded."
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />
      <MovementEvidenceDrawer context={drawer} open={drawer != null} onClose={() => setDrawer(null)} />
    </div>
  );
}
