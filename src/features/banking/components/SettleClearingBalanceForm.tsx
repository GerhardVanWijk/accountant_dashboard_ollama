import { useState } from 'react';
import type { BankAccount } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { SearchableSelect } from '@/components/app/combobox';

export interface SettleClearingBalanceFormProps {
  bankAccounts: BankAccount[];
  /** Never exceedable — the form clamps the amount field to this. */
  maxAmount: number;
  defaultDescription: string;
  onSubmit: (input: { bankAccountId: string; date: string; amount: number; reference?: string }) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records the ONE real cash movement that clears (part of) a payroll run's
 * Net Pay Payable balance or ONE lease amortization period's Lease Payment
 * Clearing balance — a thin front end for
 * `PayrollRunService.settleNetPay()` / `LeaseAmortizationService.settlePeriod()`,
 * which post through the atomic, over-settlement-proof RPCs
 * `settle_payroll_net_pay` / `settle_lease_period_payment` (FINAL
 * PRE-MIGRATION HARDENING, migrations 0096/0097).
 *
 * `maxAmount` clamping the input here is a UX convenience — catching an
 * obvious typo before a round trip — NOT the actual over-settlement
 * protection: the real invariant is enforced at the database layer, inside
 * the RPC, under a row lock, from figures it derives itself and never
 * trusts from this form (see those migrations' headers for exactly why a
 * frontend-only cap was insufficient). A stale/wrong `maxAmount` passed
 * here can at worst produce a request the RPC then correctly rejects — it
 * can never cause an actual over-settlement.
 */
export function SettleClearingBalanceForm({ bankAccounts, maxAmount, defaultDescription, onSubmit, onCancel, onDirtyChange }: SettleClearingBalanceFormProps) {
  const [bankAccountId, setBankAccountId] = useState<string | null>(bankAccounts[0]?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(maxAmount);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const clampedAmount = Math.min(Math.max(0, amount), maxAmount);
  const canSubmit = Boolean(bankAccountId) && Boolean(date) && clampedAmount > 0;

  const submit = async () => {
    if (!bankAccountId) return;
    setSubmitting(true);
    try {
      await onSubmit({ bankAccountId, date, amount: clampedAmount, reference: reference.trim() || undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <Field>
          <FieldLabel htmlFor="bankAccountId">Bank Account</FieldLabel>
          <SearchableSelect
            id="bankAccountId"
            value={bankAccountId}
            onChange={setBankAccountId}
            options={bankAccounts.map((a) => ({ value: a.id, label: a.name, keywords: a.accountNumber }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="date">Date</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="amount">Amount</FieldLabel>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min={0}
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <FieldDescription>Cannot exceed the outstanding balance ({maxAmount.toFixed(2)}).</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="reference">Reference</FieldLabel>
          <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={defaultDescription} />
        </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !canSubmit} onClick={() => void submit()}>
          Record Settlement
        </Button>
      </FormFooter>
    </div>
  );
}
