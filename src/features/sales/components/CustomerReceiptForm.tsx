import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Customer, Invoice, ReceiptAllocation, ReceiptMethod } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Amount } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';
import type { CreateCustomerReceiptDTO } from '../services';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const METHOD_OPTIONS: { value: ReceiptMethod; label: string }[] = [
  { value: 'eft', label: 'EFT' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

/** Half a cent — tolerance for floating-point rounding, matching CustomerReceiptService. */
const EPSILON = 0.01;

export interface CustomerReceiptFormProps {
  customers: Customer[];
  /** All invoices, filtered per-row to the selected customer's open ones. */
  invoices: Invoice[];
  defaultReceiptNumber: string;
  onSubmit: (data: CreateCustomerReceiptDTO) => Promise<void>;
  onCancel: () => void;
  /**
   * "Record payment" from InvoiceDetail opens THIS form rather than a
   * bespoke one-off — it's the real, GL-posting receipt flow, just
   * pre-aimed at one invoice: customer, amount (the outstanding balance),
   * and a single allocation row are all pre-filled, still fully editable
   * before the user submits.
   */
  presetInvoiceId?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Customer Receipt intake form — same fields/validation/submit shape as
 * before the port, JSX re-skinned onto v0's Field/Input primitives.
 * Recording a receipt IS posting it: customerReceiptService.recordReceipt()
 * posts the balanced journal entry and applies every allocation row in one
 * call, so this form must build a fully-validated
 * CreateCustomerReceiptDTO (amount = sum(allocations) + unallocatedAmount)
 * before submitting.
 */
export function CustomerReceiptForm({
  customers,
  invoices,
  defaultReceiptNumber,
  onSubmit,
  onCancel,
  presetInvoiceId,
}: CustomerReceiptFormProps) {
  const presetInvoice = presetInvoiceId ? invoices.find((inv) => inv.id === presetInvoiceId) : undefined;
  const presetOutstanding = presetInvoice ? Math.max(0, presetInvoice.total - presetInvoice.amountPaid) : 0;

  const [receiptNumber, setReceiptNumber] = useState(defaultReceiptNumber);
  const [customerId, setCustomerId] = useState(presetInvoice?.customerId ?? customers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<ReceiptMethod>('eft');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState<number>(presetOutstanding);
  const [allocations, setAllocations] = useState<ReceiptAllocation[]>(
    presetInvoice ? [{ invoiceId: presetInvoice.id, amount: presetOutstanding }] : [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Only re-applies if the preset invoice itself changes (e.g. the modal is
  // reused for a different invoice without unmounting) — never overwrites
  // what the user has since typed.
  useEffect(() => {
    if (!presetInvoice) return;
    setCustomerId(presetInvoice.customerId);
    setAmount(presetOutstanding);
    setAllocations([{ invoiceId: presetInvoice.id, amount: presetOutstanding }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetInvoiceId]);

  const openInvoices = invoices.filter((inv) => inv.customerId === customerId && inv.total - inv.amountPaid > EPSILON);
  const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
  const unallocatedAmount = Math.max(0, amount - allocatedTotal);

  function addAllocation() {
    const nextInvoice = openInvoices.find((inv) => !allocations.some((a) => a.invoiceId === inv.id));
    setAllocations([...allocations, { invoiceId: nextInvoice?.id ?? '', amount: 0 }]);
  }

  function updateAllocation(index: number, patch: Partial<ReceiptAllocation>) {
    const next = [...allocations];
    next[index] = { ...next[index], ...patch };
    setAllocations(next);
  }

  function removeAllocation(index: number) {
    setAllocations(allocations.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!receiptNumber.trim()) return setFormError('Receipt number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (amount <= 0) return setFormError('Amount must be greater than zero.');
    if (allocations.some((a) => !a.invoiceId)) return setFormError('Every allocation row needs an invoice.');
    if (allocations.some((a) => a.amount <= 0)) return setFormError('Every allocation amount must be greater than zero.');
    if (allocatedTotal - amount > EPSILON) {
      return setFormError(`Allocations (${formatCurrency(allocatedTotal)}) cannot exceed the receipt amount (${formatCurrency(amount)}).`);
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        receiptNumber: receiptNumber.trim(),
        customerId,
        date,
        method,
        reference: reference || undefined,
        amount,
        allocations,
        unallocatedAmount,
        currency: 'ZAR',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record receipt.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="receipt-number">Receipt number</FieldLabel>
          <Input id="receipt-number" className="figure" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-customer">Customer</FieldLabel>
          <select
            id="receipt-customer"
            className={selectClassName}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setAllocations([]);
            }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-date">Date received</FieldLabel>
          <Input id="receipt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-method">Method</FieldLabel>
          <select id="receipt-method" className={selectClassName} value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)}>
            {METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-reference">Reference (optional)</FieldLabel>
          <Input id="receipt-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-amount">Amount received</FieldLabel>
          <Input
            id="receipt-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Allocate to invoices (optional)</span>
          <Button variant="outline" size="sm" type="button" onClick={addAllocation} disabled={openInvoices.length === 0}>
            <Plus data-icon="inline-start" />
            Add allocation
          </Button>
        </div>

        {allocations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No allocations — the full amount will be recorded on account.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_140px_36px] gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
              <span>Invoice</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {allocations.map((a, index) => (
              <div key={index} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_140px_36px] sm:border-0 sm:p-0">
                <select
                  className={selectClassName}
                  value={a.invoiceId}
                  onChange={(e) => updateAllocation(index, { invoiceId: e.target.value })}
                  aria-label="Invoice"
                >
                  <option value="">Select invoice</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — outstanding {formatCurrency(inv.total - inv.amountPaid)}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="text-right"
                  value={a.amount || ''}
                  onChange={(e) => updateAllocation(index, { amount: parseFloat(e.target.value) || 0 })}
                  aria-label="Allocation amount"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  className="justify-self-end text-muted-foreground hover:text-destructive"
                  onClick={() => removeAllocation(index)}
                  aria-label="Remove allocation"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Amount received</div>
          <Amount value={amount} className="text-base font-semibold text-positive" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Allocated</div>
          <Amount value={allocatedTotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">On account</div>
          <Amount value={unallocatedAmount} className="text-base font-semibold" />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="receipt-notes">Notes (optional)</FieldLabel>
        <Textarea id="receipt-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Recording…' : 'Record receipt'}
        </Button>
      </div>
    </div>
  );
}
