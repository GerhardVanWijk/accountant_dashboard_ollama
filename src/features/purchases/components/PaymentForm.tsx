import { useMemo, useState } from 'react';
import type { Bill, PaymentMethod, Supplier } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreatePaymentDTO } from '../services';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const PAYMENT_METHODS: PaymentMethod[] = ['eft', 'cash', 'card', 'cheque', 'other'];

export interface PaymentFormProps {
  suppliers: Supplier[];
  /** Every bill still owing money (`total > amountPaid`, not void) — filtered to the selected supplier locally. */
  outstandingBills: Bill[];
  defaultPaymentNumber: string;
  onSubmit: (data: CreatePaymentDTO) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records a supplier payment and allocates it across one or more of that
 * supplier's open bills — the allocation model PaymentService.createPayment()
 * actually expects (`PaymentAllocation[]`, amount capped per-bill, remainder
 * left as `unallocatedAmount`/on-account). Purpose-built rather than reusing
 * LineItemsEditor: a payment allocates against existing Bills, it doesn't
 * price new line items, so the qty/unit-price/tax shape doesn't fit.
 */
export function PaymentForm({ suppliers, outstandingBills, defaultPaymentNumber, onSubmit, onCancel }: PaymentFormProps) {
  const [paymentNumber, setPaymentNumber] = useState(defaultPaymentNumber);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('eft');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState(0);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supplierBills = useMemo(
    () => outstandingBills.filter((bill) => bill.supplierId === supplierId),
    [outstandingBills, supplierId],
  );

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
      return setFormError(
        `Allocations total ${formatCurrency(allocatedTotal)} exceed the payment amount ${formatCurrency(amount)}.`,
      );
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
    <div className="flex flex-col gap-lg">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Payment Number</span>
          <input
            className={`${inputClass} font-mono`}
            value={paymentNumber}
            onChange={(e) => setPaymentNumber(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Supplier</span>
          <select className={inputClass} value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Date</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Method</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Reference (optional)</span>
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Payment Amount</span>
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
        <span className="text-sm font-medium text-text-primary">Allocate to Open Bills</span>
        <div className="overflow-x-auto rounded-md border border-border">
          <div className="grid min-w-[560px] grid-cols-[1.5fr_100px_120px_140px] gap-2 bg-primary/10 px-sm py-xs text-xs font-semibold tabular-nums">
            <div>Bill</div>
            <div className="text-right">Due Date</div>
            <div className="text-right">Outstanding</div>
            <div className="text-right">Allocate</div>
          </div>
          {supplierBills.map((bill) => {
            const outstanding = bill.total - bill.amountPaid;
            return (
              <div
                key={bill.id}
                className="grid min-w-[560px] grid-cols-[1.5fr_100px_120px_140px] items-center gap-2 border-t border-border/50 px-sm py-xs tabular-nums"
              >
                <div className="font-mono text-sm">{bill.billNumber}</div>
                <div className="text-right text-sm text-text-secondary">{bill.dueDate}</div>
                <div className="text-right text-sm">
                  <FinancialNumber value={outstanding} format={formatCurrency} showFlash={false} />
                </div>
                <input
                  type="number"
                  min="0"
                  max={outstanding}
                  step="0.01"
                  className={`${inputClass} text-right`}
                  value={allocationAmounts[bill.id] || ''}
                  onChange={(e) => setAllocation(bill.id, outstanding, parseFloat(e.target.value) || 0)}
                />
              </div>
            );
          })}
          {supplierBills.length === 0 && (
            <div className="px-sm py-md text-center text-sm text-text-muted">
              No open bills for this supplier — the full amount will be recorded on-account.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-md rounded-md border border-border bg-background p-md text-sm">
        <div>
          <div className="text-xs text-text-muted">Payment Amount</div>
          <FinancialNumber value={amount} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Allocated</div>
          <FinancialNumber value={allocatedTotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Unallocated (on-account)</div>
          <FinancialNumber
            value={unallocatedAmount}
            format={formatCurrency}
            className="text-base font-semibold"
            showFlash={false}
          />
        </div>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Notes (optional)</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Recording…' : 'Record Payment'}
        </Button>
      </div>
    </div>
  );
}
