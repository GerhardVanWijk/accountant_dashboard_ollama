import { useEffect, useMemo, useState } from 'react';
import type { Invoice, SalesOrder } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Input } from '@/components/ui/shadcn/input';
import { formatCurrency } from '@/lib/app/format';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockCommitments } from '@/features/inventory/hooks/useStockCommitments';
import { getCommittedForProduct } from '@/features/inventory/services/stockCommitmentService';
import {
  computeSalesOrderFulfilment,
  isValidSelectionQuantity,
  QUANTITY_DECIMALS,
  round2,
  type SalesOrderInvoiceSelection,
} from '@/features/sales/utils/salesOrderFulfilment';

export interface PartialInvoicePickerProps {
  open: boolean;
  onClose: () => void;
  order: SalesOrder;
  /** The full invoice list — the picker re-derives remaining quantities from it. */
  invoices: readonly Invoice[];
  customerName: string;
  /** Server error from the last create attempt, if any. */
  error?: string | null;
  submitting?: boolean;
  onSubmit: (selections: SalesOrderInvoiceSelection[]) => Promise<void> | void;
}

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: QUANTITY_DECIMALS });

interface RowState {
  include: boolean;
  qty: string;
}

/**
 * Phase 5B.2 — a large, in-context modal for creating a DRAFT invoice from a
 * chosen subset of a Sales Order's remaining line quantities.
 *
 * The service (`createInvoiceFromSalesOrder`) is the authority: this picker
 * only sends `{ salesOrderLineId, quantity }`. Every price / product / tax /
 * total is derived server-side from the SO line. Client validation here is a
 * convenience — it never clamps silently and the service re-validates.
 */
