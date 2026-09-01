import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Account, Product, Supplier, SupplierReturn, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { SupplierReturnDetail } from './SupplierReturnDetail';

export interface SupplierReturnDetailSheetProps {
  supplierReturn: SupplierReturn | undefined;
  products: Product[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the whole action bar (edit/post/cancel) — false renders a read-only view. */
  canManage: boolean;
  onEdit: (supplierReturn: SupplierReturn) => void;
  onPost: (supplierReturn: SupplierReturn) => Promise<void>;
  onCancel: (supplierReturn: SupplierReturn) => Promise<void>;
  loadPreview: (id: string) => Promise<AccountingEffectPreview>;
}

/**
 * Draft-through-posted review surface for one supplier return — mirrors
 * `StockAdjustmentDetailSheet`'s shape. The Purchase Price Variance
 * preview line renders even at R0.00 (`supplierReturnService.
 * buildReturnLines()` never omits it), so an approver always sees the
 * gap between carrying value and the supplier's actual credit.
 */
export function SupplierReturnDetailSheet({
  supplierReturn,
  products,
  warehouses,
  suppliers,
  accounts,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onPost,
  onCancel,
  loadPreview,
}: SupplierReturnDetailSheetProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !supplierReturn) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loadPreview(supplierReturn.id)
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
  }, [open, supplierReturn, loadPreview]);

  async function run(action: (r: SupplierReturn) => Promise<void>) {
    if (!supplierReturn) return;
    setActionError(null);
    setBusy(true);
    try {
      await action(supplierReturn);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const state = supplierReturn ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={supplierReturn?.returnNumber ?? 'Supplier return'}
      titleAdornment={supplierReturn ? <StatusBadge status={supplierReturn.status} /> : undefined}
      state={state}
      notFoundMessage="This supplier return could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        supplierReturn &&
        canManage &&
        supplierReturn.status === 'draft' && (
          <div className="flex flex-wrap items-center gap-2">
            {actionError && <p role="alert" className="w-full text-sm text-destructive">{actionError}</p>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(supplierReturn)}>
              Edit
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void run((r) => onPost(r))}>
              Post
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run((r) => onCancel(r))}>
              Cancel
            </Button>
          </div>
        )
      }
    >
      {supplierReturn && (
        <div className="flex flex-col gap-6">
          <SupplierReturnDetail
            supplierReturn={supplierReturn}
            products={products}
            warehouses={warehouses}
            suppliers={suppliers}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />
          <RecordAuditHistorySection recordType="SupplierReturn" recordId={supplierReturn.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
