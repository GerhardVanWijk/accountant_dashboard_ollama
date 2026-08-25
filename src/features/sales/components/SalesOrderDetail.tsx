import type { SalesOrder } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/shadcn/alert-dialog';
import { formatCurrency, formatDate } from '@/lib/app/format';

interface SalesOrderDetailProps {
  salesOrder: SalesOrder;
  customerName: string;
  quoteNumber?: string;
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onConfirmOrder?: (id: string) => void;
  onCancelOrder?: (id: string) => void;
  onConvertToInvoice?: (id: string) => void;
  isBusy?: boolean;
}

/**
 * Sales Order detail — re-skinned onto v0's PageHeader/SectionCard (M13),
 * mirrors InvoiceDetail.tsx/QuoteDetail.tsx's shape. Action gating
 * unchanged from before the port: Confirm only from pending; Cancel unless
 * already fulfilled/cancelled; Convert to Invoice unless already
 * cancelled/fulfilled. Adds a "Delete draft" action wired to the existing
 * salesOrderService.deleteSalesOrder() guard (pending-only, already
 * supported by the service but never surfaced by the old detail page),
 * matching InvoiceDetail's/QuoteDetail's equivalent action.
 */
export function SalesOrderDetail({
  salesOrder,
  customerName,
  quoteNumber,
  onBack,
  onEdit,
  onDelete,
  onConfirmOrder,
  onCancelOrder,
  onConvertToInvoice,
  isBusy = false,
}: SalesOrderDetailProps) {
  const canConfirm = salesOrder.status === 'pending';
  const canCancel = salesOrder.status !== 'fulfilled' && salesOrder.status !== 'cancelled';
  const canConvert = salesOrder.status !== 'cancelled' && salesOrder.status !== 'fulfilled';

  return (
    <>
      <PageHeader
        title={salesOrder.orderNumber}
        description={quoteNumber ? `${customerName} — Sales Order (from quote ${quoteNumber})` : `${customerName} — Sales Order`}
        actions={
          <>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {onEdit && salesOrder.status === 'pending' && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onDelete && salesOrder.status === 'pending' && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={isBusy} />}>
                  Delete draft
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {salesOrder.orderNumber}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the pending sales order. This cannot be undone. Once confirmed or
                      fulfilled, it is a real business commitment and must be cancelled instead of deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                      onClick={onDelete}
                    >
                      Delete draft
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {onCancelOrder && canCancel && (
              <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => onCancelOrder(salesOrder.id)}>
                Cancel order
              </Button>
            )}
            {onConfirmOrder && canConfirm && (
              <Button size="sm" disabled={isBusy} onClick={() => onConfirmOrder(salesOrder.id)}>
                Confirm order
              </Button>
            )}
            {onConvertToInvoice && canConvert && (
              <Button size="sm" disabled={isBusy} onClick={() => onConvertToInvoice(salesOrder.id)}>
                Convert to invoice
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={salesOrder.status} />
      </div>

      <SectionCard title="Ordered by" description={customerName}>
        <div>
          <div className="text-xs tracking-wide text-muted-foreground uppercase">Order date</div>
          <div className="text-sm font-medium">{formatDate(salesOrder.orderDate)}</div>
        </div>
      </SectionCard>

      <SectionCard title="Line items" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Unit price</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Tax</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {salesOrder.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{item.quantity.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.taxAmount)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Subtotal</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(salesOrder.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Tax/VAT</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(salesOrder.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-positive/10">
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total</td>
                <td className="px-4 py-2 text-right text-base font-bold text-positive">{formatCurrency(salesOrder.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {salesOrder.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{salesOrder.notes}</p>
        </SectionCard>
      )}
    </>
  );
}
