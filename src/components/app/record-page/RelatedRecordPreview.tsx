import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/shadcn/dialog';
import type { RecordPageProps } from './recordPageProps';
import type { RelatedRecordType } from './sourceDocument';

/**
 * Every previewable record type → its existing full-page detail component,
 * loaded lazily so opening a product page does not pull in eleven document
 * pages. Each component already accepts `{ recordId, embedded }`
 * (RecordPageProps) — there is deliberately no second renderer here.
 */
const REGISTRY: Record<RelatedRecordType, LazyExoticComponent<ComponentType<RecordPageProps>>> = {
  invoice: lazy(() => import('@/features/sales/pages/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage }))),
  credit_note: lazy(() => import('@/features/sales/pages/CreditNoteDetailPage').then((m) => ({ default: m.CreditNoteDetailPage }))),
  sales_order: lazy(() => import('@/features/sales/pages/SalesOrderDetailPage').then((m) => ({ default: m.SalesOrderDetailPage }))),
  quote: lazy(() => import('@/features/sales/pages/QuoteDetailPage').then((m) => ({ default: m.QuoteDetailPage }))),
  bill: lazy(() => import('@/features/purchases/pages/BillDetailPage').then((m) => ({ default: m.BillDetailPage }))),
  purchase_order: lazy(() => import('@/features/purchases/pages/PurchaseOrderDetailPage').then((m) => ({ default: m.PurchaseOrderDetailPage }))),
  supplier_return: lazy(() => import('@/features/inventory/pages/SupplierReturnDetailPage').then((m) => ({ default: m.SupplierReturnDetailPage }))),
  stock_transfer: lazy(() => import('@/features/inventory/pages/StockTransferDetailPage').then((m) => ({ default: m.StockTransferDetailPage }))),
  stock_adjustment: lazy(() => import('@/features/inventory/pages/StockAdjustmentDetailPage').then((m) => ({ default: m.StockAdjustmentDetailPage }))),
  stock_take: lazy(() => import('@/features/inventory/pages/StockTakeDetailPage').then((m) => ({ default: m.StockTakeDetailPage }))),
  opening_stock_batch: lazy(() => import('@/features/inventory/pages/OpeningStockBatchDetailPage').then((m) => ({ default: m.OpeningStockBatchDetailPage }))),
};

/** `true` when a given record type can be shown in the preview overlay. */
function canPreviewRecord(type: RelatedRecordType | undefined): type is RelatedRecordType {
  return Boolean(type && type in REGISTRY);
}

export interface RelatedRecordPreviewProps {
  open: boolean;
  onClose: () => void;
  type: RelatedRecordType | undefined;
  id: string | undefined;
  /** Accessible dialog title while the page chunk loads (e.g. "Invoice INV-1072"). */
  title?: string;
}

/**
 * A large, wide document overlay rendered OVER the current record page.
 * Desktop: a centred panel up to `5xl`. Mobile: near-full-screen (the
 * shared DialogContent already caps to the viewport with a 1rem margin and
 * scrolls internally). Closing returns to the exact page + scroll position
 * underneath — the page never unmounts.
 *
 * If `type` is not previewable the dialog simply never opens; the caller is
 * expected to fall back to a normal canonical link in that case.
 */
export function RelatedRecordPreview({ open, onClose, type, id, title }: RelatedRecordPreviewProps) {
  const Component = canPreviewRecord(type) ? REGISTRY[type] : undefined;
  const isOpen = open && Boolean(Component) && Boolean(id);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100%-2rem)] sm:max-w-5xl">
        <DialogTitle className="sr-only">{title ?? 'Document preview'}</DialogTitle>
        {Component && id && (
          <Suspense
            fallback={
              <div role="status" className="flex items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                Loading document…
              </div>
            }
          >
            <Component recordId={id} embedded />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
