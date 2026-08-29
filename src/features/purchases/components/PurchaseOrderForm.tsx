import { useState } from 'react';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FigureBlock } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import type { CreatePurchaseOrderDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

export interface PurchaseOrderFormProps {
  suppliers: Supplier[];
  defaultPoNumber: string;
  onSubmit: (data: CreatePurchaseOrderDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Purchase Order create form. POs never post to the GL (only Bills do) —
 * this only builds and validates the CreatePurchaseOrderDTO payload for
 * purchaseOrderService.createPurchaseOrder(). Re-skinned onto v0's
 * Field/Input (M8); `LineItemsEditor` untouched.
 */
export function PurchaseOrderForm({ suppliers, defaultPoNumber, onSubmit, onCancel, onDirtyChange }: PurchaseOrderFormProps) {
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="po-number">PO Number</FieldLabel>
          <Input id="po-number" className="font-mono" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="po-supplier">Supplier</FieldLabel>
          <NativeSelect id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="po-order-date">Order Date</FieldLabel>
          <Input id="po-order-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="po-expected-date">Expected Date (optional)</FieldLabel>
          <Input id="po-expected-date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} />

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <FigureBlock label="Subtotal" value={formatCurrency(subtotal)} className="text-base" />
        <FigureBlock label="Tax" value={formatCurrency(taxTotal)} className="text-base" />
        <FigureBlock label="Total" value={formatCurrency(total)} className="text-base" />
      </div>

      <Field>
        <FieldLabel htmlFor="po-notes">Notes (optional)</FieldLabel>
        <Textarea id="po-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create Purchase Order'}
        </Button>
      </FormFooter>
    </div>
  );
}
