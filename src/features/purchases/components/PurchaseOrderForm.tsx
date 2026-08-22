import { useState } from 'react';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreatePurchaseOrderDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface PurchaseOrderFormProps {
  suppliers: Supplier[];
  defaultPoNumber: string;
  onSubmit: (data: CreatePurchaseOrderDTO) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Purchase Order create form. POs never post to the GL (only Bills do,
 * per this dispatch's brief) — this only builds and validates the
 * CreatePurchaseOrderDTO payload for purchaseOrderService.createPurchaseOrder().
 */
export function PurchaseOrderForm({ suppliers, defaultPoNumber, onSubmit, onCancel }: PurchaseOrderFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const [poNumber, setPoNumber] = useState(defaultPoNumber);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreatePurchaseOrderDTO['lineItems']>([
    { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!poNumber.trim()) return setFormError('PO number is required.');
    if (!supplierId) return setFormError('Select a supplier.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        poNumber: poNumber.trim(),
        supplierId,
        orderDate,
        expectedDate: expectedDate || undefined,
        lineItems,
        subtotal,
        taxTotal,
        total,
        currency: 'ZAR',
        status: 'draft',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save purchase order.');
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
          <span className="font-medium text-text-primary">PO Number</span>
          <input className={`${inputClass} font-mono`} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Supplier</span>
          <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Order Date</span>
          <input type="date" className={inputClass} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Expected Date (optional)</span>
          <input
            type="date"
            className={inputClass}
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </label>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} />

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
          {isSubmitting ? 'Saving…' : 'Create Purchase Order'}
        </Button>
      </div>
    </div>
  );
}
