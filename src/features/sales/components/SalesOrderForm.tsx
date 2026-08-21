import { useState } from 'react';
import type { Customer, SalesOrder } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreateSalesOrderDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
 * Sales Order create/edit form. Sales Orders never post to the GL — this
 * only builds and validates the CreateSalesOrderDTO payload for
 * salesOrderService.createSalesOrder() / updateSalesOrder().
 */
export function SalesOrderForm({ customers, salesOrder, defaultOrderNumber, onSubmit, onCancel }: SalesOrderFormProps) {
  const { taxRates } = useTaxRates();
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

  async function handleSubmit() {
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
    <div className="flex flex-col gap-lg">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Order Number</span>
          <input className={`${inputClass} font-mono`} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Customer</span>
          <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Order Date</span>
          <input type="date" className={inputClass} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </label>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} />

      <div className="grid grid-cols-3 gap-md rounded-md border border-border bg-background p-md text-sm">
        <div>
          <div className="text-xs text-text-muted">Subtotal</div>
          <FinancialNumber value={subtotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Tax</div>
          <FinancialNumber value={taxTotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Total</div>
          <FinancialNumber value={total} format={formatCurrency} className="text-base font-semibold" />
        </div>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Notes (optional)</span>
        <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : salesOrder ? 'Save Sales Order' : 'Create Sales Order'}
        </Button>
      </div>
    </div>
  );
}
