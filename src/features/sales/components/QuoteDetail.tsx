import React from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Button } from '@/components/ui/Button';
import type { Quote } from '@/types';

interface QuoteDetailProps {
  quote: Quote;
  customerName: string;
  onClose?: () => void;
  onEdit?: () => void;
  onMarkAsSent?: (id: string) => void;
  onMarkAsAccepted?: (id: string) => void;
  onMarkAsDeclined?: (id: string) => void;
  onConvertToSalesOrder?: (id: string) => void;
  isBusy?: boolean;
}

export const QuoteDetail: React.FC<QuoteDetailProps> = ({
  quote,
  customerName,
  onClose,
  onEdit,
  onMarkAsSent,
  onMarkAsAccepted,
  onMarkAsDeclined,
  onConvertToSalesOrder,
  isBusy = false,
}) => {
  const canSend = quote.status === 'draft';
  const canRespond = quote.status === 'sent';
  const canConvert = quote.status === 'accepted';

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">Quote</div>
          <div className="text-text-secondary">{customerName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{quote.quoteNumber}</div>
          <div className="text-sm text-text-muted">{format(new Date(quote.issueDate), 'dd MMMM yyyy')}</div>
          <div className={`text-xs font-semibold mt-2 px-2 py-1 rounded inline-block ${getStatusClass(quote.status)}`}>
            {getStatusLabel(quote.status)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Quoted To</div>
          <div className="font-semibold mb-1">{customerName}</div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wide">Issue Date</div>
            <div className="font-semibold">{format(new Date(quote.issueDate), 'dd MMMM yyyy')}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wide">Expiry Date</div>
            <div className="font-semibold">{format(new Date(quote.expiryDate), 'dd MMMM yyyy')}</div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border border-border border-b-0 font-semibold text-sm">
          <FinancialTableCell type="label">Description</FinancialTableCell>
          <FinancialTableCell type="number">Qty</FinancialTableCell>
          <FinancialTableCell type="number">Unit Price</FinancialTableCell>
          <FinancialTableCell type="number">Tax</FinancialTableCell>
          <FinancialTableCell type="number">Total</FinancialTableCell>
        </div>

        {quote.lineItems.map((item) => (
          <div key={item.id} className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border text-sm">
            <FinancialTableCell type="label">{item.description}</FinancialTableCell>
            <FinancialTableCell type="number" className="text-text-secondary">
              {item.quantity.toFixed(2)}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.unitPrice} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.taxAmount} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        ))}

        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-semibold">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Subtotal</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={quote.subtotal} format={formatCurrency} />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Tax/VAT</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={quote.taxTotal} format={formatCurrency} />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">TOTAL</div>
          <div className="px-2 py-2 text-sm text-right text-positive">
            <FinancialNumber value={quote.total} format={formatCurrency} />
          </div>
        </div>
      </div>

      {quote.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{quote.notes}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onEdit && quote.status === 'draft' && (
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        )}
        {onMarkAsSent && canSend && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onMarkAsSent(quote.id)}>
            Mark as Sent
          </Button>
        )}
        {onMarkAsDeclined && canRespond && (
          <Button variant="danger" disabled={isBusy} onClick={() => onMarkAsDeclined(quote.id)}>
            Mark as Declined
          </Button>
        )}
        {onMarkAsAccepted && canRespond && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onMarkAsAccepted(quote.id)}>
            Mark as Accepted
          </Button>
        )}
        {onConvertToSalesOrder && canConvert && (
          <Button variant="primary" disabled={isBusy} onClick={() => onConvertToSalesOrder(quote.id)}>
            Convert to Sales Order
          </Button>
        )}
      </div>
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    accepted: 'bg-positive/20 text-positive',
    declined: 'bg-negative/20 text-negative',
    expired: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
  };
  return labels[status] || status;
}
