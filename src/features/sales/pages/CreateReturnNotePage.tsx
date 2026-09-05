import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useReturnNoteMutations } from '@/features/sales/hooks/useReturnNoteMutations';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { computeReturnableDeliveryNoteLines } from '@/features/sales/services';
import type { CreateReturnNoteLineDTO } from '@/features/sales/services';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });
const inputClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums';

/**
 * Full-page "Create return" form — route
 * `/sales/delivery-notes/:deliveryNoteId/return` (Phase 5D). Only reachable
 * from a POSTED Delivery Note — a Return Note reverses physical stock that
 * has actually left the warehouse but has not yet been invoiced. Not a
 * modal/side-sheet, following the same full-page direction as Delivery
 * Notes/Sales Orders/Invoices.
 */
export function CreateReturnNotePage() {
  const { deliveryNoteId } = useParams<{ deliveryNoteId: string }>();
  const navigate = useNavigate();

  const { deliveryNotes, isLoading: dnLoading } = useDeliveryNotes();
  const { invoices, loading: invLoading } = useInvoices();
  const { returnNotes, isLoading: rnLoading } = useReturnNotes();
  const { customers: customerMap } = useCustomerMap();
  const { createDraft, isLoading: submitting } = useReturnNoteMutations();

  const dn = deliveryNotes.find((d) => d.id === deliveryNoteId);
  const returnable = useMemo(
    () => (dn ? computeReturnableDeliveryNoteLines(dn, invoices, returnNotes) : []),
    [dn, invoices, returnNotes],
  );

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loading = dnLoading || invLoading || rnLoading;
  const customerName = dn ? customerMap.get(dn.customerId) ?? 'Unknown customer' : '';

  const returnableLines = useMemo(() => returnable.filter((l) => l.returnableQty > 1e-6), [returnable]);

  function setQty(lineId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!dn) return;
    const lines: CreateReturnNoteLineDTO[] = returnableLines
      .map((l) => ({ deliveryNoteLineId: l.deliveryNoteLineId, quantity: Number(quantities[l.deliveryNoteLineId] ?? 0) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      setFormError('Enter a quantity greater than zero for at least one line.');
      return;
    }
    try {
      const rn = await createDraft({
        deliveryNoteId: dn.id,
        returnDate: new Date(returnDate).toISOString(),
        lines,
        notes: notes.trim() || undefined,
      });
      navigate(`/sales/return-notes/${rn.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the return note.');
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!dn) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm">Delivery note not found.</p>
      </div>
    );
  }

  if (dn.status !== 'posted') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm">Only a posted delivery note has physical stock to return (current status: {dn.status}).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Create return — ${dn.deliveryNoteNumber}`}
        description={`${customerName} · return delivered-but-not-yet-invoiced goods. Already-invoiced quantity must be returned via a Credit Note instead — posting reverses DR 1200 Inventory / CR 1220 Goods Delivered Not Invoiced at the ORIGINAL frozen delivery cost.`}
      />

      <SectionCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rn-date" className="text-sm font-medium">Return date</label>
            <input id="rn-date" type="date" className={inputClass} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Warehouse</span>
            <p className="flex h-9 items-center text-sm text-muted-foreground">Same warehouse the delivery left from — not editable.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="mb-3 text-sm font-medium">Lines to return</h2>
        {returnableLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every line on this delivery has already been fully invoiced or returned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 text-right font-medium">Delivered</th>
                  <th className="py-2 pr-3 text-right font-medium">Invoiced</th>
                  <th className="py-2 pr-3 text-right font-medium">Already returned</th>
                  <th className="py-2 pr-3 text-right font-medium">Returnable</th>
                  <th className="py-2 text-right font-medium">Return now</th>
                </tr>
              </thead>
              <tbody>
                {returnableLines.map((l) => (
                  <tr key={l.deliveryNoteLineId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{l.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.deliveredQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.invoicedQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.alreadyReturnedQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.returnableQty)}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={l.returnableQty}
                        step="0.001"
                        className={`${inputClass} w-28 text-right`}
                        value={quantities[l.deliveryNoteLineId] ?? '0'}
                        onChange={(e) => setQty(l.deliveryNoteLineId, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rn-notes" className="text-sm font-medium">Notes (optional)</label>
          <textarea
            id="rn-notes"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </SectionCard>

      {formError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => void handleSubmit()} disabled={submitting || returnableLines.length === 0}>
          {submitting ? 'Creating…' : 'Create return note (draft)'}
        </Button>
        <Button variant="outline" onClick={() => navigate(`/sales/delivery-notes/${dn.id}`)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
