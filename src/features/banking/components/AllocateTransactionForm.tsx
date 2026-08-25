import { useState } from 'react';
import type { Account, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';
import type { AllocationInput } from '../services';
import type { BankTransactionWithAllocations } from '../types';
import { AllocationRows } from './AllocationRows';

export interface AllocateTransactionFormProps {
  transaction: BankTransactionWithAllocations;
  glAccounts: Account[];
  taxRates: TaxRate[];
  onSubmit: (allocations: AllocationInput[]) => Promise<void>;
  onCancel: () => void;
}

/**
 * Allocates an already-recorded transaction with no GL split yet — the
 * usual case for an imported statement line (source: 'import') that
 * hasn't been coded to an account. The transaction's own date/amount/
 * direction are fixed; only the allocation lines are editable here — same
 * as before the port.
 */
export function AllocateTransactionForm({ transaction, glAccounts, taxRates, onSubmit, onCancel }: AllocateTransactionFormProps) {
  const [allocations, setAllocations] = useState<AllocationInput[]>(
    transaction.allocations.length > 0
      ? transaction.allocations.map((a) => ({
          glAccountId: a.glAccountId,
          description: a.description,
          netAmount: a.netAmount,
          taxRateId: a.taxRateId,
        }))
      : [{ glAccountId: '', description: transaction.description, netAmount: 0 }],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(allocations);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not allocate transaction.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Date</div>
          <div>{formatDate(transaction.date)}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-muted-foreground">Description</div>
          <div>{transaction.description}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Amount</div>
          <Amount value={transaction.direction === 'credit' ? -transaction.amount : transaction.amount} />
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <AllocationRows allocations={allocations} onChange={setAllocations} glAccounts={glAccounts} taxRates={taxRates} grossAmount={transaction.amount} />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Save allocation'}
        </Button>
      </div>
    </div>
  );
}
