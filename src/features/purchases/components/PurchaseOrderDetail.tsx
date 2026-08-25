import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/shadcn/table';
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
 * invented destructive action.
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

      <SectionCard title="Line items">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Gross Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.lineTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.taxAmount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(item.lineTotal + item.taxAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(purchaseOrder.subtotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={5} className="text-right">
                  VAT
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(purchaseOrder.taxTotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(purchaseOrder.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
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
