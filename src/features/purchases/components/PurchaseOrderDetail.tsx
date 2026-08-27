import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { PurchaseOrder } from '@/types';

export interface PurchaseOrderDetailProps {
  purchaseOrder: PurchaseOrder;
  suppliersMap?: Record<string, string>;
  onClose?: () => void;
  onSend?: (id: string) => void;
  onRecordReceipt?: (id: string) => void;
  onCancel?: (id: string) => void;
  onConvertToBill?: (id: string) => void;
  isBusy?: boolean;
}

/**
 * Purchase Order detail — re-skinned onto v0's PageHeader/SectionCard
 * (M8), same action gating and real PO→GRN→Bill workflow as before the
 * port. "Cancel Order" reflects PurchaseOrderService's real cancel path
 * (a status change, not a hard delete) — matches the real domain, not an
 * invented destructive action. Line-items table matches BillDetail's/
 * InvoiceDetail's flush (bodyClassName="p-0") raw-table treatment, not a
 * shadcn Table double-bordered inside the SectionCard (Phase 4 audit fix).
 */
export function PurchaseOrderDetail({ purchaseOrder, suppliersMap = {}, onClose, onSend, onRecordReceipt, onCancel, onConvertToBill, isBusy = false }: PurchaseOrderDetailProps) {
  const supplierName = suppliersMap[purchaseOrder.supplierId] ?? purchaseOrder.supplierId;
  const canSend = purchaseOrder.status === 'draft';
  const canReceive = purchaseOrder.status === 'sent' || purchaseOrder.status === 'partially_received';
  const canCancel = purchaseOrder.status !== 'received' && purchaseOrder.status !== 'cancelled';
  const canConvert = purchaseOrder.status !== 'draft' && purchaseOrder.status !== 'cancelled' && !purchaseOrder.billId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={purchaseOrder.poNumber}
        description={supplierName}
        actions={
          <>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Back
              </Button>
            )}
            {onCancel && canCancel && (
              <Button variant="outline" size="sm" className="text-destructive" disabled={isBusy} onClick={() => onCancel(purchaseOrder.id)}>
                Cancel Order
              </Button>
            )}
            {onSend && canSend && (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onSend(purchaseOrder.id)}>
                Send to Supplier
              </Button>
            )}
            {onRecordReceipt && canReceive && (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onRecordReceipt(purchaseOrder.id)}>
                Record Receipt
              </Button>
            )}
            {onConvertToBill && canConvert && (
              <Button size="sm" disabled={isBusy} onClick={() => onConvertToBill(purchaseOrder.id)}>
                Convert to Bill
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={purchaseOrder.status} />
      </div>

      <SectionCard title="Order from" description={supplierName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Order date</div>
            <div className="text-sm font-medium">{formatDate(purchaseOrder.orderDate)}</div>
          </div>
          {purchaseOrder.expectedDate && (
            <div>
              <div className="text-xs tracking-wide text-muted-foreground uppercase">Expected date</div>
              <div className="text-sm font-medium">{formatDate(purchaseOrder.expectedDate)}</div>
            </div>
          )}
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
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Line total</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">VAT</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Gross total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrder.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{item.quantity.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.lineTotal)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.taxAmount)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.lineTotal + item.taxAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td colSpan={5} className="px-4 py-2 text-right text-sm text-muted-foreground">Subtotal</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(purchaseOrder.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={5} className="px-4 py-2 text-right text-sm text-muted-foreground">VAT</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(purchaseOrder.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-positive/10">
                <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total</td>
                <td className="px-4 py-2 text-right text-base font-bold text-positive">{formatCurrency(purchaseOrder.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {purchaseOrder.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchaseOrder.notes}</p>
        </SectionCard>
      )}
    </div>
  );
}
