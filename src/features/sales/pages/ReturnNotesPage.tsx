import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

/**
 * Return Notes list — route `/sales/return-notes` (Phase 5D). Read-only: a
 * Return Note is always created FROM an eligible posted Delivery Note
 * (`DeliveryNoteDetailPage`'s "Create return" action) — same SO-originated
 * creation model as `DeliveryNotesPage`.
 */
export function ReturnNotesPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted' | 'cancelled'>('all');
  const [query, setQuery] = useState('');

  const { returnNotes, isLoading, error } = useReturnNotes();
  const { deliveryNotes } = useDeliveryNotes();
  const { customers: customerMap } = useCustomerMap();

  const dnByIdMap = useMemo(() => new Map(deliveryNotes.map((d) => [d.id, d])), [deliveryNotes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return returnNotes
      .filter((rn) => statusFilter === 'all' || rn.status === statusFilter)
      .filter((rn) => {
        if (!q) return true;
        const dn = dnByIdMap.get(rn.deliveryNoteId);
        const customerName = customerMap.get(rn.customerId) ?? '';
        return (
          rn.returnNoteNumber.toLowerCase().includes(q) ||
          customerName.toLowerCase().includes(q) ||
          (dn?.deliveryNoteNumber ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
  }, [returnNotes, statusFilter, query, dnByIdMap, customerMap]);

  const posted = returnNotes.filter((r) => r.status === 'posted');
  const drafts = returnNotes.filter((r) => r.status === 'draft');
  const totalUnitsReturned = posted.reduce((sum, rn) => sum + rn.lineItems.reduce((s, l) => s + l.quantity, 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Return notes"
        description="Delivered-but-not-yet-invoiced goods returned by a customer — created from a posted Delivery Note. Reverses stock and cost back into Inventory; no revenue, VAT, AR or refund is ever created here."
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Posted" value={String(posted.length)} hint="Physically returned" />
          <FigureBlock label="Draft" value={String(drafts.length)} hint="Not yet posted" tone={drafts.length > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Units returned" value={fmtQty(totalUnitsReturned)} hint="Across posted return notes" />
          <FigureBlock label="Total" value={String(returnNotes.length)} hint="All return notes" />
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search RN #, customer, delivery note…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
        />
        <div className="flex items-center gap-1">
          {(['all', 'draft', 'posted', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={
                'rounded-md px-3 py-1.5 text-sm capitalize ' +
                (statusFilter === s ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-muted')
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading return notes…</p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <p className="text-sm">No return notes yet.</p>
          <p className="text-xs">Create one from an eligible posted Delivery Note.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">RN number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Delivery note</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rn) => {
                const dn = dnByIdMap.get(rn.deliveryNoteId);
                const qty = rn.lineItems.reduce((s, l) => s + l.quantity, 0);
                return (
                  <tr
                    key={rn.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
                    onClick={() => navigate(`/sales/return-notes/${rn.id}`)}
                  >
                    <td className="px-4 py-2 font-medium text-brand">{rn.returnNoteNumber}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(rn.returnDate)}</td>
                    <td className="px-4 py-2">{customerMap.get(rn.customerId) ?? 'Unknown customer'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{dn?.deliveryNoteNumber ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtQty(qty)}</td>
                    <td className="px-4 py-2"><StatusBadge status={rn.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
