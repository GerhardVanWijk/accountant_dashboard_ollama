import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { OpeningStockBatch, Warehouse } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { OpeningStockBatchesTable } from '../components/OpeningStockBatchesTable';
import { OpeningStockBatchDocumentFormModal } from '../components/OpeningStockBatchDocumentFormModal';
import type { CreateOpeningStockBatchDTO, UpdateOpeningStockBatchDTO } from '../services/openingStockBatchService';

function buildOpeningStockExportColumns(warehouses: Warehouse[]): ExportColumn<OpeningStockBatch>[] {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  return [
    { key: 'number', header: 'Batch Number', accessor: (b) => b.batchNumber },
    { key: 'warehouse', header: 'Warehouse', accessor: (b) => warehouseName(b.warehouseId) },
    { key: 'date', header: 'Effective Date', accessor: (b) => new Date(b.effectiveDate) },
    {
      key: 'total',
      header: 'Total Cost',
      accessor: (b) => b.totalCost,
      align: 'right',
      total: (rows) => rows.reduce((sum, b) => sum + b.totalCost, 0),
    },
    { key: 'status', header: 'Status', accessor: (b) => b.status },
  ];
}

/**
 * Opening Stock register — route `/inventory/opening-stock`, the list only.
 * A row click navigates to the full-page record at
 * `/inventory/opening-stock/:batchId` (OpeningStockBatchDetailPage); legacy
 * `?record=<id>` deep links are redirected there. The explicit
 * confirmation gesture lives on the record page.
 */
export function OpeningStockBatchesPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/inventory/opening-stock');

  const { batches, loading, error, refetch, createBatch, deleteBatch } = useOpeningStockBatches();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const canCreate = useCanAccess('inventory', 'create');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<OpeningStockBatch[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const handleFormSubmit = async (data: CreateOpeningStockBatchDTO | UpdateOpeningStockBatchDTO) => {
    const created = await createBatch(data as CreateOpeningStockBatchDTO);
    setCreating(false);
    navigate(`/inventory/opening-stock/${created.id}`);
  };

  const handleDelete = async (batch: OpeningStockBatch) => {
    if (!window.confirm(`Delete draft batch "${batch.batchNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteBatch(batch.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the opening stock batch.');
    }
  };

  const exportDataset: ExportDataset<OpeningStockBatch> = {
    title: 'Opening Stock Batches',
    subtitle: `${visibleRows.length} of ${batches.length} batches`,
    filters: activeFilters,
    columns: buildOpeningStockExportColumns(warehouses),
    rows: visibleRows,
    filename: `opening-stock-${new Date().toISOString().slice(0, 10)}`,
  };

  const busy = loading || productsLoading || warehousesLoading;
  const draftCount = batches.filter((b) => b.status === 'draft').length;
  const confirmedTotal = batches.filter((b) => b.status === 'confirmed').reduce((sum, b) => sum + b.totalCost, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Opening stock"
        description="Capture opening inventory balances — a deliberate, accounting-significant step that requires explicit confirmation before it posts."
        actions={
          <>
            <ExportMenu dataset={exportDataset} allowed={canExport} />
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus data-icon="inline-start" />
                New batch
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2">
          <FigureBlock label="Drafts" value={String(draftCount)} />
          <FigureBlock label="Confirmed total" value={formatCurrency(confirmedTotal)} hint="Sum of confirmed batches" />
        </div>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading opening stock batches…</p>
        </div>
      )}
      {!busy && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!busy && !error && (
        <SectionCard title="Opening stock register" description="Every opening balance batch and where it stands.">
          <OpeningStockBatchesTable
            batches={batches}
            warehouses={warehouses}
            onSelect={(b) => navigate(`/inventory/opening-stock/${b.id}`)}
            onDelete={canDelete ? (b) => void handleDelete(b) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {creating && (
        <OpeningStockBatchDocumentFormModal
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
