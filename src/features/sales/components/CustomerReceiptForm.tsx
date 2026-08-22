import { useState, useEffect } from 'react';
import type { Customer, Invoice, ReceiptAllocation, ReceiptMethod } from '@/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreateCustomerReceiptDTO } from '../services';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
   * "Record Payment" from InvoiceDetail (docs/KNOWN_ISSUES.md: the prop
   * existed but was never wired) opens THIS form rather than a
   * bespoke one-off — it's the real, GL-posting receipt flow, just
   * pre-aimed at one invoice: customer, amount (the outstanding balance),
   * and a single allocation row are all pre-filled, still fully editable
   * (e.g. to record a partial payment) before the user submits.
   */
  presetInvoiceId?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Customer Receipt intake form. Recording a receipt IS posting it —
 * customerReceiptService.recordReceipt() posts the balanced journal entry
 * and applies every allocation row in one call, so this form must build a
 * fully-validated CreateCustomerReceiptDTO (amount = sum(allocations) +
 * unallocatedAmount) before submitting.
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
    <div className="flex flex-col gap-lg">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Receipt Number</span>
          <input className={`${inputClass} font-mono`} value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Customer</span>
          <select
            className={inputClass}
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
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Date Received</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Method</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)}>
            {METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Reference (optional)</span>
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Amount Received</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Allocate to Invoices (optional)</span>
          <Button variant="ghost" type="button" onClick={addAllocation} disabled={openInvoices.length === 0}>
            <Icon name="add" size={14} />
            Add Allocation
          </Button>
        </div>

        {allocations.length === 0 ? (
          <div className="rounded-md border border-border px-sm py-md text-center text-sm text-text-muted">
            No allocations — the full amount will be recorded on account.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <div className="grid min-w-[480px] grid-cols-[1fr_120px_36px] gap-2 bg-primary/10 px-sm py-xs text-xs font-semibold">
              <div>Invoice</div>
              <div className="text-right">Amount</div>
              <div />
            </div>
            {allocations.map((a, index) => (
              <div key={index} className="grid min-w-[480px] grid-cols-[1fr_120px_36px] items-center gap-2 border-t border-border/50 px-sm py-xs">
                <select
                  className={inputClass}
                  value={a.invoiceId}
                  onChange={(e) => updateAllocation(index, { invoiceId: e.target.value })}
                >
                  <option value="">Select invoice</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — outstanding {formatCurrency(inv.total - inv.amountPaid)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${inputClass} text-right`}
                  value={a.amount || ''}
                  onChange={(e) => updateAllocation(index, { amount: parseFloat(e.target.value) || 0 })}
                />
                <button
                  type="button"
                  onClick={() => removeAllocation(index)}
                  aria-label="Remove allocation"
                  className="text-text-muted hover:text-danger"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-md rounded-md border border-border bg-background p-md text-sm">
        <div>
          <div className="text-xs text-text-muted">Amount Received</div>
          <FinancialNumber value={amount} format={formatCurrency} className="text-base font-semibold text-positive" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Allocated</div>
          <FinancialNumber value={allocatedTotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">On Account</div>
          <FinancialNumber value={unallocatedAmount} format={formatCurrency} className="text-base font-semibold" />
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
          {isSubmitting ? 'Recording…' : 'Record Receipt'}
        </Button>
      </div>
    </div>
  );
}
