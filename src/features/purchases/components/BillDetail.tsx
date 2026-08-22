import React from 'react';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import type { Bill } from '@/types';

interface BillDetailProps {
  bill: Bill;
  suppliersMap?: Record<string, string>;
  onClose?: () => void;
  onEdit?: (bill: Bill) => void;
  /** Posts the bill to the GL via billService.postBill() — draft only. */
  onPost?: (billId: string) => void;
  onRecordPayment?: (billId: string) => void;
}

export const BillDetail: React.FC<BillDetailProps> = ({
  bill,
  suppliersMap = {},
  onClose,
  onEdit,
  onPost,
  onRecordPayment,
}) => {
  const outstandingAmount = bill.total - bill.amountPaid;
  const supplierName = suppliersMap[bill.supplierId] || bill.supplierId;

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">Supplier Bill</div>
          <div className="text-text-secondary">{supplierName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{bill.billNumber}</div>
          <div className="text-sm text-text-muted">
            {format(new Date(bill.issueDate), 'dd MMMM yyyy')}
          </div>
        </div>
      </div>

      {/* Supplier & Dates */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Bill From</div>
          <div className="font-semibold mb-1">{supplierName}</div>
          <div className="text-sm text-text-secondary">Supplier ID: {bill.supplierId}</div>
        </div>
        <div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Bill Date</div>
              <div className="font-semibold">{format(new Date(bill.issueDate), 'dd MMMM yyyy')}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Due Date</div>
              <div className="font-semibold">{format(new Date(bill.dueDate), 'dd MMMM yyyy')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-8">
        {/* Header */}
        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border border-border border-b-0 font-semibold text-sm tabular-nums">
          <FinancialTableCell type="label">Description</FinancialTableCell>
          <FinancialTableCell type="number">Qty</FinancialTableCell>
          <FinancialTableCell type="number">Unit Price</FinancialTableCell>
          <FinancialTableCell type="number">Tax %</FinancialTableCell>
          <FinancialTableCell type="number">Net Total</FinancialTableCell>
          <FinancialTableCell type="number">Gross Total</FinancialTableCell>
        </div>

        {/* Rows */}
        {bill.lineItems.map((item) => (
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
              15%
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={item.lineTotal + item.taxAmount} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        ))}

        {/* Totals */}
        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-semibold tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Subtotal</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={bill.subtotal} format={formatCurrency} />
          </div>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Tax/VAT (Input)</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={bill.taxTotal} format={formatCurrency} />
          </div>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg tabular-nums">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">TOTAL DUE</div>
          <div className="px-2 py-2 text-sm text-right text-positive">
            <FinancialNumber value={bill.total} format={formatCurrency} />
          </div>
        </div>
      </div>

      {/* Payment Status */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Amount Paid</div>
          <FinancialNumber
            value={bill.amountPaid}
            format={formatCurrency}
            className="text-xl font-semibold text-positive"
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Outstanding</div>
          <FinancialNumber
            value={outstandingAmount}
            format={formatCurrency}
            className={`text-xl font-semibold ${outstandingAmount > 0 ? 'text-negative' : 'text-positive'}`}
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Status</div>
          <div className={`text-lg font-semibold ${getStatusColorClass(bill.status)}`}>
            {getStatusLabel(bill.status)}
          </div>
        </div>
      </div>

      {/* Notes */}
      {bill.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{bill.notes}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onEdit && bill.status === 'draft' && (
          <Button variant="secondary" onClick={() => onEdit(bill)}>
            Edit
          </Button>
        )}
        {onPost && bill.status === 'draft' && (
          <Button variant="primary" onClick={() => onPost(bill.id)}>
            Post Bill
          </Button>
        )}
        {onRecordPayment && bill.status !== 'draft' && bill.status !== 'void' && outstandingAmount > 0 && (
          <Button variant="primary" onClick={() => onRecordPayment(bill.id)}>
            Record Payment
          </Button>
        )}
      </div>
    </div>
  );
};

function getStatusLabel(status: string): string {
  const labels = {
    draft: 'Draft',
    awaiting_payment: 'Awaiting Payment',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    void: 'Void',
  };
  return labels[status as keyof typeof labels] || status;
}

function getStatusColorClass(status: string): string {
  const classes = {
    draft: 'text-info-financial',
    awaiting_payment: 'text-warning-financial',
    partially_paid: 'text-warning-financial',
    paid: 'text-positive',
    overdue: 'text-negative',
    void: 'text-text-muted',
  };
  return classes[status as keyof typeof classes] || '';
}
