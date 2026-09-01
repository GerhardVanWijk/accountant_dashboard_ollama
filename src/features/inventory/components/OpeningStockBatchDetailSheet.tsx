import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Account, OpeningStockBatch, Product, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { OpeningStockBatchDetail } from './OpeningStockBatchDetail';

export interface OpeningStockBatchDetailSheetProps {
  batch: OpeningStockBatch | undefined;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the whole action bar (edit/confirm/cancel) — false renders a read-only view. */
  canManage: boolean;
  onEdit: (batch: OpeningStockBatch) => void;
  onConfirm: (batch: OpeningStockBatch) => Promise<void>;
  onCancel: (batch: OpeningStockBatch) => Promise<void>;
  loadPreview: (id: string) => Promise<AccountingEffectPreview>;
}

/**
 * Draft-through-confirmed review surface for one opening stock batch.
 * Opening stock is deliberately the one lifecycle in this module that
 * requires an EXPLICIT confirmation gesture beyond "click Post" — a
 * checkbox that must be ticked before Confirm enables — matching
 * `openingStockBatchService.confirmBatch()`'s `{ confirmed: true }`
 * contract (docs/INVENTORY_ACCOUNTING.md § "Opening stock batch").
 */
export function OpeningStockBatchDetailSheet({
  batch,
  products,
  warehouses,
  accounts,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onConfirm,
  onCancel,
  loadPreview,
}: OpeningStockBatchDetailSheetProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useEffect(() => {
    if (!open) setConfirmChecked(false);
  }, [open, batch?.id]);

  useEffect(() => {
    if (!open || !batch) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loadPreview(batch.id)
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
  }, [open, batch, loadPreview]);

  async function run(action: (b: OpeningStockBatch) => Promise<void>) {
    if (!batch) return;
    setActionError(null);
    setBusy(true);
    try {
      await action(batch);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const state = batch ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={batch?.batchNumber ?? 'Opening stock batch'}
      titleAdornment={batch ? <StatusBadge status={batch.status} /> : undefined}
      state={state}
      notFoundMessage="This opening stock batch could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        batch &&
        canManage &&
        batch.status === 'draft' && (
          <div className="flex flex-col gap-2">
            {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="accent-primary"
              />
              I confirm this opening balance is accurate and ready to post.
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(batch)}>
                Edit
              </Button>
              <Button size="sm" disabled={busy || !confirmChecked} onClick={() => void run((b) => onConfirm(b))}>
                Confirm
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((b) => onCancel(b))}>
                Cancel
              </Button>
            </div>
          </div>
        )
      }
    >
      {batch && (
        <div className="flex flex-col gap-6">
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
          <RecordAuditHistorySection recordType="OpeningStockBatch" recordId={batch.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
