import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Customer, Invoice, ReceiptAllocation, ReceiptMethod } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { CustomerCombobox, EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter, FormSection } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import type { CreateCustomerReceiptDTO } from '../services';

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
  onDirtyChange?: (dirty: boolean) => void;
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

function outstandingOf(inv: Invoice): number {
  return Math.max(0, inv.total - inv.amountPaid);
}

/**
 * Customer Receipt intake form — same fields / validation / submit shape
 * and the same calculations as before, restructured (docs brief Part K)
 * into three clearly-labelled sections so the amount hierarchy is obvious:
 *
 *   1. Receipt details — including ONE prominent "Amount received" input,
 *      the only field that is the actual receipt total.
 *   2. Allocate to invoices — each row is a portion of that total, with the
 *      invoice's outstanding balance shown inline and a "Fill" shortcut
 *      that tops the row up to either the invoice balance or whatever is
 *      still unallocated, whichever is smaller.
 *   3. Summary — Receipt total / Allocated / Left on account, restated so
 *      the two allocation figures read as parts of the one receipt total.
 *
 * Recording a receipt IS posting it: `customerReceiptService.recordReceipt()`
 * posts the balanced journal entry and applies every allocation row in one
 * call, so this form still builds a fully-validated CreateCustomerReceiptDTO
 * (amount = sum(allocations) + unallocatedAmount) before submitting.
 */
