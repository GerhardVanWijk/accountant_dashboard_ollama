import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockTake } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { useStockTakes } from '../hooks/useStockTakes';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProductCategories } from '../hooks/useProductCategories';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { StockTakesTable } from '../components/StockTakesTable';
import { StockTakeSetupFormModal } from '../components/StockTakeSetupFormModal';
import type { CreateStockTakeDTO, UpdateStockTakeDTO } from '../services/stockTakeService';

/**
 * Stock Take register — route `/inventory/stock-takes`, the list only. A
 * row click navigates to the full-page record at
 * `/inventory/stock-takes/:stockTakeId` (StockTakeDetailPage); legacy
 * `?record=<id>` deep links are redirected there. Freeze / count / review /
 * post live on the record page.
 */
export function StockTakesPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/inventory/stock-takes');

  const { stockTakes, loading, error, refetch, createStockTake, deleteStockTake } = useStockTakes();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { categories } = useProductCategories();
  const canCreate = useCanAccess('inventory', 'create');
  const canDelete = useCanAccess('inventory', 'delete');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleFormSubmit = async (data: CreateStockTakeDTO | UpdateStockTakeDTO) => {
    const created = await createStockTake(data as CreateStockTakeDTO);
    setCreating(false);
    navigate(`/inventory/stock-takes/${created.id}`);
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

  const busy = loading || warehousesLoading;
  const activeCount = stockTakes.filter((s) => s.status === 'counting' || s.status === 'ready_for_review').length;
  const draftCount = stockTakes.filter((s) => s.status === 'draft').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock takes"
        description="Physical counts — freeze a scope, count against it, and post the net variance to the general ledger."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
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
            onSelect={(s) => navigate(`/inventory/stock-takes/${s.id}`)}
            onDelete={canDelete ? (s) => void handleDelete(s) : undefined}
          />
        </SectionCard>
      )}

      {creating && (
        <StockTakeSetupFormModal
          warehouses={warehouses}
          categories={categories}
          onSubmit={handleFormSubmit}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
