import { useState } from 'react';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { SupplierCombobox, SearchableSelect } from '@/components/app/combobox';
import { FigureBlock } from '@/components/app/figure';
import { FormBody, FormFooter, FormGrid } from '@/components/app/form';
import { FieldDescription } from '@/components/ui/shadcn/field';
import { formatCurrency } from '@/lib/app/format';
import { newUuid } from '@/lib/uuid';
import type { CreateBillDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useLeases } from '@/features/leases/hooks/useLeases';

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
  const { leases } = useLeases();
  const leaseOptions = leases.filter((l) => l.status === 'active');
  const [billNumber, setBillNumber] = useState(defaultBillNumber);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [leasePeriodEnd, setLeasePeriodEnd] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(plusDays(30));
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreateBillDTO['lineItems']>([
    { id: newUuid(), description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!billNumber.trim()) return setFormError('Supplier invoice number is required.');
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
        leaseId: leaseId ?? undefined,
        leasePeriodEnd: leaseId && leasePeriodEnd ? leasePeriodEnd : undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save supplier invoice.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <FormGrid className="max-w-3xl">
        <Field>
          <FieldLabel htmlFor="bill-number">Supplier Invoice Number</FieldLabel>
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
        {leaseOptions.length > 0 && (
          <Field>
            <FieldLabel htmlFor="bill-lease">Related Lease (optional)</FieldLabel>
            <SearchableSelect
              id="bill-lease"
              value={leaseId}
              onChange={setLeaseId}
              options={leaseOptions.map((l) => ({ value: l.id, label: `${l.leaseNumber} — ${l.assetDescription}`, keywords: l.lessorName }))}
              placeholder="None"
            />
            <FieldDescription>
              Tag this Bill as a VAT-bearing lessor tax invoice for a lease. Code the net expense line to 2460 Lease
              Payment Clearing to settle against the lease's IFRS 16 amortisation — this does not itself post any
              lease liability or ROU asset movement.
            </FieldDescription>
          </Field>
        )}
        {leaseId && (
          <Field>
            <FieldLabel htmlFor="bill-lease-period">Lease Period (optional)</FieldLabel>
            <Input id="bill-lease-period" type="date" value={leasePeriodEnd} onChange={(e) => setLeasePeriodEnd(e.target.value)} />
            <FieldDescription>
              Only if this invoice corresponds to ONE specific amortisation period — leave blank for an upfront,
              multi-period, or catch-up charge that doesn't map to a single month. Never required.
            </FieldDescription>
          </Field>
        )}
      </FormGrid>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} allowFixedAssetCapitalization />

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <FigureBlock label="Subtotal" value={formatCurrency(subtotal)} className="text-base" />
        <FigureBlock label="Tax" value={formatCurrency(taxTotal)} className="text-base" />
        <FigureBlock label="Total" value={formatCurrency(total)} className="text-base" />
      </div>

      <Field className="max-w-3xl">
        <FieldLabel htmlFor="bill-notes">Notes (optional)</FieldLabel>
        <Textarea id="bill-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create supplier invoice'}
        </Button>
      </FormFooter>
    </div>
  );
}
