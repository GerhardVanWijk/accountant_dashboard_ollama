import React from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Button } from '@/components/ui/Button';
import type { Company, CreditNote } from '@/types';

interface CreditNoteDetailProps {
  creditNote: CreditNote;
  customerName: string;
  linkedInvoiceNumber?: string;
  /** The issuing company — same SARS tax-document fields as InvoiceDetail (SA_ACCOUNTING_MASTER_SPEC.md §13/§15). */
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  onClose?: () => void;
  onIssue?: (id: string) => void;
  onVoid?: (id: string) => void;
  onAllocate?: () => void;
  isBusy?: boolean;
}

export const CreditNoteDetail: React.FC<CreditNoteDetailProps> = ({
  creditNote,
  customerName,
  linkedInvoiceNumber,
  company,
  onClose,
  onIssue,
  onVoid,
  onAllocate,
  isBusy = false,
}) => {
  const remaining = creditNote.total - creditNote.amountAllocated;
  const canIssue = creditNote.status === 'draft';
  const canVoid = creditNote.status === 'draft';
  const canAllocate = (creditNote.status === 'issued' || creditNote.status === 'allocated') && remaining > 0.01;

  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-lg font-semibold mb-1">{company?.name ?? 'Your Company'}</div>
          {company?.vatRegistrationNumber && (
            <div className="text-xs text-text-muted mb-1">VAT Reg. No: {company.vatRegistrationNumber}</div>
          )}
          <div className="text-3xl font-bold mb-2">Credit Note</div>
          <div className="text-text-secondary">{customerName}</div>
          {linkedInvoiceNumber && (
            <div className="text-xs text-text-muted mt-1">Against invoice {linkedInvoiceNumber}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{creditNote.creditNoteNumber}</div>
          <div className="text-sm text-text-muted">{format(new Date(creditNote.issueDate), 'dd MMMM yyyy')}</div>
          <div className={`text-xs font-semibold mt-2 px-2 py-1 rounded inline-block ${getStatusClass(creditNote.status)}`}>
            {getStatusLabel(creditNote.status)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Credited To</div>
          <div className="font-semibold mb-1">{customerName}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide">Reason</div>
          <div className="font-semibold">{getReasonLabel(creditNote.reason)}</div>
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

        {creditNote.lineItems.map((item) => (
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
            <FinancialNumber value={creditNote.subtotal} format={formatCurrency} isInverted />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">Tax/VAT</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={creditNote.taxTotal} format={formatCurrency} isInverted />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-3 px-4 py-3 bg-negative/10 border-b-2 border-border font-bold text-lg">
          <div></div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">TOTAL CREDIT</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={creditNote.total} format={formatCurrency} isInverted />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Allocated</div>
          <FinancialNumber value={creditNote.amountAllocated} format={formatCurrency} className="text-xl font-semibold" isInverted />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Remaining</div>
          <FinancialNumber value={remaining} format={formatCurrency} className="text-xl font-semibold" isInverted />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Status</div>
          <div className={`text-lg font-semibold ${getStatusTextClass(creditNote.status)}`}>
            {getStatusLabel(creditNote.status)}
          </div>
        </div>
      </div>

      {creditNote.allocations.length > 0 && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Allocation History</div>
          <div className="space-y-1">
            {creditNote.allocations.map((a, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-border/50 py-1">
                <span className="text-text-secondary">
                  Invoice {a.invoiceId} — {format(new Date(a.allocatedAt), 'dd MMM yyyy')}
                </span>
                <FinancialNumber value={a.amount} format={formatCurrency} isInverted />
              </div>
            ))}
          </div>
        </div>
      )}

      {creditNote.notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{creditNote.notes}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-end pt-8 border-t border-border">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {onVoid && canVoid && (
          <Button variant="danger" disabled={isBusy} onClick={() => onVoid(creditNote.id)}>
            Void
          </Button>
        )}
        {onIssue && canIssue && (
          <Button variant="secondary" disabled={isBusy} onClick={() => onIssue(creditNote.id)}>
            Issue Credit Note
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

function getReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    return: 'Returned Goods',
    pricing_error: 'Pricing Error',
    discount: 'Discount',
    other: 'Other',
  };
  return labels[reason] || reason;
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'bg-info-financial/20 text-info-financial',
    issued: 'bg-warning-financial/20 text-warning-financial',
    allocated: 'bg-positive/20 text-positive',
    void: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusTextClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'text-info-financial',
    issued: 'text-warning-financial',
    allocated: 'text-positive',
    void: 'text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    issued: 'Issued',
    allocated: 'Allocated',
    void: 'Void',
  };
  return labels[status] || status;
}
