import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Account, Product, StockTake, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import type { StockTakeCountInput } from '../services/stockTakeService';
import { StockTakeDetail } from './StockTakeDetail';
import { StockTakeCountSheetExport } from './StockTakeCountSheetExport';

export interface StockTakeDetailSheetProps {
  stockTake: StockTake | undefined;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the whole action bar (freeze/mark ready/post/cancel) — false renders a read-only view. Counting stays read-only too: `onSaveCounts` is never called when false. */
  canManage: boolean;
  /** Gates the Print Count Sheet / Export Result controls (Phase 7) — independent of `canManage`: printing/exporting is a read action. */
  canExport: boolean;
  onEdit: (stockTake: StockTake) => void;
  onFreeze: (stockTake: StockTake) => Promise<void>;
  onSaveCounts: (stockTake: StockTake, counts: StockTakeCountInput[]) => Promise<void>;
  onMarkReadyForReview: (stockTake: StockTake) => Promise<void>;
  onPost: (stockTake: StockTake) => Promise<void>;
  onCancel: (stockTake: StockTake) => Promise<void>;
  loadPreview: (id: string) => Promise<AccountingEffectPreview>;
}

/**
 * Draft-through-posted review surface for one stock take. Counting is
 * in-place here (`StockTakeLinesView` renders editable inputs while
 * `status === 'counting'`) rather than a separate screen — a count sheet
 * is a single working document, not a wizard.
 */
export function StockTakeDetailSheet({
  stockTake,
  products,
  warehouses,
  accounts,
  open,
  onOpenChange,
  canManage,
  canExport,
  onEdit,
  onFreeze,
  onSaveCounts,
  onMarkReadyForReview,
  onPost,
  onCancel,
  loadPreview,
}: StockTakeDetailSheetProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsPreview = stockTake && (stockTake.status === 'ready_for_review' || stockTake.status === 'posted');

  useEffect(() => {
    if (!open || !stockTake || !needsPreview) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loadPreview(stockTake.id)
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
  }, [open, stockTake, needsPreview, loadPreview]);

  async function run(action: (s: StockTake) => Promise<void>) {
    if (!stockTake) return;
    setActionError(null);
    setBusy(true);
    try {
      await action(stockTake);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const state = stockTake ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={stockTake?.stockTakeNumber ?? 'Stock take'}
      titleAdornment={stockTake ? <StatusBadge status={stockTake.status} /> : undefined}
      state={state}
      notFoundMessage="This stock take could not be found — it may have been deleted."
      className="sm:max-w-2xl"
      actions={
        stockTake && (
          <div className="flex flex-wrap items-center gap-2">
            {actionError && <p role="alert" className="w-full text-sm text-destructive">{actionError}</p>}
            <StockTakeCountSheetExport stockTake={stockTake} products={products} warehouses={warehouses} allowed={canExport} />
            {canManage && (
              <>
                {stockTake.status === 'draft' && (
                  <>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(stockTake)}>
                      Edit
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void run((s) => onFreeze(s))}>
                      Freeze count sheet
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((s) => onCancel(s))}>
                      Cancel
                    </Button>
                  </>
                )}
                {stockTake.status === 'counting' && (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void run((s) => onMarkReadyForReview(s))}>
                      Mark ready for review
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((s) => onCancel(s))}>
                      Cancel
                    </Button>
                  </>
                )}
                {stockTake.status === 'ready_for_review' && (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void run((s) => onPost(s))}>
                      Post
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((s) => onCancel(s))}>
                      Cancel
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )
      }
    >
      {stockTake && (
        <div className="flex flex-col gap-6">
          <StockTakeDetail
            stockTake={stockTake}
            products={products}
            warehouses={warehouses}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onSaveCounts={canManage && stockTake.status === 'counting' ? (counts) => onSaveCounts(stockTake, counts) : undefined}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />
          <RecordAuditHistorySection recordType="StockTake" recordId={stockTake.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
