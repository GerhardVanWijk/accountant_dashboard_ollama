import { useState } from 'react';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { ProvisionalPaymentSlot } from '@/types/provisionalTax';

export interface PaymentSlotCardProps {
  /** Used for the heading and to derive stable input ids — must be unique on the page. */
  title: string;
  description: string;
  slot: ProvisionalPaymentSlot;
  busy: boolean;
  onSaveEstimate: (estimatedTaxableIncome: number) => void | Promise<void>;
  onPay: (amountPaid: number, date: string) => void | Promise<void>;
}

/**
 * One provisional tax payment slot (first/second/top-up) — due date,
 * estimate-entry form, and Pay action, or a read-only "paid" summary once
 * the slot has actually been paid. Re-skinned onto v0's SectionCard/Field
 * (M7); estimate/payment logic unchanged.
 */
export function PaymentSlotCard({ title, description, slot, busy, onSaveEstimate, onPay }: PaymentSlotCardProps) {
  const [estimateInput, setEstimateInput] = useState(String(slot.estimatedTaxableIncome ?? ''));
  const [payAmount, setPayAmount] = useState(slot.estimatedTaxLiability !== undefined ? String(slot.estimatedTaxLiability) : '');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isPaid = Boolean(slot.paidDate);
  const inputIdBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <SectionCard title={title} description={`${description} Due ${formatDate(slot.dueDate)}.`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <FigureBlock label="Estimated Taxable Income" value={formatCurrency(slot.estimatedTaxableIncome ?? 0)} className="text-base" />
          <FigureBlock label="Estimated Tax Liability" value={formatCurrency(slot.estimatedTaxLiability ?? 0)} className="text-base" tone="warning" />
        </div>

        {!isPaid && (
          <form
            className="flex flex-col gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(estimateInput);
              if (!Number.isFinite(value)) return;
              void onSaveEstimate(value);
            }}
          >
            <Field>
              <FieldLabel htmlFor={`estimate-${inputIdBase}`}>Estimated Taxable Income</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input id={`estimate-${inputIdBase}`} type="number" value={estimateInput} onChange={(e) => setEstimateInput(e.target.value)} disabled={busy} className="max-w-48" />
                <Button type="submit" variant="ghost" disabled={busy}>
                  Save Estimate
                </Button>
              </div>
            </Field>
          </form>
        )}

        {!isPaid ? (
          <form
            className="flex flex-col gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(payAmount);
              if (!Number.isFinite(value) || value <= 0) return;
              void onPay(value, payDate);
            }}
          >
            <Field>
              <FieldLabel htmlFor={`pay-amount-${inputIdBase}`}>Amount Paid</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`pay-amount-${inputIdBase}`}
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  disabled={busy || slot.estimatedTaxLiability === undefined}
                  className="max-w-40"
                />
                <Input
                  aria-label={`${title} payment date`}
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  disabled={busy || slot.estimatedTaxLiability === undefined}
                  className="max-w-40"
                />
                <Button type="submit" disabled={busy || slot.estimatedTaxLiability === undefined}>
                  Record Payment
                </Button>
              </div>
            </Field>
            {slot.estimatedTaxLiability === undefined && <p className="text-xs text-muted-foreground">Save an estimate first to record a payment.</p>}
          </form>
        ) : (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Paid {formatCurrency(slot.amountPaid ?? 0)} on {formatDate(slot.paidDate as string)}
            {slot.journalEntryId ? ` — journal entry ${slot.journalEntryId}.` : ''}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
