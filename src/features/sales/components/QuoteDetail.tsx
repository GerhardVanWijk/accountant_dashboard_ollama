import type { Quote } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
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

interface QuoteDetailProps {
  quote: Quote;
  customerName: string;
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkAsSent?: (id: string) => void;
  onMarkAsAccepted?: (id: string) => void;
  onMarkAsDeclined?: (id: string) => void;
  onConvertToSalesOrder?: (id: string) => void;
  isBusy?: boolean;
}

/**
 * Quote detail — re-skinned onto v0's PageHeader/SectionCard (M13), mirrors
 * InvoiceDetail.tsx's shape. Action gating unchanged from before the port:
 * Mark as Sent only from draft; Mark as Accepted/Declined only from sent;
 * Convert to Sales Order only from accepted. Adds a "Delete draft" action
 * wired to the existing quoteService.deleteQuote() guard (draft-only,
 * already supported by the service but never surfaced by the old detail
 * page), matching InvoiceDetail's equivalent action. Quotes never post to
 * the GL, so there is no ledger-integrity reason to withhold it.
 */
export function QuoteDetail({
  quote,
  customerName,
  onBack,
  onEdit,
  onDelete,
  onMarkAsSent,
  onMarkAsAccepted,
  onMarkAsDeclined,
  onConvertToSalesOrder,
  isBusy = false,
}: QuoteDetailProps) {
  const canSend = quote.status === 'draft';
  const canRespond = quote.status === 'sent';
  const canConvert = quote.status === 'accepted';

  return (
    <>
      <PageHeader
        title={quote.quoteNumber}
        description={`${customerName} — Quote`}
        actions={
          <>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {onEdit && quote.status === 'draft' && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onDelete && quote.status === 'draft' && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={isBusy} />}>
                  Delete draft
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {quote.quoteNumber}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the draft quote. This cannot be undone. Once sent, a quote is a
                      customer-facing document and must be declined or left to expire instead of deleted.
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
            {onMarkAsSent && canSend && (
              <Button size="sm" disabled={isBusy} onClick={() => onMarkAsSent(quote.id)}>
                Mark as sent
              </Button>
            )}
            {onMarkAsDeclined && canRespond && (
              <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => onMarkAsDeclined(quote.id)}>
                Mark as declined
              </Button>
            )}
            {onMarkAsAccepted && canRespond && (
              <Button size="sm" disabled={isBusy} onClick={() => onMarkAsAccepted(quote.id)}>
                Mark as accepted
              </Button>
            )}
            {onConvertToSalesOrder && canConvert && (
              <Button size="sm" disabled={isBusy} onClick={() => onConvertToSalesOrder(quote.id)}>
                Convert to sales order
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={quote.status} />
      </div>

      <SectionCard title="Quoted to" description={customerName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Issue date</div>
            <div className="text-sm font-medium">{formatDate(quote.issueDate)}</div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Expiry date</div>
            <div className="text-sm font-medium">{formatDate(quote.expiryDate)}</div>
          </div>
        </div>
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
              {quote.lineItems.map((item) => (
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
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(quote.subtotal)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-2 text-right text-sm text-muted-foreground">Tax/VAT</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(quote.taxTotal)}</td>
              </tr>
              <tr className="border-t border-border bg-status-positive-muted">
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold uppercase">Total</td>
                <td className="px-4 py-2 text-right text-base font-bold text-positive">{formatCurrency(quote.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {quote.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
        </SectionCard>
      )}
    </>
  );
}
