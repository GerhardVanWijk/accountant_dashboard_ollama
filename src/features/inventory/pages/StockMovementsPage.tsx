import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { StockMovement } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { MOVEMENT_TYPE_LABELS } from '../constants';

interface MovementRow {
  movement: StockMovement;
  productName: string;
  productSku: string;
  warehouseName: string;
  when: string;
}

/** Preserves append-only evidence (spec §12) — every export field is a real column of `StockMovement`, nothing recomputed. */
const MOVEMENT_EXPORT_COLUMNS: ExportColumn<MovementRow>[] = [
  { key: 'when', header: 'Date', accessor: (r) => new Date(r.when) },
  { key: 'sku', header: 'SKU', accessor: (r) => r.productSku },
  { key: 'product', header: 'Product', accessor: (r) => r.productName },
  { key: 'warehouse', header: 'Warehouse', accessor: (r) => r.warehouseName },
  { key: 'type', header: 'Movement Type', accessor: (r) => MOVEMENT_TYPE_LABELS[r.movement.type] },
  { key: 'qty', header: 'Quantity Change', accessor: (r) => r.movement.quantityDelta, align: 'right' },
  { key: 'unitCost', header: 'Unit Cost', accessor: (r) => r.movement.unitCost ?? null, align: 'right' },
  { key: 'value', header: 'Value', accessor: (r) => r.movement.totalCost ?? null, align: 'right' },
  { key: 'sourceType', header: 'Source Type', accessor: (r) => r.movement.sourceDocumentType ?? null },
  { key: 'sourceDocument', header: 'Source Document', accessor: (r) => r.movement.sourceDocumentId ?? null },
  { key: 'reference', header: 'Reference', accessor: (r) => r.movement.reference ?? null },
  { key: 'reversal', header: 'Reverses Movement', accessor: (r) => r.movement.reversalOfMovementId ?? null },
];

/**
 * Stock movement ledger — route `/inventory/movements`. The append-only
 * record of every quantity change, with the historical unit cost, value and
 * source document. Read-only: this ledger is never edited from the UI (a
 * correction is a new offsetting movement).
 */
export function StockMovementsPage() {
  const { movements, loading, error, refetch } = useStockMovements();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const canExport = useCanAccess('inventory', 'export');
  const [visibleRows, setVisibleRows] = useState<MovementRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const rows: MovementRow[] = useMemo(
    () =>
      [...movements]
        .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt))
        .map((movement) => ({
          movement,
          productName: productById.get(movement.productId)?.name ?? movement.productId,
          productSku: productById.get(movement.productId)?.sku ?? '',
          warehouseName: warehouseById.get(movement.warehouseId)?.name ?? movement.warehouseId,
          when: movement.movementDate ?? movement.createdAt,
        })),
    [movements, productById, warehouseById],
  );

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

  const columns: DataTableColumn<MovementRow>[] = [
    {
      key: 'when',
      header: 'Date',
      cell: (r) => <span className="figure text-xs whitespace-nowrap">{formatDateTime(r.when)}</span>,
      sortValue: (r) => r.when,
    },
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
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.warehouseName}</span>,
      sortValue: (r) => r.warehouseName,
      hideBelowMd: true,
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-sm">{MOVEMENT_TYPE_LABELS[r.movement.type]}</span>
          {r.movement.reversalOfMovementId && (
            <span className="text-xs text-muted-foreground">reverses {r.movement.reversalOfMovementId.slice(0, 8)}…</span>
          )}
        </div>
      ),
      sortValue: (r) => r.movement.type,
    },
    {
      key: 'qty',
      header: 'Qty change',
      align: 'right',
      cell: (r) => (
        <span
          className={cn('figure tabular-nums', r.movement.quantityDelta < 0 ? 'text-negative' : 'text-positive')}
        >
          {r.movement.quantityDelta > 0 ? `+${r.movement.quantityDelta}` : r.movement.quantityDelta}
        </span>
      ),
      sortValue: (r) => r.movement.quantityDelta,
    },
    {
      key: 'unitCost',
      header: 'Unit cost',
      align: 'right',
      cell: (r) => (r.movement.unitCost != null ? <Amount value={r.movement.unitCost} /> : <span className="text-xs text-muted-foreground">—</span>),
      sortValue: (r) => r.movement.unitCost ?? -1,
      hideBelowMd: true,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (r) => (r.movement.totalCost != null ? <Amount value={r.movement.totalCost} /> : <span className="text-xs text-muted-foreground">—</span>),
      sortValue: (r) => r.movement.totalCost ?? -1,
    },
    {
      key: 'source',
      header: 'Source',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-sm">{r.movement.sourceDocumentType ?? r.movement.reference ?? '—'}</span>
          {r.movement.sourceDocumentId && (
            <span className="figure text-xs text-muted-foreground">{r.movement.sourceDocumentId.slice(0, 8)}…</span>
          )}
          {r.movement.sourceDocumentLineId && (
            <span className="text-xs text-muted-foreground">line {r.movement.sourceDocumentLineId.slice(0, 8)}…</span>
          )}
        </div>
      ),
      sortValue: (r) => r.movement.sourceDocumentType ?? r.movement.reference ?? '',
      hideBelowMd: true,
    },
  ];

  const filters: DataTableFilter<MovementRow>[] = [
    {
      key: 'type',
      label: 'All types',
      options: (Object.keys(MOVEMENT_TYPE_LABELS) as StockMovement['type'][]).map((t) => ({
        value: t,
        label: MOVEMENT_TYPE_LABELS[t],
      })),
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
    ...(warehouses.length > 1
      ? [
          {
            key: 'warehouse',
            label: 'All warehouses',
            options: warehouses.map((w) => ({ value: w.id, label: w.name })),
            match: (r: MovementRow, value: string) => r.movement.warehouseId === value,
          } satisfies DataTableFilter<MovementRow>,
        ]
      : []),
    {
      key: 'source',
      label: 'Any source',
      options: [
        { value: 'document', label: 'Document-linked' },
        { value: 'reference', label: 'Reference only' },
        { value: 'none', label: 'No source' },
      ],
      match: (r, value) => {
        if (value === 'document') return Boolean(r.movement.sourceDocumentType && r.movement.sourceDocumentId);
        if (value === 'reference') return !r.movement.sourceDocumentType && Boolean(r.movement.reference);
        return !r.movement.sourceDocumentType && !r.movement.reference;
      },
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
        <div className="grid gap-6 sm:grid-cols-3">
          <FigureBlock label="Movements" value={String(movements.length)} hint="All time" />
          <FigureBlock label="Units in" value={totalIn.toLocaleString('en-ZA')} hint="Receipts, returns, gains, opening" tone="positive" />
          <FigureBlock label="Units out" value={totalOut.toLocaleString('en-ZA')} hint="Sales, transfers out, write-offs" />
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
            searchable={(r) => `${r.productName} ${r.productSku} ${r.movement.reference ?? ''} ${r.warehouseName}`}
            searchPlaceholder="Search item, reference, warehouse"
            filters={filters}
            initialSortKey="when"
            initialSortDirection="desc"
            pageSize={20}
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
    </div>
  );
}
