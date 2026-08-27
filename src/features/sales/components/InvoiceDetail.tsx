import { useNavigate } from 'react-router-dom';
import type { Company, Invoice } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/shadcn/alert-dialog';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { invoiceService } from '@/services';

interface InvoiceDetailProps {
  invoice: Invoice;
  customerName: string;
  /** The issuing company, for SARS-required tax invoice fields (name, VAT registration number — SA_ACCOUNTING_MASTER_SPEC.md §13). */
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkAsSent?: () => void;
  onRecordPayment?: () => void;
  isBusy?: boolean;
}

/**
 * Invoice detail — re-skinned onto v0's PageHeader/SectionCard, same
 * action gating as before the port (Mark as Sent only from draft; Record
 * Payment only once sent/partially paid, never draft/paid/void). Adds a
 * "Delete draft" action wired to the existing `deleteInvoice()` guard
 * (draft-only) that the old detail page never surfaced despite the hook
 * already supporting it — see the M4 report. There is no Void/Cancel
 * action: InvoiceService has none for a posted invoice — its own
 * `deleteInvoice()` error message says so directly: issue a Credit Note
 * instead (the M4 report also flags this).
 */
export function InvoiceDetail({
  invoice,
  customerName,
  company,
  onBack,
  onEdit,
  onDelete,
  onMarkAsSent,
  onRecordPayment,
  isBusy = false,
}: InvoiceDetailProps) {
  const outstanding = invoice.total - invoice.amountPaid;
  const collectionPercent = invoice.total === 0 ? 0 : (invoice.amountPaid / invoice.total) * 100;
  const overdue = invoiceService.isOverdue(invoice);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        description={company?.name ? `${company.name} — Tax Invoice` : 'Tax Invoice'}
        actions={
          <>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {onEdit && invoice.status === 'draft' && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onDelete && invoice.status === 'draft' && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={isBusy} />}>
                  Delete draft
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {invoice.invoiceNumber}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the draft invoice. This cannot be undone. A posted invoice can never
                      be deleted this way — issue a credit note instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                      onClick={onDelete}
                    >
                      Delete draft
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {onMarkAsSent && invoice.status === 'draft' && (
              <Button size="sm" disabled={isBusy} onClick={onMarkAsSent}>
                Mark as sent
              </Button>
            )}
            {onRecordPayment && invoice.status !== 'paid' && invoice.status !== 'draft' && invoice.status !== 'void' && (
              <Button size="sm" disabled={isBusy} onClick={onRecordPayment}>
                Record payment
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={invoice.status} />
        {overdue && invoice.status !== 'paid' && invoice.status !== 'void' && (
          <span className="text-xs font-medium text-status-negative">Past due date</span>
        )}
      </div>

      {invoice.status !== 'draft' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            This invoice has posted to the ledger, so its line items and amounts can no longer be edited here —
            issue a credit note to adjust it.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/sales/credit-notes')}>
            Go to credit notes
          </Button>
        </div>
      )}

      <SectionCard title="Bill to" description={customerName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Issue date</div>
            <div className="text-sm font-medium">{formatDate(invoice.issueDate)}</div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Due date</div>
            <div className="text-sm font-medium">{formatDate(invoice.dueDate)}</div>
          </div>
        </div>
        {company?.vatRegistrationNumber && (
          <p className="mt-4 text-xs text-muted-foreground">VAT Reg. No: {company.vatRegistrationNumber}</p>
        )}
        {company?.registrationNumber && <p className="text-xs text-muted-foreground">Reg. No: {company.registrationNumber}</p>}
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
              {invoice.lineItems.map((item) => (
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
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(invoice.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Tax/VAT</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(invoice.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-status-positive-muted">
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total due</td>
                <td className="px-4 py-2 text-right text-base font-bold text-positive">{formatCurrency(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Payment status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FigureBlock label="Amount paid" value={formatCurrency(invoice.amountPaid)} tone="positive" />
          <FigureBlock label="Outstanding" value={formatCurrency(outstanding)} tone={outstanding > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Collection" value={`${collectionPercent.toFixed(1)}%`} />
        </div>
      </SectionCard>

      {invoice.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
        </SectionCard>
      )}
    </>
  );
}
