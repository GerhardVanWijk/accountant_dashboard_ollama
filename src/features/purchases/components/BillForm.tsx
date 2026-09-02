import { useState } from 'react';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { SupplierCombobox } from '@/components/app/combobox';
import { FigureBlock } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import type { CreateBillDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

export interface BillFormProps {
  suppliers: Supplier[];
  defaultBillNumber: string;
  onSubmit: (data: CreateBillDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Standalone Bill create form — the only route into `billService.createBill()`
 * for a bill with no purchase order behind it. Draft only, posted
 * separately via BillDetail's "Post Bill" action so
 * `billService.postBill()`'s GL/Inventory-capitalization logic always
 * runs through the real service. Re-skinned onto v0's Field/Input (M8);
 * `LineItemsEditor` (shared with Sales/Purchases) is untouched — same
 * totals computation, same tax-rate/product/warehouse wiring.
 */
export function BillForm({ suppliers, defaultBillNumber, onSubmit, onCancel, onDirtyChange }: BillFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const [billNumber, setBillNumber] = useState(defaultBillNumber);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(plusDays(30));
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreateBillDTO['lineItems']>([
    { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!billNumber.trim()) return setFormError('Bill number is required.');
    if (!supplierId) return setFormError('Select a supplier.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        billNumber: billNumber.trim(),
        supplierId,
        issueDate,
        dueDate,
        lineItems,
        subtotal,
        taxTotal,
        total,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save bill.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="bill-number">Bill Number</FieldLabel>
          <Input id="bill-number" className="font-mono" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bill-supplier">Supplier</FieldLabel>
          <SupplierCombobox
            id="bill-supplier"
            suppliers={suppliers}
            value={supplierId || null}
            onChange={(v) => setSupplierId(v ?? '')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="bill-issue-date">Issue Date</FieldLabel>
          <Input id="bill-issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bill-due-date">Due Date</FieldLabel>
          <Input id="bill-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} allowFixedAssetCapitalization />

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <FigureBlock label="Subtotal" value={formatCurrency(subtotal)} className="text-base" />
        <FigureBlock label="Tax" value={formatCurrency(taxTotal)} className="text-base" />
        <FigureBlock label="Total" value={formatCurrency(total)} className="text-base" />
      </div>

      <Field>
        <FieldLabel htmlFor="bill-notes">Notes (optional)</FieldLabel>
        <Textarea id="bill-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create Bill'}
        </Button>
      </FormFooter>
    </div>
  );
}
