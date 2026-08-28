import { useState } from 'react';
import type { Customer, SalesOrder } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { Amount } from '@/components/app/figure';
import type { CreateSalesOrderDTO } from '../services';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

export interface SalesOrderFormProps {
  customers: Customer[];
  salesOrder?: SalesOrder;
  defaultOrderNumber: string;
  onSubmit: (data: CreateSalesOrderDTO) => Promise<void>;
  onCancel: () => void;
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
export function SalesOrderForm({ customers, salesOrder, defaultOrderNumber, onSubmit, onCancel }: SalesOrderFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

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
          <NativeSelect
            id="order-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
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

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : salesOrder ? 'Save sales order' : 'Create sales order'}
        </Button>
      </div>
    </form>
  );
}
