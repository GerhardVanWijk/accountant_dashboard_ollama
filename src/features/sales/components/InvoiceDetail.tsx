import React from 'react';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { format } from 'date-fns';
import type { Company, Invoice } from '@/types';

interface InvoiceDetailProps {
  invoice: Invoice;
  customerName: string;
  /**
   * The issuing company, for SARS-required tax invoice fields (name, VAT
   * registration number — SA_ACCOUNTING_MASTER_SPEC.md §13). Falls back to
   * a placeholder only when no Company record is available yet.
   */
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  onEdit?: () => void;
  onMarkAsSent?: () => void;
  onRecordPayment?: () => void;
}

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({
  invoice,
  customerName,
  company,
  onEdit,
  onMarkAsSent,
  onRecordPayment,
}) => {
  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      {(onEdit || onMarkAsSent || onRecordPayment) && (
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
            >
              Edit
            </button>
          )}
          {onMarkAsSent && invoice.status === 'draft' && (
            <button
              onClick={onMarkAsSent}
              className="px-4 py-2 bg-info-financial text-white rounded hover:bg-info-financial/90 transition-colors"
            >
              Mark as Sent
            </button>
          )}
          {onRecordPayment && invoice.status !== 'paid' && (
            <button
              onClick={onRecordPayment}
              className="px-4 py-2 bg-positive text-white rounded hover:bg-positive/90 transition-colors"
            >
              Record Payment
            </button>
          )}
        </div>
      )}

      {/* Invoice Document */}
      <div className="max-w-4xl bg-panel p-8 rounded-lg border border-border">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
          <div>
            <div className="text-3xl font-bold mb-2">{company?.name ?? 'Your Company'}</div>
            <div className="text-text-secondary">Tax Invoice</div>
            {company?.vatRegistrationNumber && (
              <div className="text-xs text-text-muted mt-1">VAT Reg. No: {company.vatRegistrationNumber}</div>
            )}
            {company?.registrationNumber && (
              <div className="text-xs text-text-muted">Reg. No: {company.registrationNumber}</div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-xl font-semibold">{invoice.invoiceNumber}</div>
            <div className="text-sm text-text-muted">{format(new Date(invoice.issueDate), 'dd MMMM yyyy')}</div>
            <div className={`text-xs font-semibold mt-2 px-2 py-1 rounded ${getStatusClass(invoice.status)}`}>
              {getStatusLabel(invoice.status)}
            </div>
          </div>
        </div>

        {/* Customer & Dates */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Bill To</div>
            <div className="font-semibold mb-1">{customerName}</div>
          </div>
          <div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide">Invoice Date</div>
                <div className="font-semibold">{format(new Date(invoice.issueDate), 'dd MMMM yyyy')}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide">Due Date</div>
                <div className="font-semibold">{format(new Date(invoice.dueDate), 'dd MMMM yyyy')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-8">
          {/* Header */}
          <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border border-border border-b-0 font-semibold text-sm">
            <FinancialTableCell type="label">Description</FinancialTableCell>
            <FinancialTableCell type="number">Qty</FinancialTableCell>
            <FinancialTableCell type="number">Unit Price</FinancialTableCell>
            <FinancialTableCell type="number">Tax Amount</FinancialTableCell>
            <FinancialTableCell type="number">Total</FinancialTableCell>
          </div>

          {/* Rows */}
          {invoice.lineItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border text-sm"
            >
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

          {/* Subtotal */}
          <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-semibold">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number">Subtotal</FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={invoice.subtotal} format={formatCurrency} />
            </FinancialTableCell>
          </div>

          {/* Tax */}
          <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number">Tax/VAT</FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={invoice.taxTotal} format={formatCurrency} />
            </FinancialTableCell>
          </div>

          {/* Total Due */}
          <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number"> </FinancialTableCell>
            <FinancialTableCell type="number">TOTAL DUE</FinancialTableCell>
            <FinancialTableCell type="number" className="text-positive">
              <FinancialNumber value={invoice.total} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        </div>

        {/* Payment Status */}
        <div className="mb-8 p-4 bg-panel border border-border rounded">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Amount Paid</div>
              <FinancialNumber
                value={invoice.amountPaid}
                format={formatCurrency}
                className="text-lg font-semibold text-positive"
                minWidth={100}
              />
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Outstanding</div>
              <FinancialNumber
                value={invoice.total - invoice.amountPaid}
                format={formatCurrency}
                className="text-lg font-semibold"
                minWidth={100}
              />
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Collection %</div>
              <div className="text-lg font-semibold tabular-nums">
                {((invoice.amountPaid / invoice.total) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-8">
            <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
            <div className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-8 border-t border-border text-xs text-text-muted">
          <div>Thank you for your business!</div>
          <div className="mt-4">Please make payment by {format(new Date(invoice.dueDate), 'dd MMMM yyyy')}</div>
        </div>
      </div>
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    paid: 'bg-positive/20 text-positive',
    partially_paid: 'bg-warning-financial/20 text-warning-financial',
    overdue: 'bg-negative/20 text-negative',
    void: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    paid: 'Paid',
    partially_paid: 'Partial',
    overdue: 'Overdue',
    void: 'Void',
  };
  return labels[status] || status;
}
