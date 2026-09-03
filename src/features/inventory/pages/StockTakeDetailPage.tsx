import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import {
  RecordActionBar,
  RecordActivitySection,
  RecordPageHeader,
  RecordPageShell,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatDate } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useStockTakes } from '../hooks/useStockTakes';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProductCategories } from '../hooks/useProductCategories';
import { useAccountingEffectPreview } from '../hooks/useAccountingEffectPreview';
import { StockTakeDetail } from '../components/StockTakeDetail';
import { StockTakeCountSheetExport } from '../components/StockTakeCountSheetExport';
import { StockTakeSetupFormModal } from '../components/StockTakeSetupFormModal';
import type { UpdateStockTakeDTO } from '../services/stockTakeService';

/**
 * Full-page Stock Take detail — route `/inventory/stock-takes/:stockTakeId`.
 * Warehouse, count date, the expected/counted/variance count sheet (edited
 * in place while counting), the net-variance journal preview and the
 * adjustment it posts. Same stockTakeService.freeze()/enterCounts()/
 * markReadyForReview()/postStockTake() calls — counting logic unchanged.
 */
export function StockTakeDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ stockTakeId: string }>();
  const stockTakeId = recordId ?? params.stockTakeId;
  const navigate = useNavigate();

  const {
    stockTakes, loading, error,
    updateStockTake, freeze, enterCounts, markReadyForReview, postStockTake, cancelStockTake,
    previewPostEffect,
  } = useStockTakes();
  const stockTake = stockTakes.find((s) => s.id === stockTakeId);
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { categories } = useProductCategories();
  const { accounts } = useAccounts();
  const canManage = useCanAccess('inventory', 'update');
  const canExport = useCanAccess('inventory', 'export');

  const needsPreview = stockTake?.status === 'ready_for_review' || stockTake?.status === 'posted';
  const loader = useMemo(() => (needsPreview ? previewPostEffect : undefined), [needsPreview, previewPostEffect]);
  const { preview, previewLoading, previewError } = useAccountingEffectPreview(loader, stockTake?.id);

  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const state = loading ? 'loading' : error ? 'error' : stockTake ? 'ready' : 'not-found';

  const primary = stockTake
    ? stockTake.status === 'draft'
      ? { label: 'Freeze count sheet', onClick: () => void run(() => freeze(stockTake.id)) }
      : stockTake.status === 'counting'
        ? { label: 'Mark ready for review', onClick: () => void run(() => markReadyForReview(stockTake.id)) }
        : stockTake.status === 'ready_for_review'
          ? { label: 'Post', onClick: () => void run(() => postStockTake(stockTake.id)) }
          : undefined
    : undefined;

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Stock takes', to: '/inventory/stock-takes' }, { label: stockTake?.stockTakeNumber ?? 'Stock take' }]}
      backTo="/inventory/stock-takes"
      backLabel="Stock takes"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This stock take could not be found — it may have been deleted."
    >
      {stockTake && (
        <>
          <RecordPageHeader
            recordNumber={stockTake.stockTakeNumber}
            title={warehouseName(stockTake.warehouseId)}
            meta={`Count date ${formatDate(stockTake.countDate)}${stockTake.frozenAt ? ` · frozen ${formatDate(stockTake.frozenAt)}` : ''}`}
            status={<StatusBadge status={stockTake.status} />}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <StockTakeCountSheetExport stockTake={stockTake} products={products} warehouses={warehouses} allowed={canExport} />
                {canManage && (
                  <RecordActionBar
                    busy={busy}
                    primary={primary}
                    secondary={stockTake.status === 'draft' ? [{ label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) }] : []}
                    danger={stockTake.status !== 'posted' && stockTake.status !== 'cancelled' ? [{ label: 'Cancel stock take', onClick: () => setConfirmCancel(true) }] : []}
                  />
                )}
              </div>
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <StockTakeDetail
            stockTake={stockTake}
            products={products}
            warehouses={warehouses}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onSaveCounts={canManage && stockTake.status === 'counting' ? (counts) => run(() => enterCounts(stockTake.id, counts)) : undefined}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />

          <RecordActivitySection recordType="StockTake" recordId={stockTake.id} title="Record activity" subtitle="Changes and lifecycle events for this stock take." />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${stockTake.stockTakeNumber}?`}
            description="This cancels the stock take before it posts. This cannot be undone."
            confirmLabel="Cancel stock take"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void run(() => cancelStockTake(stockTake.id));
            }}
          />

          {editing && (
            <StockTakeSetupFormModal
              stockTake={stockTake}
              warehouses={warehouses}
              categories={categories}
              onSubmit={async (data) => {
                await updateStockTake(stockTake.id, data as UpdateStockTakeDTO);
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
