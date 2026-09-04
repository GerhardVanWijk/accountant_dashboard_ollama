import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox/EnumSelect';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useDeliveryNoteMutations } from '@/features/sales/hooks/useDeliveryNoteMutations';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { computeSalesOrderFulfilment } from '@/features/sales/utils/salesOrderFulfilment';
import type { CreateDeliveryNoteLineDTO } from '@/features/sales/services';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });
const inputClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums';

/**
 * Full-page "Create delivery" form — route `/sales/orders/:orderId/deliver`
 * (Phase 5C, Part 10). Deliberately NOT a modal/side-sheet, per the
 * explicit instruction to follow the same full-page UX direction as the
 * Sales Order / Invoice / Purchase Order / Item forms.
 */
export function CreateDeliveryNotePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const { salesOrders, isLoading: soLoading } = useSalesOrders();
  const { invoices, loading: invLoading } = useInvoices();
  const { deliveryNotes, isLoading: dnLoading } = useDeliveryNotes();
  const { customers: customerMap } = useCustomerMap();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { createDraft, isLoading: submitting } = useDeliveryNoteMutations();

  const order = salesOrders.find((o) => o.id === orderId);
  const fulfilment = useMemo(
    () => (order ? computeSalesOrderFulfilment(order, invoices, deliveryNotes) : undefined),
    [order, invoices, deliveryNotes],
  );

  const [warehouseId, setWarehouseId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loading = soLoading || invLoading || dnLoading || warehousesLoading;
  const customerName = order ? customerMap.get(order.customerId) ?? 'Unknown customer' : '';

  const deliverableLines = useMemo(() => {
    if (!order || !fulfilment) return [];
    return order.lineItems
      .filter((l) => l.productId)
      .map((l) => {
        const f = fulfilment.lines.find((fl) => fl.salesOrderLineId === l.id);
        return {
          id: l.id,
          description: l.description,
          orderedQty: f?.orderedQty ?? l.quantity,
          deliveredQty: f?.deliveredQty ?? 0,
          remainingToDeliver: f?.remainingToDeliver ?? 0,
        };
      })
      .filter((l) => l.remainingToDeliver > 1e-6);
  }, [order, fulfilment]);

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  function setQty(lineId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!order) return;
    if (!warehouseId) {
      setFormError('Select a warehouse.');
      return;
    }
    const lines: CreateDeliveryNoteLineDTO[] = deliverableLines
      .map((l) => ({ salesOrderLineId: l.id, quantity: Number(quantities[l.id] ?? l.remainingToDeliver) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      setFormError('Enter a quantity greater than zero for at least one line.');
      return;
    }
    try {
      const dn = await createDraft({
        salesOrderId: order.id,
        warehouseId,
        deliveryDate: new Date(deliveryDate).toISOString(),
        lines,
        notes: notes.trim() || undefined,
      });
      navigate(`/sales/delivery-notes/${dn.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the delivery note.');
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

  if (!order) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm">Sales order not found.</p>
      </div>
    );
  }

  if (order.status !== 'confirmed') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm">Only a confirmed sales order can be delivered against (current status: {order.status}).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Create delivery — ${order.orderNumber}`}
        description={`${customerName} · deliver against the remaining ordered quantity. Posting stock and cost happens later, from the delivery note itself.`}
      />

      <SectionCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dn-warehouse" className="text-sm font-medium">Warehouse</label>
            <EnumSelect
              id="dn-warehouse"
              options={warehouseOptions}
              value={warehouseId}
              onValueChange={setWarehouseId}
              placeholder="Select warehouse…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dn-date" className="text-sm font-medium">Delivery date</label>
            <input id="dn-date" type="date" className={inputClass} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="mb-3 text-sm font-medium">Lines to deliver</h2>
        {deliverableLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every line on this order has already been fully delivered or directly invoiced.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 text-right font-medium">Ordered</th>
                  <th className="py-2 pr-3 text-right font-medium">Delivered</th>
                  <th className="py-2 pr-3 text-right font-medium">Remaining</th>
                  <th className="py-2 text-right font-medium">Deliver now</th>
                </tr>
              </thead>
              <tbody>
                {deliverableLines.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{l.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.orderedQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.deliveredQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(l.remainingToDeliver)}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={l.remainingToDeliver}
                        step="0.001"
                        className={`${inputClass} w-28 text-right`}
                        value={quantities[l.id] ?? String(l.remainingToDeliver)}
                        onChange={(e) => setQty(l.id, e.target.value)}
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
          <label htmlFor="dn-notes" className="text-sm font-medium">Notes (optional)</label>
          <textarea
            id="dn-notes"
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
        <Button onClick={() => void handleSubmit()} disabled={submitting || deliverableLines.length === 0}>
          {submitting ? 'Creating…' : 'Create delivery note (draft)'}
        </Button>
        <Button variant="outline" onClick={() => navigate(`/sales/orders/${order.id}`)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
