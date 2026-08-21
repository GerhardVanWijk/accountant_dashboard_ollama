import React from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Button } from '@/components/ui/Button';
import type { SalesOrder } from '@/types';

interface SalesOrderDetailProps {
  salesOrder: SalesOrder;
  customerName: string;
  quoteNumber?: string;
  onClose?: () => void;
  onEdit?: () => void;
  onConfirmOrder?: (id: string) => void;
  onCancelOrder?: (id: string) => void;
  onConvertToInvoice?: (id: string) => void;
  isBusy?: boolean;
}

export const SalesOrderDetail: React.FC<SalesOrderDetailProps> = ({
  salesOrder,
  customerName,
  quoteNumber,
  onClose,
  onEdit,
  onConfirmOrder,
  onCancelOrder,
  onConvertToInvoice,
  isBusy = false,
}) => {
  const canConfirm = salesOrder.status === 'pending';
  const canCancel = salesOrder.status !== 'fulfilled' && salesOrder.status !== 'cancelled';
  const canConvert = salesOrder.status !== 'cancelled' && salesOrder.status !== 'fulfilled';

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">Sales Order</div>
          <div className="text-text-secondary">{customerName}</div>
          {quoteNumber && <div className="text-xs text-text-muted mt-1">Converted from quote {quoteNumber}</div>}
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{salesOrder.orderNumber}</div>
          <div className="text-sm text-text-muted">{format(new Date(salesOrder.orderDate), 'dd MMMM yyyy')}</div>
          <div className={`text-xs font-semibold mt-2 px-2 py-1 rounded inline-block ${getStatusClass(salesOrder.status)}`}>
            {getStatusLabel(salesOrder.status)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Order From</div>
          <div className="font-semibold mb-1">{customerName}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide">Order Date</div>
          <div className="font-semibold">{format(new Date(salesOrder.orderDate), 'dd MMMM yyyy')}</div>
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

        {salesOrder.lineItems.map((item) => (
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
            <FinancialNumber value={salesOrder.subtotal} format={formatCurrency} />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Tax/VAT</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={salesOrder.taxTotal} format={formatCurrency} />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">TOTAL</div>
          <div className="px-2 py-2 text-sm text-right text-positive">
            <FinancialNumber value={salesOrder.total} format={formatCurrency} />
          </div>
        </div>
      </div>

      {salesOrder.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{salesOrder.notes}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onEdit && salesOrder.status === 'pending' && (
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        )}
        {onCancelOrder && canCancel && (
          <Button variant="danger" disabled={isBusy} onClick={() => onCancelOrder(salesOrder.id)}>
            Cancel Order
          </Button>
        )}
        {onConfirmOrder && canConfirm && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onConfirmOrder(salesOrder.id)}>
            Confirm Order
          </Button>
        )}
        {onConvertToInvoice && canConvert && (
          <Button variant="primary" disabled={isBusy} onClick={() => onConvertToInvoice(salesOrder.id)}>
            Convert to Invoice
          </Button>
        )}
      </div>
    </div>
  );
};

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    pending: 'bg-info-financial/20 text-info-financial',
    confirmed: 'bg-warning-financial/20 text-warning-financial',
    fulfilled: 'bg-positive/20 text-positive',
    cancelled: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}
