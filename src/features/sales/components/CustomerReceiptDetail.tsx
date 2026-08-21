import React from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Button } from '@/components/ui/Button';
import type { CustomerReceipt } from '@/types';

interface CustomerReceiptDetailProps {
  receipt: CustomerReceipt;
  customerName: string;
  /** invoiceId -> invoice number, for rendering allocation history. */
  invoiceNumbers: Map<string, string>;
  onClose?: () => void;
  onAllocate?: () => void;
  isBusy?: boolean;
}

export const CustomerReceiptDetail: React.FC<CustomerReceiptDetailProps> = ({
  receipt,
  customerName,
  invoiceNumbers,
  onClose,
  onAllocate,
  isBusy = false,
}) => {
  const canAllocate = receipt.unallocatedAmount > 0.01;

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">Customer Receipt</div>
          <div className="text-text-secondary">{customerName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{receipt.receiptNumber}</div>
          <div className="text-sm text-text-muted">{format(new Date(receipt.date), 'dd MMMM yyyy')}</div>
          <div className="text-xs font-semibold mt-2 px-2 py-1 rounded inline-block bg-info-financial/20 text-info-financial uppercase">
            {receipt.method}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Received From</div>
          <div className="font-semibold mb-1">{customerName}</div>
          {receipt.reference && <div className="text-sm text-text-secondary">Reference: {receipt.reference}</div>}
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide">Date Received</div>
          <div className="font-semibold">{format(new Date(receipt.date), 'dd MMMM yyyy')}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Amount Received</div>
          <FinancialNumber value={receipt.amount} format={formatCurrency} className="text-xl font-semibold text-positive" />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Allocated</div>
          <FinancialNumber value={receipt.amount - receipt.unallocatedAmount} format={formatCurrency} className="text-xl font-semibold" />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">On Account</div>
          <FinancialNumber value={receipt.unallocatedAmount} format={formatCurrency} className="text-xl font-semibold" />
        </div>
      </div>

      <div className="mb-8">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Allocations</div>
        {receipt.allocations.length === 0 ? (
          <div className="text-sm text-text-secondary">No allocations yet — this receipt is entirely on account.</div>
        ) : (
          <div className="space-y-1">
            {receipt.allocations.map((a, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-border/50 py-1">
                <span className="text-text-secondary">{invoiceNumbers.get(a.invoiceId) || a.invoiceId}</span>
                <FinancialNumber value={a.amount} format={formatCurrency} />
              </div>
            ))}
          </div>
        )}
      </div>

      {receipt.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{receipt.notes}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onAllocate && canAllocate && (
          <Button variant="primary" disabled={isBusy} onClick={onAllocate}>
            Allocate to Invoice
          </Button>
        )}
      </div>
    </div>
  );
};
