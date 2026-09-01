import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { OpeningStockBatch } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { OpeningStockBatchesTable } from '../components/OpeningStockBatchesTable';
import { OpeningStockBatchDetailSheet } from '../components/OpeningStockBatchDetailSheet';
import { OpeningStockBatchDocumentFormModal } from '../components/OpeningStockBatchDocumentFormModal';
import type { CreateOpeningStockBatchDTO, UpdateOpeningStockBatchDTO } from '../services/openingStockBatchService';
import type { Warehouse } from '@/types';

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

type DialogState = { mode: 'create' } | { mode: 'edit'; batch: OpeningStockBatch } | null;

/**
 * Opening Stock register — route `/inventory/opening-stock` (Phase 5
 * §5). Draft → confirmed lifecycle over `openingStockBatchService`,
 * mirroring `StockAdjustmentsPage`'s shape.
 */
export function OpeningStockBatchesPage() {
  const {
    batches,
    loading,
    error,
    refetch,
    createBatch,
    updateBatch,
    deleteBatch,
    confirmBatch,
    cancelBatch,
    previewAccountingEffect,
  } = useOpeningStockBatches();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { accounts } = useAccounts();
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<OpeningStockBatch[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }
  const detailBatch = batches.find((b) => b.id === selectedId);

  const handleFormSubmit = async (data: CreateOpeningStockBatchDTO | UpdateOpeningStockBatchDTO) => {
    if (dialog?.mode === 'edit') {
      await updateBatch(dialog.batch.id, data as UpdateOpeningStockBatchDTO);
    } else {
      const created = await createBatch(data as CreateOpeningStockBatchDTO);
      openRecord(created.id);
    }
    setDialog(null);
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
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
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
            onSelect={(b) => openRecord(b.id)}
            onDelete={canDelete ? (b) => void handleDelete(b) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <OpeningStockBatchDetailSheet
        batch={detailBatch}
        products={products}
        warehouses={warehouses}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        canManage={canUpdate}
        onEdit={(b) => setDialog({ mode: 'edit', batch: b })}
        onConfirm={(b) => confirmBatch(b.id).then(() => undefined)}
        onCancel={(b) => cancelBatch(b.id).then(() => undefined)}
        loadPreview={previewAccountingEffect}
      />

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <OpeningStockBatchDocumentFormModal
          batch={dialog.mode === 'edit' ? dialog.batch : undefined}
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
