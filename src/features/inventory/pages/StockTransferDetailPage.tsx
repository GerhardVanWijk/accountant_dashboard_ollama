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
import { useStockTransfers } from '../hooks/useStockTransfers';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccountingEffectPreview } from '../hooks/useAccountingEffectPreview';
import { StockTransferDetail } from '../components/StockTransferDetail';
import { StockTransferDocumentFormModal } from '../components/StockTransferDocumentFormModal';
import type { UpdateStockTransferDTO } from '../services/stockTransferService';

const PREVIEW_LABEL: Record<string, string> = {
  draft: 'What dispatching this transfer would post — the in-transit reclassification, not the final cost effect (unchanged company-wide).',
  in_transit: 'What receiving this transfer would post — the reverse of the dispatch leg, closing out the in-transit account.',
  completed: 'Completed — no further posting will occur.',
  cancelled: 'Cancelled — no posting will occur.',
};

/**
 * Full-page Stock Transfer detail — route
 * `/inventory/transfers/:transferId`. From warehouse / to warehouse,
 * dispatch/receive state, lines at WAC, the in-transit reclassification
 * journal preview and both posted journal entries, all on the page width.
 * Same stockTransferService.dispatch()/receive()/completeImmediate() calls.
 */
export function StockTransferDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ transferId: string }>();
  const transferId = recordId ?? params.transferId;
  const navigate = useNavigate();

  const {
    transfers, loading, error,
    updateTransfer, dispatch, receive, completeImmediate, cancelTransfer,
    previewDispatchEffect, previewReceiveEffect,
  } = useStockTransfers();
  const transfer = transfers.find((t) => t.id === transferId);
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { accounts } = useAccounts();
  const canManage = useCanAccess('inventory', 'update');

  const loader = useMemo(() => {
    if (transfer?.status === 'draft') return previewDispatchEffect;
    if (transfer?.status === 'in_transit') return previewReceiveEffect;
    return undefined;
  }, [transfer?.status, previewDispatchEffect, previewReceiveEffect]);
  const { preview, previewLoading, previewError } = useAccountingEffectPreview(loader, transfer?.id);

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
  const state = loading ? 'loading' : error ? 'error' : transfer ? 'ready' : 'not-found';

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Stock transfers', to: '/inventory/transfers' }, { label: transfer?.transferNumber ?? 'Stock transfer' }]}
      backTo="/inventory/transfers"
      backLabel="Stock transfers"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This stock transfer could not be found — it may have been deleted."
    >
      {transfer && (
        <>
          <RecordPageHeader
            recordNumber={transfer.transferNumber}
            title={`${warehouseName(transfer.fromWarehouseId)} → ${warehouseName(transfer.toWarehouseId)}`}
            meta={`Transfer date ${formatDate(transfer.transferDate)}${transfer.receivedDate ? ` · received ${formatDate(transfer.receivedDate)}` : ''}`}
            status={<StatusBadge status={transfer.status} />}
            actions={
              canManage ? (
                <RecordActionBar
                  busy={busy}
                  primary={
                    transfer.status === 'draft'
                      ? { label: 'Complete now', onClick: () => void run(() => completeImmediate(transfer.id)) }
                      : transfer.status === 'in_transit'
                        ? { label: 'Receive', onClick: () => void run(() => receive(transfer.id)) }
                        : undefined
                  }
                  secondary={
                    transfer.status === 'draft'
                      ? [
                          { label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) },
                          { label: 'Dispatch', onClick: () => void run(() => dispatch(transfer.id)) },
                        ]
                      : []
                  }
                  danger={
                    transfer.status === 'draft' || transfer.status === 'in_transit'
                      ? [{ label: 'Cancel transfer', onClick: () => setConfirmCancel(true) }]
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

          <StockTransferDetail
            transfer={transfer}
            products={products}
            warehouses={warehouses}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            previewLabel={PREVIEW_LABEL[transfer.status] ?? ''}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />

          <RecordActivitySection recordType="StockTransfer" recordId={transfer.id} title="Record activity" subtitle="Changes and lifecycle events for this stock transfer." />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${transfer.transferNumber}?`}
            description="This cancels the transfer. Any in-transit reclassification is reversed. This cannot be undone."
            confirmLabel="Cancel transfer"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void run(() => cancelTransfer(transfer.id));
            }}
          />

          {editing && (
            <StockTransferDocumentFormModal
              transfer={transfer}
              products={products}
              warehouses={warehouses}
              onSubmit={async (data) => {
                await updateTransfer(transfer.id, data as UpdateStockTransferDTO);
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
