import type { CustomerReceipt } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { receiptAllocationState } from '../utils/receiptAllocationState';

const METHOD_LABELS: Record<string, string> = {
  eft: 'EFT',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

interface CustomerReceiptDetailProps {
  receipt: CustomerReceipt;
  customerName: string;
  /** invoiceId -> invoice number, for rendering allocation history. */
  invoiceNumbers: Map<string, string>;
  onBack?: () => void;
  onAllocate?: () => void;
  isBusy?: boolean;
}

/**
 * Customer receipt detail — re-skinned onto v0's PageHeader/SectionCard,
 * same action gating as before the port: Allocate only while there is an
 * unallocated balance. There is no delete/void/reverse action here —
 * CustomerReceiptService has no such method (recording a receipt posts it
 * immediately; see the M4 report).
 */
export function CustomerReceiptDetail({ receipt, customerName, invoiceNumbers, onBack, onAllocate, isBusy = false }: CustomerReceiptDetailProps) {
  const canAllocate = receipt.unallocatedAmount > 0.01;
  const allocated = receipt.amount - receipt.unallocatedAmount;

  return (
    <>
      <PageHeader
        title={receipt.receiptNumber}
        description={`${customerName} · ${METHOD_LABELS[receipt.method] ?? receipt.method}`}
        actions={
          <>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {onAllocate && canAllocate && (
              <Button size="sm" disabled={isBusy} onClick={onAllocate}>
                Allocate to invoice
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={receiptAllocationState(receipt)} />
      </div>

      <SectionCard title="Received from" description={customerName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Date received</div>
            <div className="text-sm font-medium">{formatDate(receipt.date)}</div>
          </div>
          {receipt.reference && (
            <div>
              <div className="text-xs tracking-wide text-muted-foreground uppercase">Reference</div>
              <div className="text-sm font-medium">{receipt.reference}</div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Amounts">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FigureBlock label="Amount received" value={formatCurrency(receipt.amount)} tone="positive" />
          <FigureBlock label="Allocated" value={formatCurrency(allocated)} />
          <FigureBlock label="On account" value={formatCurrency(receipt.unallocatedAmount)} tone={receipt.unallocatedAmount > 0 ? 'warning' : 'default'} />
        </div>
      </SectionCard>

      <SectionCard title="Allocations">
        {receipt.allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No allocations yet — this receipt is entirely on account.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {receipt.allocations.map((a, i) => (
              <div key={i} className="flex justify-between border-b border-border/50 py-1 text-sm">
                <span className="text-muted-foreground">{invoiceNumbers.get(a.invoiceId) || a.invoiceId}</span>
                <span>{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {receipt.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{receipt.notes}</p>
        </SectionCard>
      )}
    </>
  );
}
