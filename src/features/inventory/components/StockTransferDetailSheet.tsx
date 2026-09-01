import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Account, Product, StockTransfer, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { StockTransferDetail } from './StockTransferDetail';

export interface StockTransferDetailSheetProps {
  transfer: StockTransfer | undefined;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the whole action bar (dispatch/receive/complete/cancel) — false renders a read-only view. */
  canManage: boolean;
  onEdit: (transfer: StockTransfer) => void;
  onDispatch: (transfer: StockTransfer) => Promise<void>;
  onReceive: (transfer: StockTransfer) => Promise<void>;
  onCompleteImmediate: (transfer: StockTransfer) => Promise<void>;
  onCancel: (transfer: StockTransfer) => Promise<void>;
  loadDispatchPreview: (id: string) => Promise<AccountingEffectPreview>;
  loadReceivePreview: (id: string) => Promise<AccountingEffectPreview>;
}

const PREVIEW_LABEL: Record<string, string> = {
  draft: 'What dispatching this transfer would post — the in-transit reclassification, not the final cost effect (unchanged company-wide).',
  in_transit: 'What receiving this transfer would post — the reverse of the dispatch leg, closing out the in-transit account.',
  completed: 'Completed — no further posting will occur.',
  cancelled: 'Cancelled — no posting will occur.',
};

/**
 * Draft-through-completed review surface for one stock transfer. Two
 * distinct paths exist from `draft`: dispatch into `in_transit` (posts a
 * GL reclassification leg now, a second on receipt) or complete
 * immediately (GL-neutral, no journal at all) —
 * `stockTransferService`'s own two lifecycle branches, not a UI choice
 * layered on top.
 */
export function StockTransferDetailSheet({
  transfer,
  products,
  warehouses,
  accounts,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onDispatch,
  onReceive,
  onCompleteImmediate,
  onCancel,
  loadDispatchPreview,
  loadReceivePreview,
}: StockTransferDetailSheetProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loader = useMemo(() => {
    if (!transfer) return undefined;
    if (transfer.status === 'draft') return loadDispatchPreview;
    if (transfer.status === 'in_transit') return loadReceivePreview;
    return undefined;
  }, [transfer, loadDispatchPreview, loadReceivePreview]);

  useEffect(() => {
    if (!open || !transfer || !loader) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loader(transfer.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to calculate the accounting effect.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, transfer, loader]);

  async function run(action: (t: StockTransfer) => Promise<void>) {
    if (!transfer) return;
    setActionError(null);
    setBusy(true);
    try {
      await action(transfer);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const state = transfer ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transfer?.transferNumber ?? 'Stock transfer'}
      titleAdornment={transfer ? <StatusBadge status={transfer.status} /> : undefined}
      state={state}
      notFoundMessage="This stock transfer could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        transfer &&
        canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {actionError && <p role="alert" className="w-full text-sm text-destructive">{actionError}</p>}
            {transfer.status === 'draft' && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(transfer)}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run((t) => onDispatch(t))}>
                  Dispatch
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void run((t) => onCompleteImmediate(t))}>
                  Complete now
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((t) => onCancel(t))}>
                  Cancel
                </Button>
              </>
            )}
            {transfer.status === 'in_transit' && (
              <>
                <Button size="sm" disabled={busy} onClick={() => void run((t) => onReceive(t))}>
                  Receive
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((t) => onCancel(t))}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        )
      }
    >
      {transfer && (
        <div className="flex flex-col gap-6">
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
          <RecordAuditHistorySection recordType="StockTransfer" recordId={transfer.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
