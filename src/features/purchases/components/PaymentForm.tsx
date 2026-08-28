import { useEffect, useMemo, useState } from 'react';
import type { Bill, PaymentMethod, Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FigureBlock } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { CreatePaymentDTO } from '../services';

const PAYMENT_METHODS: PaymentMethod[] = ['eft', 'cash', 'card', 'cheque', 'other'];

export interface PaymentFormProps {
  suppliers: Supplier[];
  /** Every bill still owing money (`total > amountPaid`, not void) — filtered to the selected supplier locally. */
  outstandingBills: Bill[];
  defaultPaymentNumber: string;
  onSubmit: (data: CreatePaymentDTO) => Promise<void>;
  onCancel: () => void;
  /**
   * "Record Payment" from BillDetail opens THIS form rather than a
   * bespoke one-off — it's the real, GL-posting payment flow, just
   * pre-aimed at one bill: supplier, amount (the outstanding balance),
   * and that bill's allocation are all pre-filled, still fully editable
   * (e.g. to record a partial payment) before the user submits.
   */
  presetBillId?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records a supplier payment and allocates it across one or more of that
 * supplier's open bills — the allocation model
 * PaymentService.createPayment() actually expects (`PaymentAllocation[]`,
 * amount capped per-bill, remainder left as `unallocatedAmount`/on-account).
 * Purpose-built rather than reusing LineItemsEditor: a payment allocates
 * against existing Bills, it doesn't price new line items. Re-skinned
 * onto v0's Field/Input (M8); allocation logic unchanged.
 */
export function PaymentForm({ suppliers, outstandingBills, defaultPaymentNumber, onSubmit, onCancel, presetBillId }: PaymentFormProps) {
  const presetBill = presetBillId ? outstandingBills.find((b) => b.id === presetBillId) : undefined;
  const presetOutstanding = presetBill ? Math.max(0, presetBill.total - presetBill.amountPaid) : 0;

  const [paymentNumber, setPaymentNumber] = useState(defaultPaymentNumber);
  const [supplierId, setSupplierId] = useState(presetBill?.supplierId ?? suppliers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('eft');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState(presetOutstanding);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, number>>(presetBill ? { [presetBill.id]: presetOutstanding } : {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Only re-applies if the preset bill itself changes — never overwrites what the user has since typed.
  useEffect(() => {
    if (!presetBill) return;
    setSupplierId(presetBill.supplierId);
    setAmount(presetOutstanding);
    setAllocationAmounts({ [presetBill.id]: presetOutstanding });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetBillId]);

  const supplierBills = useMemo(() => outstandingBills.filter((bill) => bill.supplierId === supplierId), [outstandingBills, supplierId]);

  const allocations = useMemo(
    () =>
      supplierBills
        .map((bill) => ({ billId: bill.id, amount: allocationAmounts[bill.id] || 0 }))
        .filter((allocation) => allocation.amount > 0),
    [supplierBills, allocationAmounts],
  );

  const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
  const unallocatedAmount = Math.max(0, amount - allocatedTotal);

  function handleSupplierChange(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    setAllocationAmounts({});
  }

  function setAllocation(billId: string, outstanding: number, value: number) {
    const capped = Math.max(0, Math.min(value, outstanding));
    setAllocationAmounts((prev) => ({ ...prev, [billId]: capped }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!paymentNumber.trim()) return setFormError('Payment number is required.');
    if (!supplierId) return setFormError('Select a supplier.');
    if (amount <= 0) return setFormError('Payment amount must be greater than zero.');
    if (allocatedTotal - amount > 0.01) {
      return setFormError(`Allocations total ${formatCurrency(allocatedTotal)} exceed the payment amount ${formatCurrency(amount)}.`);
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        paymentNumber: paymentNumber.trim(),
        supplierId,
        date,
        method,
        reference: reference || undefined,
        amount,
        allocations,
        currency: 'ZAR',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record payment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="payment-number">Payment Number</FieldLabel>
          <Input id="payment-number" className="font-mono" value={paymentNumber} onChange={(e) => setPaymentNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-supplier">Supplier</FieldLabel>
          <NativeSelect id="payment-supplier" value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-date">Date</FieldLabel>
          <Input id="payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-method">Method</FieldLabel>
          <NativeSelect id="payment-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-reference">Reference (optional)</FieldLabel>
          <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-amount">Payment Amount</FieldLabel>
          <Input id="payment-amount" type="number" min="0" step="0.01" value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Allocate to Open Bills</span>
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="grid min-w-[560px] grid-cols-[1.5fr_100px_120px_140px] gap-2 bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase tabular-nums">
            <div>Bill</div>
            <div className="text-right">Due Date</div>
            <div className="text-right">Outstanding</div>
            <div className="text-right">Allocate</div>
          </div>
          {supplierBills.map((bill) => {
            const outstanding = bill.total - bill.amountPaid;
            return (
              <div key={bill.id} className="grid min-w-[560px] grid-cols-[1.5fr_100px_120px_140px] items-center gap-2 border-t border-border px-3 py-2 tabular-nums">
                <div className="font-mono text-sm">{bill.billNumber}</div>
                <div className="text-right text-sm text-muted-foreground">{formatDate(bill.dueDate)}</div>
                <div className="text-right text-sm">{formatCurrency(outstanding)}</div>
                <Input
                  type="number"
                  min="0"
                  max={outstanding}
                  step="0.01"
                  className="text-right"
                  value={allocationAmounts[bill.id] || ''}
                  onChange={(e) => setAllocation(bill.id, outstanding, parseFloat(e.target.value) || 0)}
                />
              </div>
            );
          })}
          {supplierBills.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted-foreground">No open bills for this supplier — the full amount will be recorded on-account.</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <FigureBlock label="Payment Amount" value={formatCurrency(amount)} className="text-base" />
        <FigureBlock label="Allocated" value={formatCurrency(allocatedTotal)} className="text-base" />
        <FigureBlock label="Unallocated (on-account)" value={formatCurrency(unallocatedAmount)} className="text-base" />
      </div>

      <Field>
        <FieldLabel htmlFor="payment-notes">Notes (optional)</FieldLabel>
        <Textarea id="payment-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Recording…' : 'Record Payment'}
        </Button>
      </div>
    </div>
  );
}
