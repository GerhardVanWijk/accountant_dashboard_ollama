import { useState } from 'react';
import type { Customer, CreditNoteReason, Invoice } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { CustomerCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateCreditNoteDTO } from '../services';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

const REASON_OPTIONS: { value: CreditNoteReason; label: string }[] = [
  { value: 'return', label: 'Returned goods' },
  { value: 'pricing_error', label: 'Pricing error' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

export interface CreditNoteFormProps {
  customers: Customer[];
  /** All invoices, so the user can optionally tie this credit note to one issued against the selected customer. */
  invoices: Invoice[];
  defaultCreditNoteNumber: string;
  onSubmit: (data: CreateCreditNoteDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Credit Note create form — same fields/validation/submit shape as before
 * the port. Only builds and validates the CreateCreditNoteDTO payload — it
 * stays in 'draft' until the Detail view's "Issue credit note" action
 * posts it via creditNoteService.issueCreditNote().
 */
export function CreditNoteForm({ customers, invoices, defaultCreditNoteNumber, onSubmit, onCancel, onDirtyChange }: CreditNoteFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const [creditNoteNumber, setCreditNoteNumber] = useState(defaultCreditNoteNumber);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(today());
  const [reason, setReason] = useState<CreditNoteReason>('return');
  /**
   * Free-text explanation shown and required when `reason === 'other'`
   * (docs brief Part I). Persisted to its own `credit_notes.reason_details`
   * column (migration 0043) — kept distinct from `notes`.
   */
  const [reasonDetail, setReasonDetail] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreateCreditNoteDTO['lineItems']>([
    { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const customerInvoices = invoices.filter((inv) => inv.customerId === customerId);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!creditNoteNumber.trim()) return setFormError('Credit note number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (reason === 'other' && !reasonDetail.trim()) {
      return setFormError('Specify the reason for this credit note.');
    }
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        creditNoteNumber: creditNoteNumber.trim(),
        customerId,
        invoiceId: invoiceId || undefined,
        issueDate,
        reason,
        reasonDetails: reason === 'other' ? reasonDetail.trim() : undefined,
        lineItems,
        subtotal,
        taxTotal,
        total,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save credit note.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cn-number">Credit note number</FieldLabel>
          <Input id="cn-number" className="figure" value={creditNoteNumber} onChange={(e) => setCreditNoteNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-customer">Customer</FieldLabel>
          <CustomerCombobox
            id="cn-customer"
            customers={customers}
            value={customerId || null}
            onChange={(v) => {
              setCustomerId(v ?? '');
              setInvoiceId('');
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-invoice">Against invoice (optional)</FieldLabel>
          <NativeSelect id="cn-invoice" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Standalone account credit</option>
            {customerInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-reason">Reason</FieldLabel>
          <NativeSelect id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value as CreditNoteReason)}>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="cn-issue-date">Issue date</FieldLabel>
          <Input id="cn-issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        {reason === 'other' && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="cn-reason-detail">Specify reason</FieldLabel>
            <Textarea
              id="cn-reason-detail"
              rows={2}
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Explain why this credit note is being raised"
              aria-label="Specify reason"
            />
          </Field>
        )}
      </div>

      <SalesLineItemsEditor lineItems={lineItems} onChange={setLineItems} taxRates={taxRates} products={products} warehouses={warehouses} />

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
          <div className="text-xs text-muted-foreground">Total credit</div>
          <Amount value={total} className="text-base font-semibold" />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="cn-notes">Notes (optional)</FieldLabel>
        <Textarea id="cn-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create credit note'}
        </Button>
      </FormFooter>
    </div>
  );
}
