import { useMemo, useState } from 'react';
import type { Customer, SalesOrder } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { CustomerCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateSalesOrderDTO } from '../services';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockBalances } from '@/features/inventory/hooks/useStockBalances';
import { useStockCommitments } from '@/features/inventory/hooks/useStockCommitments';
import {
  externalCommittedFor as resolveExternalCommitted,
  ownCommitmentMap,
} from '@/features/inventory/services/stockCommitmentService';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { sumPhysicallyIssuedBySalesOrderLine } from '@/features/sales/utils/salesOrderFulfilment';

export interface SalesOrderFormProps {
  customers: Customer[];
  salesOrder?: SalesOrder;
  defaultOrderNumber: string;
  onSubmit: (data: CreateSalesOrderDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sales Order create/edit form — same fields/validation/submit shape as
 * before the port, JSX re-skinned onto v0's Field/Input primitives and the
 * v0-styled SalesLineItemsEditor. Sales Orders never post to the GL — this
 * only builds and validates the CreateSalesOrderDTO payload for
 * salesOrderService.createSalesOrder()/updateSalesOrder(). `quoteId` is
 * carried over unchanged when editing an order that came from a converted
 * quote; there is no picker for it here since a sales order is never
 * manually linked to a quote after the fact.
 */
export function SalesOrderForm({ customers, salesOrder, defaultOrderNumber, onSubmit, onCancel, onDirtyChange }: SalesOrderFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { balances } = useStockBalances();
  const { commitments } = useStockCommitments();
  const { invoices } = useInvoices();
  const { deliveryNotes } = useDeliveryNotes();

  /**
   * Derived stock commitment (Phase 5A) — units of a product committed to
   * confirmed sales orders. Scoped to the line's warehouse when it has one,
   * else summed across warehouses. Read-only signal for the line editor's
   * stock caption; never reserves stock or blocks submit.
   *
   * Document-context correction: when this form is editing an already
   * `confirmed` order, the global `commitments` map already contains that
   * order's own quantities. `ownCommitmentMap` recomputes the persisted
   * order's contribution (empty in create mode / for a non-confirmed status)
   * and `resolveExternalCommitted` subtracts it, so a confirmed order never
   * competes with itself in its own line editor. The global map / register /
   * product detail / reports are untouched.
   */
  const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id;
  // Phase 5C: net the persisted order's own physical-departure progress
  // (delivered + directly invoiced), matching what the global commitment map
  // (`StockCommitmentService`) now counts — same formula, same source data.
  const fulfilledByLine = useMemo(
    () => sumPhysicallyIssuedBySalesOrderLine(invoices, deliveryNotes),
    [invoices, deliveryNotes],
  );
  const ownCommitments = useMemo(
    () => ownCommitmentMap(salesOrder, defaultWarehouseId, fulfilledByLine),
    [salesOrder, defaultWarehouseId, fulfilledByLine],
  );
  const externalCommittedFor = (productId: string, warehouseId?: string) =>
    resolveExternalCommitted(commitments, ownCommitments, productId, warehouseId);
  const onHandFor = (productId: string, warehouseId?: string) =>
    warehouseId
      ? balances.find((b) => b.productId === productId && b.warehouseId === warehouseId)?.quantityOnHand
      : undefined;
  const [orderNumber, setOrderNumber] = useState(salesOrder?.orderNumber ?? defaultOrderNumber);
  const [customerId, setCustomerId] = useState(salesOrder?.customerId ?? customers[0]?.id ?? '');
  const [orderDate, setOrderDate] = useState(salesOrder ? salesOrder.orderDate.slice(0, 10) : today());
  const [notes, setNotes] = useState(salesOrder?.notes ?? '');
  const [lineItems, setLineItems] = useState<CreateSalesOrderDTO['lineItems']>(
    salesOrder?.lineItems ?? [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 }],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!orderNumber.trim()) return setFormError('Order number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        orderNumber: orderNumber.trim(),
        customerId,
        quoteId: salesOrder?.quoteId,
        orderDate,
        lineItems,
        subtotal,
        taxTotal,
        total,
        currency: 'ZAR',
        status: salesOrder?.status ?? 'pending',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save sales order.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="order-number">Order number</FieldLabel>
          <Input
            id="order-number"
            className="figure"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            disabled={isSubmitting}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="order-customer">Customer</FieldLabel>
          <CustomerCombobox
            id="order-customer"
            customers={customers}
            value={customerId || null}
            onChange={(v) => setCustomerId(v ?? '')}
            disabled={isSubmitting}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="order-date">Order date</FieldLabel>
          <Input
            id="order-date"
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <SalesLineItemsEditor
        lineItems={lineItems}
        onChange={setLineItems}
        taxRates={taxRates}
        products={products}
        warehouses={warehouses}
        showStockAvailability
        externalCommittedFor={externalCommittedFor}
        onHandFor={onHandFor}
        disabled={isSubmitting}
      />

      <div className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Subtotal</div>
          <Amount value={subtotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tax</div>
          <Amount value={taxTotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <Amount value={total} className="text-base font-semibold" />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="order-notes">Notes (optional)</FieldLabel>
        <Textarea id="order-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isSubmitting} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : salesOrder ? 'Save sales order' : 'Create sales order'}
        </Button>
      </FormFooter>
    </form>
  );
}
