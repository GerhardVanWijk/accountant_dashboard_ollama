import { useState } from 'react';
import type { CustomerReceipt } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter, FormHeader, FormShell } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { newUuid } from '@/lib/uuid';

const EPSILON = 0.01;

export interface ApplyDepositFormProps {
  /** This customer's receipts that still carry an unapplied balance. */
  receipts: CustomerReceipt[];
  /** The invoice's current outstanding balance — the allocation may not exceed it. */
  invoiceOutstanding: number;
  /** Calls customerReceiptService.allocateToInvoice(receiptId, invoiceId, amount, allocationId). */
  onSubmit: (receiptId: string, amount: number, allocationId: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Apply an existing customer deposit to this invoice" — the counterpart of
 * AllocationForm (which picks an invoice for a receipt). Posts
 * DR Customer Deposits / CR Accounts Receivable via
 * customerReceiptService.allocateToInvoice(); creates NO bank transaction.
 */
export function ApplyDepositForm({ receipts, invoiceOutstanding, onSubmit, onCancel, onDirtyChange }: ApplyDepositFormProps) {
  const [receiptId, setReceiptId] = useState(receipts[0]?.id ?? '');
  const selected = receipts.find((r) => r.id === receiptId);
  const cap = Math.min(selected?.unallocatedAmount ?? 0, invoiceOutstanding);
  const [amount, setAmount] = useState<number>(Number(cap.toFixed(2)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Stable for the life of this form (= one modal open). A retry re-uses it
  // so a lost-response retry de-duplicates server-side.
  const [allocationId] = useState(() => newUuid());

  function pickReceipt(id: string) {
    setReceiptId(id);
    const r = receipts.find((x) => x.id === id);
    setAmount(Number(Math.min(r?.unallocatedAmount ?? 0, invoiceOutstanding).toFixed(2)));
    onDirtyChange?.(true);
  }

  async function handleSubmit() {
    setFormError(null);
    if (!receiptId) return setFormError('Select a receipt with an available deposit.');
    if (amount <= 0) return setFormError('Amount must be greater than zero.');
    if (selected && amount - selected.unallocatedAmount > EPSILON) {
      return setFormError(`Only ${formatCurrency(selected.unallocatedAmount)} is available on this receipt.`);
    }
    if (amount - invoiceOutstanding > EPSILON) {
      return setFormError(`The invoice only has ${formatCurrency(invoiceOutstanding)} outstanding.`);
    }
    setIsSubmitting(true);
    try {
      await onSubmit(receiptId, amount, allocationId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not apply the deposit.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (receipts.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FormBody>
          <p className="text-sm text-muted-foreground">This customer has no available deposit to apply.</p>
        </FormBody>
        <FormFooter>
          <Button variant="outline" type="button" onClick={onCancel}>
            Close
          </Button>
        </FormFooter>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <p className="text-sm text-muted-foreground">
          Moves money from <span className="font-medium text-foreground">Customer Deposits</span> to Accounts Receivable and marks
          the invoice paid down by that amount. No bank transaction is created.
        </p>

        <Field>
          <FieldLabel htmlFor="apply-deposit-receipt">Receipt</FieldLabel>
          <SearchableSelect
            id="apply-deposit-receipt"
            value={receiptId || null}
            onChange={(v) => pickReceipt(v ?? '')}
            placeholder="Select a receipt…"
            searchPlaceholder="Search receipt number…"
            options={receipts.map((r) => ({
              value: r.id,
              label: r.receiptNumber,
              meta: `${formatDate(r.date)} · available ${formatCurrency(r.unallocatedAmount)}`,
            }))}
          />
        </Field>

        <div className="text-sm text-muted-foreground">
          Available on this receipt: <Amount value={selected?.unallocatedAmount ?? 0} className="font-semibold text-foreground" /> ·
          invoice outstanding: <Amount value={invoiceOutstanding} className="font-semibold text-foreground" />
        </div>

        <Field>
          <FieldLabel htmlFor="apply-deposit-amount">Amount to apply</FieldLabel>
          <Input
            id="apply-deposit-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Applying…' : 'Apply deposit'}
        </Button>
      </FormFooter>
    </div>
  );
}

export interface ApplyDepositFormModalProps extends Omit<ApplyDepositFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

export function ApplyDepositFormModal({ title, onClose, ...formProps }: ApplyDepositFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="sm" mode="edit" isDirty={dirty}>
      <FormHeader title={title} />
      <ApplyDepositForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
