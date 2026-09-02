import { useState } from 'react';
import type { Company, CreditNote } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';

const REASON_LABELS: Record<string, string> = {
  return: 'Returned goods',
  pricing_error: 'Pricing error',
  discount: 'Discount',
  other: 'Other',
};

interface CreditNoteDetailProps {
  creditNote: CreditNote;
  customerName: string;
  linkedInvoiceNumber?: string;
  /** The issuing company — same SARS tax-document fields as InvoiceDetail (SA_ACCOUNTING_MASTER_SPEC.md §13/§15). */
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  onBack?: () => void;
  onIssue?: (id: string) => void;
  onVoid?: (id: string) => void;
  onAllocate?: () => void;
  isBusy?: boolean;
}

/**
 * Credit note detail — re-skinned onto v0's PageHeader/SectionCard, same
 * action gating as before the port: Issue and Void are draft-only, Allocate
 * only once issued/allocated with remaining value. `creditNoteService.
 * voidCreditNote()` itself only allows voiding a draft — an issued note is
 * already posted and can't be voided from here, matching the reversal-only
 * correction path (docs/LEDGER_ARCHITECTURE.md).
 */
export function CreditNoteDetail({
  creditNote,
  customerName,
  linkedInvoiceNumber,
  company,
  onBack,
  onIssue,
  onVoid,
  onAllocate,
  isBusy = false,
}: CreditNoteDetailProps) {
  const [confirmVoid, setConfirmVoid] = useState(false);
  const remaining = creditNote.total - creditNote.amountAllocated;
  const canIssue = creditNote.status === 'draft';
  const canVoid = creditNote.status === 'draft';
  const canAllocate = (creditNote.status === 'issued' || creditNote.status === 'allocated') && remaining > 0.01;

  return (
    <>
      <PageHeader
        title={creditNote.creditNoteNumber}
        description={linkedInvoiceNumber ? `Against invoice ${linkedInvoiceNumber}` : 'Standalone account credit'}
        actions={
          <>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {onVoid && canVoid && (
              <>
                <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => setConfirmVoid(true)}>
                  Void
                </Button>
                <ConfirmDialog
                  open={confirmVoid}
                  onOpenChange={setConfirmVoid}
                  title={`Void ${creditNote.creditNoteNumber}?`}
                  description="This marks the draft credit note as void. This cannot be undone."
                  confirmLabel="Void credit note"
                  destructive
                  onConfirm={() => {
                    setConfirmVoid(false);
                    onVoid(creditNote.id);
                  }}
                />
              </>
            )}
            {onIssue && canIssue && (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onIssue(creditNote.id)}>
                Issue credit note
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
        <StatusBadge status={creditNote.status} />
      </div>

      <SectionCard title="Credited to" description={customerName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Issue date</div>
            <div className="text-sm font-medium">{formatDate(creditNote.issueDate)}</div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Reason</div>
            <div className="text-sm font-medium">{REASON_LABELS[creditNote.reason] ?? creditNote.reason}</div>
          </div>
          {creditNote.reasonDetails && (
            <div className="sm:col-span-2">
              <div className="text-xs tracking-wide text-muted-foreground uppercase">Reason detail</div>
              <div className="text-sm whitespace-pre-wrap">{creditNote.reasonDetails}</div>
            </div>
          )}
        </div>
        {company?.vatRegistrationNumber && (
          <p className="mt-4 text-xs text-muted-foreground">VAT Reg. No: {company.vatRegistrationNumber}</p>
        )}
      </SectionCard>

      <SectionCard title="Line items" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Unit price</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Tax</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {creditNote.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{item.quantity.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.taxAmount)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Subtotal</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(creditNote.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Tax/VAT</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(creditNote.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-status-negative-muted">
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total credit</td>
                <td className="px-4 py-2 text-right text-base font-bold text-negative">{formatCurrency(creditNote.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Allocation status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FigureBlock label="Allocated" value={formatCurrency(creditNote.amountAllocated)} />
          <FigureBlock label="Remaining" value={formatCurrency(remaining)} tone={remaining > 0 ? 'warning' : 'default'} />
        </div>
        {creditNote.allocations.length > 0 && (
          <div className="mt-4 flex flex-col gap-1">
            {creditNote.allocations.map((a, i) => (
              <div key={i} className="flex justify-between border-b border-border/50 py-1 text-sm">
                <span className="text-muted-foreground">
                  Invoice {a.invoiceId} — {formatDate(a.allocatedAt)}
                </span>
                <span>{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {creditNote.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{creditNote.notes}</p>
        </SectionCard>
      )}
    </>
  );
}