export function CustomerReceiptForm({
  customers,
  invoices,
  defaultReceiptNumber,
  onSubmit,
  onCancel,
  onDirtyChange,
  presetInvoiceId,
}: CustomerReceiptFormProps) {
  const presetInvoice = presetInvoiceId ? invoices.find((inv) => inv.id === presetInvoiceId) : undefined;
  const presetOutstanding = presetInvoice ? outstandingOf(presetInvoice) : 0;

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

  const openInvoices = invoices.filter((inv) => inv.customerId === customerId && outstandingOf(inv) > EPSILON);
  const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
  const unallocatedAmount = Math.max(0, amount - allocatedTotal);
  const overAllocated = allocatedTotal - amount > EPSILON;

  function addAllocation() {
    const nextInvoice = openInvoices.find((inv) => !allocations.some((a) => a.invoiceId === inv.id));
    const seed = nextInvoice ? Math.min(outstandingOf(nextInvoice), unallocatedAmount) : 0;
    setAllocations([...allocations, { invoiceId: nextInvoice?.id ?? '', amount: Number(seed.toFixed(2)) }]);
    onDirtyChange?.(true);
  }

  function updateAllocation(index: number, patch: Partial<ReceiptAllocation>) {
    const next = [...allocations];
    next[index] = { ...next[index], ...patch };
    setAllocations(next);
    onDirtyChange?.(true);
  }

  /** Top this row up to the invoice balance, or to whatever is still unallocated — whichever is smaller. */
  function fillAllocation(index: number) {
    const row = allocations[index];
    const inv = openInvoices.find((i) => i.id === row.invoiceId);
    if (!inv) return;
    const headroom = unallocatedAmount + row.amount; // freeing this row's current amount back into the pool
    updateAllocation(index, { amount: Number(Math.min(outstandingOf(inv), headroom).toFixed(2)) });
  }

  function removeAllocation(index: number) {
    setAllocations(allocations.filter((_, i) => i !== index));
    onDirtyChange?.(true);
  }

  async function handleSubmit() {
    setFormError(null);
    if (!receiptNumber.trim()) return setFormError('Receipt number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (amount <= 0) return setFormError('Amount received must be greater than zero.');
    if (allocations.some((a) => !a.invoiceId)) return setFormError('Every allocation row needs an invoice.');
    if (allocations.some((a) => a.amount <= 0)) return setFormError('Every allocation amount must be greater than zero.');
    if (overAllocated) {
      return setFormError(
        `Allocations (${formatCurrency(allocatedTotal)}) cannot exceed the amount received (${formatCurrency(amount)}).`,
      );
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <FormSection title="Receipt details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="receipt-number">Receipt number</FieldLabel>
              <Input id="receipt-number" className="figure" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="receipt-customer">Customer</FieldLabel>
              <CustomerCombobox
                id="receipt-customer"
                customers={customers}
                value={customerId || null}
                onChange={(v) => {
                  setCustomerId(v ?? '');
                  setAllocations([]);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="receipt-date">Date received</FieldLabel>
              <Input id="receipt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="receipt-method">Payment method</FieldLabel>
              <EnumSelect
                id="receipt-method"
                value={method}
                onValueChange={(v) => setMethod(v as ReceiptMethod)}
                options={METHOD_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="receipt-reference">Reference (optional)</FieldLabel>
              <Input id="receipt-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EFT reference, cheque number, …" />
            </Field>
          </div>

          <div className="rounded-xl border border-brand-outline bg-brand-muted/40 p-4">
            <FieldLabel htmlFor="receipt-amount" className="text-xs tracking-wide text-muted-foreground uppercase">
              Amount received
            </FieldLabel>
            <p className="mb-2 text-xs text-muted-foreground">
              The full payment from the customer. Allocate it below; anything left over is held as a customer deposit.
            </p>
            <Input
              id="receipt-amount"
              type="number"
              min="0"
              step="0.01"
              className="figure h-11 max-w-xs text-lg font-semibold"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Anything you don't allocate below is held as a <span className="font-medium text-foreground">customer deposit</span> (a
              liability), not applied to Accounts Receivable — apply it to an invoice later.
            </p>
          </div>
        </FormSection>

        <FormSection
          title="Allocate to invoices"
          description="Optional. Split the receipt across this customer's open invoices — each amount here is a portion of the receipt total above."
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {openInvoices.length === 0
                ? 'This customer has no open invoices.'
                : `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'} · ${formatCurrency(unallocatedAmount)} still to allocate`}
            </span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={addAllocation}
              disabled={openInvoices.length === 0 || openInvoices.length <= allocations.length}
            >
              <Plus data-icon="inline-start" />
              Add invoice
            </Button>
          </div>

          {allocations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No allocations — the full amount will be held as a customer deposit.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="hidden grid-cols-[1fr_160px_auto_36px] gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
                <span>Invoice</span>
                <span className="text-right">Allocation</span>
                <span />
                <span />
              </div>
              {allocations.map((a, index) => {
                const inv = openInvoices.find((i) => i.id === a.invoiceId);
                return (
                  <div
                    key={index}
                    className="grid grid-cols-1 items-start gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_160px_auto_36px] sm:items-center sm:border-0 sm:p-0"
                  >
                    <div className="flex flex-col gap-1">
                      <SearchableSelect
                        aria-label="Invoice"
                        options={openInvoices.map((i) => ({
                          value: i.id,
                          label: `${i.invoiceNumber} · outstanding ${formatCurrency(outstandingOf(i))}`,
                          keywords: i.invoiceNumber,
                        }))}
                        value={a.invoiceId || null}
                        onChange={(v) => updateAllocation(index, { invoiceId: v ?? '' })}
                        placeholder="Select invoice"
                        searchPlaceholder="Search invoices…"
                        emptyMessage="No open invoices match."
                      />
                    </div>
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
                      size="sm"
                      type="button"
                      className="text-brand-foreground"
                      onClick={() => fillAllocation(index)}
                      disabled={!inv}
                    >
                      Fill
                    </Button>
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
                );
              })}
            </div>
          )}
        </FormSection>

        <FormSection title="Summary">
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Receipt total</div>
              <Amount value={amount} className="text-base font-semibold text-positive" />
              <p className="mt-1 text-xs text-muted-foreground">What the customer paid</p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Allocated to invoices</div>
              <Amount value={allocatedTotal} className={`text-base font-semibold ${overAllocated ? 'text-destructive' : ''}`} />
              <p className="mt-1 text-xs text-muted-foreground">Sum of the rows above</p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Customer deposit (unapplied)</div>
              <Amount value={unallocatedAmount} className="text-base font-semibold" />
              <p className="mt-1 text-xs text-muted-foreground">Held as a liability · Receipt total − allocated</p>
            </div>
          </div>
          {overAllocated && (
            <p role="alert" className="text-sm text-destructive">
              Allocations exceed the amount received by {formatCurrency(allocatedTotal - amount)}.
            </p>
          )}
        </FormSection>

        <Field>
          <FieldLabel htmlFor="receipt-notes">Notes (optional)</FieldLabel>
          <Textarea id="receipt-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Recording…' : 'Record receipt'}
        </Button>
      </FormFooter>
    </div>
  );
}
