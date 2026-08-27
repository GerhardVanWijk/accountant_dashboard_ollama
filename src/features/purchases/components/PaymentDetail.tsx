import type { Payment } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';

const METHOD_LABELS: Record<string, string> = { eft: 'EFT', cash: 'Cash', card: 'Card', cheque: 'Cheque', other: 'Other' };

export interface PaymentDetailProps {
  payment: Payment;
  supplierName: string;
}

/**
 * New — no PaymentDetail content existed before this pass ("no detail
 * route: a posted Payment has no further status transitions to drill
 * into" was true of ACTIONS, but the record itself still has real content
 * worth viewing). Payment has no status field (recording one posts
 * immediately, same as CustomerReceipt — see that type's own doc
 * comment), so there is no StatusBadge/action-gating here, unlike
 * Bill/PurchaseOrder detail.
 */
export function PaymentDetail({ payment, supplierName }: PaymentDetailProps) {
  return (
    <SectionCard title="Payment details" description={supplierName}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FigureBlock label="Amount" value={formatCurrency(payment.amount)} tone="positive" />
        <FigureBlock label="Unallocated" value={formatCurrency(payment.unallocatedAmount)} tone={payment.unallocatedAmount > 0 ? 'warning' : 'default'} />
        <FigureBlock label="Date" value={formatDate(payment.date)} />
        <FigureBlock label="Method" value={METHOD_LABELS[payment.method] ?? payment.method} />
        {payment.reference && <FigureBlock label="Reference" value={payment.reference} />}
      </div>
      {payment.notes && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{payment.notes}</p>
        </div>
      )}
    </SectionCard>
  );
}
