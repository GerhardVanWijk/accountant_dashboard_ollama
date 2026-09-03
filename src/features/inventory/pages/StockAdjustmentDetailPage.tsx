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
import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccountingEffectPreview } from '../hooks/useAccountingEffectPreview';
import { StockAdjustmentDetail } from '../components/StockAdjustmentDetail';
import { StockAdjustmentDocumentFormModal } from '../components/StockAdjustmentDocumentFormModal';
import type { UpdateStockAdjustmentDTO } from '../services/stockAdjustmentService';

/**
 * Full-page Stock Adjustment detail — route
 * `/inventory/adjustments/:adjustmentId`. Replaces the ~450px sheet: the
 * lines table, the live `previewAccountingEffect()` journal preview and the
 * draft → pending_approval → posted action bar get the full page width.
 * Inventory posting/costing unchanged — same
 * stockAdjustmentService.postAdjustment()/approve()/reverse() calls.
 */
export function StockAdjustmentDetailPage() {
  const { adjustmentId } = useParams<{ adjustmentId: string }>();
  const navigate = useNavigate();

  const {
    adjustments, loading, error,
    updateAdjustment, submitForApproval, approve, postAdjustment, cancelAdjustment, reverseAdjustment,
    previewAccountingEffect,
  } = useStockAdjustments();
  const adjustment = adjustments.find((a) => a.id === adjustmentId);
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { accounts } = useAccounts();
  const canManage = useCanAccess('inventory', 'update');

  const { preview, previewLoading, previewError } = useAccountingEffectPreview(previewAccountingEffect, adjustment?.id);

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

  const state = loading ? 'loading' : error ? 'error' : adjustment ? 'ready' : 'not-found';

  const secondary = adjustment
    ? [
        ...(adjustment.status === 'draft' && canManage
          ? [
              { label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) },
              { label: 'Submit for approval', onClick: () => void run(() => submitForApproval(adjustment.id)) },
            ]
          : []),
        ...(adjustment.status === 'pending_approval' && canManage
          ? [{ label: 'Approve', onClick: () => void run(() => approve(adjustment.id)) }]
          : []),
        ...(adjustment.status === 'posted' && canManage
          ? [{ label: 'Reverse', onClick: () => void run(() => reverseAdjustment(adjustment.id, 'Reversed from the stock adjustment record page')) }]
          : []),
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Stock adjustments', to: '/inventory/adjustments' }, { label: adjustment?.adjustmentNumber ?? 'Stock adjustment' }]}
      backTo="/inventory/adjustments"
      backLabel="Stock adjustments"
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This stock adjustment could not be found — it may have been deleted."
    >
      {adjustment && (
        <>
          <RecordPageHeader
            recordNumber={adjustment.adjustmentNumber}
            title={adjustment.reason.replace(/_/g, ' ')}
            meta={`Adjustment date ${formatDate(adjustment.adjustmentDate)} · ${adjustment.lineItems.length} line${adjustment.lineItems.length === 1 ? '' : 's'}`}
            status={<StatusBadge status={adjustment.status} />}
            actions={
              canManage ? (
                <RecordActionBar
                  busy={busy}
                  primary={
                    (adjustment.status === 'draft' || adjustment.status === 'pending_approval')
                      ? { label: 'Post', onClick: () => void run(() => postAdjustment(adjustment.id)) }
                      : undefined
                  }
                  secondary={secondary}
                  danger={
                    adjustment.status === 'draft' || adjustment.status === 'pending_approval'
                      ? [{ label: 'Cancel adjustment', onClick: () => setConfirmCancel(true) }]
                      : []
                  }
                />
              ) : undefined
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <StockAdjustmentDetail
            adjustment={adjustment}
            products={products}
            warehouses={warehouses}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />

          <RecordActivitySection recordType="StockAdjustment" recordId={adjustment.id} title="Record activity" subtitle="Changes and lifecycle events for this stock adjustment." />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${adjustment.adjustmentNumber}?`}
            description="This cancels the adjustment before it posts. This cannot be undone."
            confirmLabel="Cancel adjustment"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void run(() => cancelAdjustment(adjustment.id));
            }}
          />

          {editing && (
            <StockAdjustmentDocumentFormModal
              adjustment={adjustment}
              products={products}
              warehouses={warehouses}
              onSubmit={async (data) => {
                await updateAdjustment(adjustment.id, data as UpdateStockAdjustmentDTO);
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