export function PartialInvoicePicker({
  open,
  onClose,
  order,
  invoices,
  customerName,
  error,
  submitting = false,
  onSubmit,
}: PartialInvoicePickerProps) {
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { commitments } = useStockCommitments();

  const fulfilment = useMemo(() => computeSalesOrderFulfilment(order, invoices), [order, invoices]);
  const lineById = useMemo(() => new Map(order.lineItems.map((l) => [l.id, l])), [order.lineItems]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const defaultWarehouse = warehouses.find((w) => w.isDefault);

  const seededRows = useMemo(() => {
    const m = new Map<string, RowState>();
    for (const l of fulfilment.lines) {
      m.set(l.salesOrderLineId, {
        include: l.remainingToInvoiceQty > 0,
        qty: l.remainingToInvoiceQty > 0 ? String(l.remainingToInvoiceQty) : '0',
      });
    }
    return m;
  }, [fulfilment]);

  // Row state keyed by salesOrderLineId — reset to the "all remaining" default
  // every time the modal opens.
  const [rows, setRows] = useState<Map<string, RowState>>(seededRows);
  useEffect(() => {
    if (open) setRows(seededRows);
  }, [open, seededRows]);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = new Map(prev);
      next.set(id, { ...(next.get(id) ?? { include: false, qty: '0' }), ...patch });
      return next;
    });
  }

  function invoiceAllRemaining() {
    setRows(seededRows);
  }

  function clearAll() {
    setRows((prev) => {
      const next = new Map<string, RowState>();
      for (const [id, r] of prev) next.set(id, { ...r, include: false });
      return next;
    });
  }

  interface EvaluatedRow {
    lineId: string;
    remaining: number;
    included: boolean;
    parsedQty: number | null;
    lineError: string | null;
    lineTotal: number;
    taxAmount: number;
  }

  const evaluated: EvaluatedRow[] = fulfilment.lines.map((l) => {
    const soLine = lineById.get(l.salesOrderLineId)!;
    const state = rows.get(l.salesOrderLineId) ?? { include: false, qty: '0' };
    const remaining = l.remainingToInvoiceQty;
    const raw = state.qty.trim();
    const parsed = raw === '' ? Number.NaN : Number(raw);
    let lineError: string | null = null;
    let parsedQty: number | null = null;

    if (state.include) {
      if (remaining <= 0) {
        lineError = 'Fully invoiced — nothing left to invoice.';
      } else if (!isValidSelectionQuantity(parsed)) {
        lineError = Number.isNaN(parsed)
          ? 'Enter a quantity greater than zero.'
          : parsed <= 0
            ? 'Quantity must be greater than zero.'
            : `Maximum ${QUANTITY_DECIMALS} decimal places.`;
      } else if (parsed > remaining + 1e-6) {
        lineError = `Only ${fmtQty(remaining)} remain to invoice.`;
      } else {
        parsedQty = parsed;
      }
    }

    const rate = (soLine.lineTotal ?? 0) > 0 ? (soLine.taxAmount ?? 0) / (soLine.lineTotal as number) : 0;
    const isWhole = parsedQty != null && Math.abs(parsedQty - (soLine.quantity ?? 0)) <= 1e-6;
    const lineTotal = parsedQty == null ? 0 : isWhole ? round2(soLine.lineTotal ?? 0) : round2(parsedQty * (soLine.unitPrice ?? 0));
    const taxAmount = parsedQty == null ? 0 : isWhole ? round2(soLine.taxAmount ?? 0) : round2(lineTotal * rate);

    return { lineId: l.salesOrderLineId, remaining, included: state.include, parsedQty, lineError, lineTotal, taxAmount };
  });

  const selections: SalesOrderInvoiceSelection[] = evaluated
    .filter((e) => e.included && e.parsedQty != null)
    .map((e) => ({ salesOrderLineId: e.lineId, quantity: e.parsedQty as number }));

  const anyLineError = evaluated.some((e) => e.included && e.lineError);
  const subtotal = round2(evaluated.reduce((s, e) => s + e.lineTotal, 0));
  const taxTotal = round2(evaluated.reduce((s, e) => s + e.taxAmount, 0));
  const total = round2(subtotal + taxTotal);
  const canSubmit = selections.length > 0 && !anyLineError && !submitting;

  const previouslyInvoicedValue = useMemo(() => {
    // Σ of posted linked invoice totals — informational header figure.
    return round2(
      invoices
        .filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void' && inv.status !== 'draft')
        .reduce((s, inv) => s + inv.total, 0),
    );
  }, [invoices, order.id]);

  async function handleSubmit() {
    if (!canSubmit) return;
    await onSubmit(selections);
  }

  const showWarehouse = warehouses.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onClose(); }}>
      <DialogContent className="max-h-[calc(100%-2rem)] gap-0 p-0 sm:max-w-5xl lg:max-w-6xl" showCloseButton={false}>
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <DialogTitle className="text-base">Create invoice from sales order</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="figure font-medium text-foreground">{order.orderNumber}</span> · {customerName}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
            <div><dt className="text-muted-foreground">Order total</dt><dd className="font-medium">{formatCurrency(order.total)}</dd></div>
            <div><dt className="text-muted-foreground">Previously invoiced</dt><dd className="font-medium">{formatCurrency(previouslyInvoicedValue)}</dd></div>
            <div><dt className="text-muted-foreground">Remaining value</dt><dd className="font-medium">{formatCurrency(round2(order.total - previouslyInvoicedValue))}</dd></div>
          </dl>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={invoiceAllRemaining} disabled={submitting}>
              Invoice all remaining
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={submitting}>
              Clear all
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Product / description</th>
                  {showWarehouse && <th className="px-3 py-2 font-medium">Warehouse</th>}
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Invoiced</th>
                  <th className="px-3 py-2 text-right font-medium">In draft</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                  <th className="px-3 py-2 text-right font-medium">Invoice now</th>
                  <th className="px-3 py-2 text-right font-medium">Unit price</th>
                  <th className="px-3 py-2 text-right font-medium">VAT</th>
                  <th className="px-3 py-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {fulfilment.lines.map((l) => {
                  const soLine = lineById.get(l.salesOrderLineId)!;
                  const ev = evaluated.find((e) => e.lineId === l.salesOrderLineId)!;
                  const state = rows.get(l.salesOrderLineId) ?? { include: false, qty: '0' };
                  const product = soLine.productId ? productById.get(soLine.productId) : undefined;
                  const fullyInvoiced = l.remainingToInvoiceQty <= 0;
                  const wh = soLine.warehouseId ? warehouseById.get(soLine.warehouseId) : defaultWarehouse;
                  const onHand = product?.quantityOnHand;
                  const committed = product ? getCommittedForProduct(commitments, product.id) : 0;

                  return (
                    <tr key={l.salesOrderLineId} className="border-b border-border/60 align-top last:border-0">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={state.include}
                          disabled={fullyInvoiced || submitting}
                          onCheckedChange={(v) => setRow(l.salesOrderLineId, { include: v === true })}
                          aria-label={`Include ${soLine.description || 'line'} in this invoice`}
                        />
                      </td>
                      <td className="max-w-[22rem] px-3 py-3">
                        <div className="font-medium break-words">{soLine.description || '—'}</div>
                        {product && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            <span className="figure">{product.sku}</span>
                            {onHand != null && (
                              <> · On hand {fmtQty(onHand)} · Committed {fmtQty(committed)} · Available {fmtQty(onHand - committed)}</>
                            )}
                          </div>
                        )}
                        {fullyInvoiced && (
                          <div className="mt-0.5 text-xs font-medium text-status-positive">Fully invoiced</div>
                        )}
                        {ev.lineError && (
                          <div role="alert" className="mt-1 text-xs text-status-warning">{ev.lineError}</div>
                        )}
                      </td>
                      {showWarehouse && (
                        <td className="px-3 py-3 text-xs text-muted-foreground">{wh?.name ?? '—'}</td>
                      )}
                      <td className="px-3 py-3 text-right tabular-nums">{fmtQty(l.orderedQty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtQty(l.postedFulfilledQty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtQty(l.draftInvoicedQty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">{fmtQty(l.remainingToInvoiceQty)}</td>
                      <td className="px-3 py-3 text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          className="ml-auto w-24 text-right"
                          value={state.qty}
                          disabled={!state.include || fullyInvoiced || submitting}
                          onChange={(e) => setRow(l.salesOrderLineId, { qty: e.target.value })}
                          aria-label={`Quantity to invoice for ${soLine.description || 'line'}`}
                          aria-invalid={Boolean(ev.lineError)}
                        />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(soLine.unitPrice)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(ev.taxAmount)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">{formatCurrency(ev.lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            This creates a <strong>draft</strong> invoice. Nothing moves in stock or the ledger until you post it —
            stock availability is re-checked at posting time.
          </p>

          {error && (
            <div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
            <div><dt className="text-xs text-muted-foreground">Subtotal</dt><dd className="font-medium">{formatCurrency(subtotal)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">VAT</dt><dd className="font-medium">{formatCurrency(taxTotal)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Invoice total</dt><dd className="text-base font-bold">{formatCurrency(total)}</dd></div>
          </dl>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create draft invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
