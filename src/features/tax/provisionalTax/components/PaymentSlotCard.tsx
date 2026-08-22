import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { ProvisionalPaymentSlot } from '@/types/provisionalTax';
import { fieldInput, fieldLabel } from './formStyles';

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
 * the slot has actually been paid. Local to the Provisional Tax feature,
 * mirrors AdjustmentsTable.tsx's "editable while not yet finalized" shape
 * from the Income Tax module.
 */
export function PaymentSlotCard({ title, description, slot, busy, onSaveEstimate, onPay }: PaymentSlotCardProps) {
  const [estimateInput, setEstimateInput] = useState(String(slot.estimatedTaxableIncome ?? ''));
  const [payAmount, setPayAmount] = useState(slot.estimatedTaxLiability !== undefined ? String(slot.estimatedTaxLiability) : '');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isPaid = Boolean(slot.paidDate);
  const inputIdBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <Card className="flex flex-col gap-md">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-xs text-xs text-text-secondary">{description}</p>
        <p className="mt-xs text-xs text-text-secondary">Due {new Date(slot.dueDate).toLocaleDateString()}</p>
      </div>

      <div className="grid grid-cols-2 gap-md tabular-nums">
        <div>
          <p className="text-xs text-text-secondary">Estimated Taxable Income</p>
          <FinancialNumber value={slot.estimatedTaxableIncome ?? 0} format={formatCurrency} className="text-base" />
        </div>
        <div>
          <p className="text-xs text-text-secondary">Estimated Tax Liability</p>
          <FinancialNumber value={slot.estimatedTaxLiability ?? 0} format={formatCurrency} isInverted className="text-base" />
        </div>
      </div>

      {!isPaid && (
        <form
          className="flex flex-col gap-sm border-t border-border pt-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(estimateInput);
            if (!Number.isFinite(value)) return;
            void onSaveEstimate(value);
          }}
        >
          <label className={fieldLabel} htmlFor={`estimate-${inputIdBase}`}>
            Estimated Taxable Income
          </label>
          <div className="flex flex-wrap gap-sm">
            <input
              id={`estimate-${inputIdBase}`}
              className={fieldInput}
              type="number"
              value={estimateInput}
              onChange={(e) => setEstimateInput(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" variant="ghost" disabled={busy}>
              Save Estimate
            </Button>
          </div>
        </form>
      )}

      {!isPaid ? (
        <form
          className="flex flex-col gap-sm border-t border-border pt-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(payAmount);
            if (!Number.isFinite(value) || value <= 0) return;
            void onPay(value, payDate);
          }}
        >
          <label className={fieldLabel} htmlFor={`pay-amount-${inputIdBase}`}>
            Amount Paid
          </label>
          <div className="flex flex-wrap gap-sm">
            <input
              id={`pay-amount-${inputIdBase}`}
              className={fieldInput}
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              disabled={busy || slot.estimatedTaxLiability === undefined}
            />
            <input
              aria-label={`${title} payment date`}
              className={fieldInput}
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              disabled={busy || slot.estimatedTaxLiability === undefined}
            />
            <Button type="submit" disabled={busy || slot.estimatedTaxLiability === undefined}>
              Record Payment
            </Button>
          </div>
          {slot.estimatedTaxLiability === undefined && (
            <p className="text-xs text-text-secondary">Save an estimate first to record a payment.</p>
          )}
        </form>
      ) : (
        <p className="border-t border-border pt-sm text-xs text-text-secondary">
          Paid <FinancialNumber value={slot.amountPaid ?? 0} format={formatCurrency} className="text-xs" /> on{' '}
          {new Date(slot.paidDate as string).toLocaleDateString()}
          {slot.journalEntryId ? ` — journal entry ${slot.journalEntryId}.` : ''}
        </p>
      )}
    </Card>
  );
}
