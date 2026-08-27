import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { Bill } from '@/types';

export interface BillDetailProps {
  bill: Bill;
  suppliersMap?: Record<string, string>;
  onClose?: () => void;
  /** Posts the bill to the GL via billService.postBill() — draft only. */
  onPost?: (billId: string) => void;
  onRecordPayment?: (billId: string) => void;
}

/**
 * Supplier bill detail — re-skinned onto v0's PageHeader/SectionCard (M8),
 * same action gating as before the port: Post only while draft, Record
 * Payment only once posted with an outstanding balance. No delete/void
 * action here — matches BillService's own real capabilities (a posted
 * bill has no void/reverse method). Line-items table uses the same flush
 * (bodyClassName="p-0") raw-table treatment as InvoiceDetail/QuoteDetail/
 * SalesOrderDetail/CreditNoteDetail, not the shadcn Table wrapped in its
 * own bordered box — that double-bordered it inside the already-bordered
 * SectionCard (Phase 4 audit fix).
 */
export function BillDetail({ bill, suppliersMap = {}, onClose, onPost, onRecordPayment }: BillDetailProps) {
  const outstandingAmount = bill.total - bill.amountPaid;
  const supplierName = suppliersMap[bill.supplierId] ?? bill.supplierId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={bill.billNumber}
        description={supplierName}
        actions={
          <>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Back
              </Button>
            )}
            {onPost && bill.status === 'draft' && (
              <Button size="sm" onClick={() => onPost(bill.id)}>
                Post Bill
              </Button>
            )}
            {onRecordPayment && bill.status !== 'draft' && bill.status !== 'void' && outstandingAmount > 0 && (
              <Button size="sm" onClick={() => onRecordPayment(bill.id)}>
                Record Payment
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={bill.status} />
      </div>

      <SectionCard title="Bill from" description={supplierName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Bill date</div>
            <div className="text-sm font-medium">{formatDate(bill.issueDate)}</div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Due date</div>
            <div className="text-sm font-medium">{formatDate(bill.dueDate)}</div>
          </div>
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
              {bill.lineItems.map((item) => (
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
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(bill.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={5} className="px-4 py-2 text-right text-sm text-muted-foreground">VAT (Input)</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(bill.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-status-positive-muted">
                <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total due</td>
                <td className="px-4 py-2 text-right text-base font-bold text-positive">{formatCurrency(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Payment status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FigureBlock label="Amount paid" value={formatCurrency(bill.amountPaid)} tone="positive" />
          <FigureBlock label="Outstanding" value={formatCurrency(outstandingAmount)} tone={outstandingAmount > 0 ? 'warning' : 'default'} />
        </div>
      </SectionCard>

      {bill.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{bill.notes}</p>
        </SectionCard>
      )}
    </div>
  );
}
