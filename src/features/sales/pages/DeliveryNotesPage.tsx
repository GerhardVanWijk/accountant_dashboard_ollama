import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

/**
 * Delivery Notes list — route `/sales/delivery-notes` (Phase 5C, Part 13).
 * Read-only: a Delivery Note is always created FROM an eligible confirmed
 * Sales Order (`SalesOrderDetailPage`'s "Create delivery" action, Part 10) —
 * there is no standalone "New" button here, matching the design's own
 * SO-originated creation model.
 */
export function DeliveryNotesPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted' | 'cancelled'>('all');
  const [query, setQuery] = useState('');

  const { deliveryNotes, isLoading, error } = useDeliveryNotes();
  const { salesOrders } = useSalesOrders();
  const { customers: customerMap } = useCustomerMap();
  const { warehouses } = useWarehouses();

  const soByIdMap = useMemo(() => new Map(salesOrders.map((o) => [o.id, o])), [salesOrders]);
  const warehouseByIdMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deliveryNotes
      .filter((dn) => statusFilter === 'all' || dn.status === statusFilter)
      .filter((dn) => {
        if (!q) return true;
        const so = soByIdMap.get(dn.salesOrderId);
        const customerName = customerMap.get(dn.customerId) ?? '';
        return (
          dn.deliveryNoteNumber.toLowerCase().includes(q) ||
          customerName.toLowerCase().includes(q) ||
          (so?.orderNumber ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
  }, [deliveryNotes, statusFilter, query, soByIdMap, customerMap]);

  const posted = deliveryNotes.filter((d) => d.status === 'posted');
  const drafts = deliveryNotes.filter((d) => d.status === 'draft');
  const totalUnitsDelivered = posted.reduce((sum, dn) => sum + dn.lineItems.reduce((s, l) => s + l.quantity, 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Delivery notes"
        description="Physical dispatch evidence for confirmed Sales Orders — created from the Sales Order, posting moves stock and freezes cost. No revenue, VAT or receivable is created here."
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Posted" value={String(posted.length)} hint="Physically departed" />
          <FigureBlock label="Draft" value={String(drafts.length)} hint="Not yet posted" tone={drafts.length > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Units delivered" value={fmtQty(totalUnitsDelivered)} hint="Across posted delivery notes" />
          <FigureBlock label="Total" value={String(deliveryNotes.length)} hint="All delivery notes" />
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search DN #, customer, sales order…"
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
          <p className="text-sm">Loading delivery notes…</p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <p className="text-sm">No delivery notes yet.</p>
          <p className="text-xs">Create one from an eligible confirmed Sales Order.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">DN number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Sales order</th>
                <th className="px-4 py-2 font-medium">Warehouse</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dn) => {
                const so = soByIdMap.get(dn.salesOrderId);
                const warehouse = warehouseByIdMap.get(dn.warehouseId);
                const qty = dn.lineItems.reduce((s, l) => s + l.quantity, 0);
                return (
                  <tr
                    key={dn.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
                    onClick={() => navigate(`/sales/delivery-notes/${dn.id}`)}
                  >
                    <td className="px-4 py-2 font-medium text-brand">{dn.deliveryNoteNumber}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(dn.deliveryDate)}</td>
                    <td className="px-4 py-2">{customerMap.get(dn.customerId) ?? 'Unknown customer'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{so?.orderNumber ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{warehouse?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtQty(qty)}</td>
                    <td className="px-4 py-2"><StatusBadge status={dn.status} /></td>
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
