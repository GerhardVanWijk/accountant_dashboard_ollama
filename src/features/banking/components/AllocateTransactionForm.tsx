import { useState } from 'react';
import { format } from 'date-fns';
import type { Account, TaxRate } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import type { AllocationInput } from '../services';
import type { BankTransactionWithAllocations } from '../types';
import { AllocationRows } from './AllocationRows';
import { formatZAR } from '../utils/formatZAR';

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
 * direction are fixed; only the allocation lines are editable here.
 */
export function AllocateTransactionForm({
  transaction,
  glAccounts,
  taxRates,
  onSubmit,
  onCancel,
}: AllocateTransactionFormProps) {
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
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-2 gap-sm rounded-md border border-border bg-background p-sm text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-text-muted">Date</div>
          <div className="text-text-primary">{format(new Date(transaction.date), 'dd MMM yyyy')}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-text-muted">Description</div>
          <div className="text-text-primary">{transaction.description}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">Amount</div>
          <FinancialNumber
            value={transaction.direction === 'credit' ? -transaction.amount : transaction.amount}
            format={formatZAR}
            showFlash={false}
          />
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <AllocationRows
        allocations={allocations}
        onChange={setAllocations}
        glAccounts={glAccounts}
        taxRates={taxRates}
        grossAmount={transaction.amount}
      />

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Save Allocation'}
        </Button>
      </div>
    </div>
  );
}
