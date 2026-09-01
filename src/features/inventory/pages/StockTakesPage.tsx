import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockTake } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useStockTakes } from '../hooks/useStockTakes';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProductCategories } from '../hooks/useProductCategories';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { StockTakesTable } from '../components/StockTakesTable';
import { StockTakeDetailSheet } from '../components/StockTakeDetailSheet';
import { StockTakeSetupFormModal } from '../components/StockTakeSetupFormModal';
import type { CreateStockTakeDTO, UpdateStockTakeDTO } from '../services/stockTakeService';

type DialogState = { mode: 'create' } | { mode: 'edit'; stockTake: StockTake } | null;

/**
 * Stock Take register — route `/inventory/stock-takes` (Phase 5 §3).
 * Draft → counting → ready_for_review → posted lifecycle over
 * `stockTakeService`, mirroring `StockAdjustmentsPage`'s shape.
 */
export function StockTakesPage() {
  const {
    stockTakes,
    loading,
    error,
    refetch,
    createStockTake,
    updateStockTake,
    deleteStockTake,
    freeze,
    enterCounts,
    markReadyForReview,
    postStockTake,
    cancelStockTake,
    previewPostEffect,
  } = useStockTakes();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { categories } = useProductCategories();
  const { accounts } = useAccounts();
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  const detailStockTake = stockTakes.find((s) => s.id === selectedId);

  const handleFormSubmit = async (data: CreateStockTakeDTO | UpdateStockTakeDTO) => {
    if (dialog?.mode === 'edit') {
      await updateStockTake(dialog.stockTake.id, data as UpdateStockTakeDTO);
    } else {
      const created = await createStockTake(data as CreateStockTakeDTO);
      openRecord(created.id);
    }
    setDialog(null);
  };

  const handleDelete = async (stockTake: StockTake) => {
    if (!window.confirm(`Delete draft stock take "${stockTake.stockTakeNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteStockTake(stockTake.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the stock take.');
    }
  };

  const busy = loading || productsLoading || warehousesLoading;
  const activeCount = stockTakes.filter((s) => s.status === 'counting' || s.status === 'ready_for_review').length;
  const draftCount = stockTakes.filter((s) => s.status === 'draft').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock takes"
        description="Physical counts — freeze a scope, count against it, and post the net variance to the general ledger."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New stock take
            </Button>
          ) : undefined
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
          <FigureBlock label="In progress" value={String(activeCount)} hint="Counting or ready for review" />
        </div>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading stock takes…</p>
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
        <SectionCard title="Stock take register" description="Every physical count, its scope and its net variance.">
          <StockTakesTable
            stockTakes={stockTakes}
            warehouses={warehouses}
            onSelect={(s) => openRecord(s.id)}
            onDelete={canDelete ? (s) => void handleDelete(s) : undefined}
          />
        </SectionCard>
      )}

      <StockTakeDetailSheet
        stockTake={detailStockTake}
        products={products}
        warehouses={warehouses}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        canManage={canUpdate}
        canExport={canExport}
        onEdit={(s) => setDialog({ mode: 'edit', stockTake: s })}
        onFreeze={(s) => freeze(s.id).then(() => undefined)}
        onSaveCounts={(s, counts) => enterCounts(s.id, counts).then(() => undefined)}
        onMarkReadyForReview={(s) => markReadyForReview(s.id).then(() => undefined)}
        onPost={(s) => postStockTake(s.id).then(() => undefined)}
        onCancel={(s) => cancelStockTake(s.id).then(() => undefined)}
        loadPreview={previewPostEffect}
      />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <StockTakeSetupFormModal
          stockTake={dialog.mode === 'edit' ? dialog.stockTake : undefined}
          warehouses={warehouses}
          categories={categories}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
