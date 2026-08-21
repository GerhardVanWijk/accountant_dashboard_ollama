import React from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Button } from '@/components/ui/Button';
import type { PurchaseOrder } from '@/types';

interface PurchaseOrderDetailProps {
  purchaseOrder: PurchaseOrder;
  suppliersMap?: Record<string, string>;
  onClose?: () => void;
  onSend?: (id: string) => void;
  onRecordReceipt?: (id: string) => void;
  onCancel?: (id: string) => void;
  onConvertToBill?: (id: string) => void;
  isBusy?: boolean;
}

export const PurchaseOrderDetail: React.FC<PurchaseOrderDetailProps> = ({
  purchaseOrder,
  suppliersMap = {},
  onClose,
  onSend,
  onRecordReceipt,
  onCancel,
  onConvertToBill,
  isBusy = false,
}) => {
  const supplierName = suppliersMap[purchaseOrder.supplierId] || purchaseOrder.supplierId;
  const canSend = purchaseOrder.status === 'draft';
  const canReceive = purchaseOrder.status === 'sent' || purchaseOrder.status === 'partially_received';
  const canCancel = purchaseOrder.status !== 'received' && purchaseOrder.status !== 'cancelled';
  const canConvert = purchaseOrder.status !== 'draft' && purchaseOrder.status !== 'cancelled';

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">Purchase Order</div>
          <div className="text-text-secondary">{supplierName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{purchaseOrder.poNumber}</div>
          <div className="text-sm text-text-muted">
            {format(new Date(purchaseOrder.orderDate), 'dd MMMM yyyy')}
          </div>
        </div>
      </div>

      {/* Supplier & Dates */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Order From</div>
          <div className="font-semibold mb-1">{supplierName}</div>
          <div className="text-sm text-text-secondary">Supplier ID: {purchaseOrder.supplierId}</div>
        </div>
        <div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Order Date</div>
              <div className="font-semibold">{format(new Date(purchaseOrder.orderDate), 'dd MMMM yyyy')}</div>
            </div>
            {purchaseOrder.expectedDate && (
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide">Expected Date</div>
                <div className="font-semibold">{format(new Date(purchaseOrder.expectedDate), 'dd MMMM yyyy')}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-8">
        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border border-border border-b-0 font-semibold text-sm tabular-nums">
          <FinancialTableCell type="label">Description</FinancialTableCell>
          <FinancialTableCell type="number">Qty</FinancialTableCell>
          <FinancialTableCell type="number">Unit Price</FinancialTableCell>
          <FinancialTableCell type="number">Tax %</FinancialTableCell>
          <FinancialTableCell type="number">Net Total</FinancialTableCell>
          <FinancialTableCell type="number">Gross Total</FinancialTableCell>
        </div>

        {purchaseOrder.lineItems.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 border-b border-border text-sm tabular-nums"
          >
            <FinancialTableCell type="label">{item.description}</FinancialTableCell>
            <FinancialTableCell type="number" className="text-text-secondary">
              {item.quantity.toFixed(2)}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.unitPrice} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="text-text-secondary">
              {item.lineTotal > 0 ? `${Math.round((item.taxAmount / item.lineTotal) * 100)}%` : '0%'}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={item.lineTotal + item.taxAmount} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        ))}

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-semibold tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Subtotal</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={purchaseOrder.subtotal} format={formatCurrency} />
          </div>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Tax/VAT</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={purchaseOrder.taxTotal} format={formatCurrency} />
          </div>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">TOTAL</div>
          <div className="px-2 py-2 text-sm text-right text-positive">
            <FinancialNumber value={purchaseOrder.total} format={formatCurrency} />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mb-8">
        <div className="bg-panel p-4 rounded-lg border border-border inline-block">
          <div className="text-xs text-text-muted mb-2">Status</div>
          <div className={`text-lg font-semibold ${getStatusColorClass(purchaseOrder.status)}`}>
            {getStatusLabel(purchaseOrder.status)}
          </div>
        </div>
      </div>

      {/* Notes */}
      {purchaseOrder.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{purchaseOrder.notes}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onCancel && canCancel && (
          <Button variant="danger" disabled={isBusy} onClick={() => onCancel(purchaseOrder.id)}>
            Cancel Order
          </Button>
        )}
        {onSend && canSend && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onSend(purchaseOrder.id)}>
            Send to Supplier
          </Button>
        )}
        {onRecordReceipt && canReceive && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onRecordReceipt(purchaseOrder.id)}>
            Record Receipt
          </Button>
        )}
        {onConvertToBill && canConvert && (
          <Button variant="primary" disabled={isBusy} onClick={() => onConvertToBill(purchaseOrder.id)}>
            Convert to Bill
          </Button>
        )}
      </div>
    </div>
  );
};

function getStatusLabel(status: string): string {
  const labels = {
    draft: 'Draft',
    sent: 'Sent',
    partially_received: 'Partially Received',
    received: 'Received',
    cancelled: 'Cancelled',
  };
  return labels[status as keyof typeof labels] || status;
}

function getStatusColorClass(status: string): string {
  const classes = {
    draft: 'text-info-financial',
    sent: 'text-warning-financial',
    partially_received: 'text-warning-financial',
    received: 'text-positive',
    cancelled: 'text-text-muted',
  };
  return classes[status as keyof typeof classes] || '';
}
