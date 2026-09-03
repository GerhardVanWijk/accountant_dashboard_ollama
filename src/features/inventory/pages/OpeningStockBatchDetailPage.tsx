import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import {
  RecordActionBar,
  RecordActivitySection,
  RecordPageHeader,
  RecordPageShell,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatDate } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccountingEffectPreview } from '../hooks/useAccountingEffectPreview';
import { OpeningStockBatchDetail } from '../components/OpeningStockBatchDetail';
import { OpeningStockBatchDocumentFormModal } from '../components/OpeningStockBatchDocumentFormModal';
import type { UpdateOpeningStockBatchDTO } from '../services/openingStockBatchService';

/**
 * Full-page Opening Stock batch detail — route
 * `/inventory/opening-stock/:batchId`. Warehouse, effective date, lines at
 * cost and the confirming journal preview. Opening stock keeps its
 * deliberate explicit-confirmation gesture — the "I confirm this opening
 * balance is accurate" checkbox must be ticked before Confirm enables,
 * matching openingStockBatchService.confirmBatch()'s contract.
 */
export function OpeningStockBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const {
    batches, loading, error,
    updateBatch, confirmBatch, cancelBatch, previewAccountingEffect,
  } = useOpeningStockBatches();
  const batch = batches.find((b) => b.id === batchId);
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { accounts } = useAccounts();
  const canManage = useCanAccess('inventory', 'update');

  const { preview, previewLoading, previewError } = useAccountingEffectPreview(previewAccountingEffect, batch?.id);

  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
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
  const state = loading ? 'loading' : error ? 'error' : batch ? 'ready' : 'not-found';
  const isDraft = batch?.status === 'draft';

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Opening stock', to: '/inventory/opening-stock' }, { label: batch?.batchNumber ?? 'Opening stock batch' }]}
      backTo="/inventory/opening-stock"
      backLabel="Opening stock"
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This opening stock batch could not be found — it may have been deleted."
    >
      {batch && (
        <>
          <RecordPageHeader
            recordNumber={batch.batchNumber}
            title={warehouseName(batch.warehouseId)}
            meta={`Effective ${formatDate(batch.effectiveDate)} · ${batch.lineItems.length} line${batch.lineItems.length === 1 ? '' : 's'}`}
            status={<StatusBadge status={batch.status} />}
            actions={
              canManage && isDraft ? (
                <RecordActionBar
                  busy={busy}
                  primary={{ label: 'Confirm', disabled: !confirmChecked, onClick: () => void run(() => confirmBatch(batch.id)) }}
                  secondary={[{ label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) }]}
                  danger={[{ label: 'Cancel batch', onClick: () => setConfirmCancel(true) }]}
                />
              ) : undefined
            }
          />

          {canManage && isDraft && (
            <label className="flex w-fit items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="accent-primary" />
              I confirm this opening balance is accurate and ready to post.
            </label>
          )}

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <OpeningStockBatchDetail
            batch={batch}
            products={products}
            warehouses={warehouses}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />

          <RecordActivitySection recordType="OpeningStockBatch" recordId={batch.id} title="Record activity" subtitle="Changes and lifecycle events for this opening stock batch." />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${batch.batchNumber}?`}
            description="This cancels the opening stock batch before it posts. This cannot be undone."
            confirmLabel="Cancel batch"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void run(() => cancelBatch(batch.id));
            }}
          />

          {editing && (
            <OpeningStockBatchDocumentFormModal
              batch={batch}
              products={products}
              warehouses={warehouses}
              onSubmit={async (data) => {
                await updateBatch(batch.id, data as UpdateOpeningStockBatchDTO);
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
