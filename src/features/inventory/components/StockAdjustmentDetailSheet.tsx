import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Account, Product, StockAdjustment, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { StockAdjustmentDetail } from './StockAdjustmentDetail';

export interface StockAdjustmentDetailSheetProps {
  adjustment: StockAdjustment | undefined;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the whole action bar (submit/approve/post/cancel/reverse) — false renders a read-only view. */
  canManage: boolean;
  onEdit: (adjustment: StockAdjustment) => void;
  onSubmitForApproval: (adjustment: StockAdjustment) => Promise<void>;
  onApprove: (adjustment: StockAdjustment) => Promise<void>;
  onPost: (adjustment: StockAdjustment) => Promise<void>;
  onCancel: (adjustment: StockAdjustment) => Promise<void>;
  onReverse: (adjustment: StockAdjustment) => Promise<void>;
  loadPreview: (id: string) => Promise<AccountingEffectPreview>;
}

/**
 * Draft-through-posted review surface for one stock adjustment — the
 * `previewAccountingEffect()` result renders in `AccountingPreview` (via
 * `StockAdjustmentDetail`) so whoever approves or posts sees the exact
 * journal entry that will result, built from the same line-building pass
 * that actually posts (stockAdjustmentService.buildLines()). Actions are
 * gated on `adjustment.status`, matching every other draft→posted
 * lifecycle in this codebase (fixed assets, bills).
 */
export function StockAdjustmentDetailSheet({
  adjustment,
  products,
  warehouses,
  accounts,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onSubmitForApproval,
  onApprove,
  onPost,
  onCancel,
  onReverse,
  loadPreview,
}: StockAdjustmentDetailSheetProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !adjustment) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loadPreview(adjustment.id)
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
  }, [open, adjustment, loadPreview]);

  async function run(action: (a: StockAdjustment) => Promise<void>) {
    if (!adjustment) return;
    setActionError(null);
    setBusy(true);
    try {
      await action(adjustment);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const state = adjustment ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={adjustment?.adjustmentNumber ?? 'Stock adjustment'}
      titleAdornment={adjustment ? <StatusBadge status={adjustment.status} /> : undefined}
      state={state}
      notFoundMessage="This stock adjustment could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        adjustment &&
        canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {actionError && <p role="alert" className="w-full text-sm text-destructive">{actionError}</p>}
            {adjustment.status === 'draft' && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(adjustment)}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run((a) => onSubmitForApproval(a))}>
                  Submit for approval
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void run((a) => onPost(a))}>
                  Post
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((a) => onCancel(a))}>
                  Cancel
                </Button>
              </>
            )}
            {adjustment.status === 'pending_approval' && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run((a) => onApprove(a))}>
                  Approve
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void run((a) => onPost(a))}>
                  Post
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((a) => onCancel(a))}>
                  Cancel
                </Button>
              </>
            )}
            {adjustment.status === 'posted' && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run((a) => onReverse(a))}>
                Reverse
              </Button>
            )}
          </div>
        )
      }
    >
      {adjustment && (
        <div className="flex flex-col gap-6">
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
          <RecordAuditHistorySection recordType="StockAdjustment" recordId={adjustment.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
