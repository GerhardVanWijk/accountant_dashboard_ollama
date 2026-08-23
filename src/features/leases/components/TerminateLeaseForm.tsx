import { useState } from 'react';
import type { LeaseContract } from '@/types/lease';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface TerminateLeaseFormProps {
  lease: LeaseContract;
  onSubmit: (terminationDate: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Small confirm form for terminating an active lease — the gain/loss
 * preview below is computed the same way leaseDisposalService.terminateLease()
 * computes it for real (outstandingLeaseLiability - ROU carrying value),
 * mirroring DisposeAssetForm's live preview.
 */
export function TerminateLeaseForm({ lease, onSubmit, onCancel }: TerminateLeaseFormProps) {
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const rouCarryingValue = lease.initialRightOfUseAsset - lease.accumulatedDepreciation;
  const gainLoss = lease.outstandingLeaseLiability - rouCarryingValue;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(terminationDate);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-secondary">
        Terminating <span className="font-medium text-text-primary">{lease.leaseNumber} - {lease.assetDescription}</span>.
      </p>
      <div>
        <label className={fieldLabel} htmlFor="terminationDate">
          Termination Date
        </label>
        <input
          id="terminationDate"
          type="date"
          className={fieldInput}
          value={terminationDate}
          onChange={(e) => setTerminationDate(e.target.value)}
        />
        <p className={fieldHint}>
          Clears the Right-of-Use asset and remaining lease liability and books the resulting gain or loss.
        </p>
      </div>

      <div className="rounded-md border border-border bg-background p-md text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">ROU Carrying Value</span>
          <span className="font-medium tabular-nums">{formatCurrency(rouCarryingValue)}</span>
        </div>
        <div className="mt-xs flex justify-between">
          <span className="text-text-secondary">Outstanding Lease Liability</span>
          <span className="font-medium tabular-nums">{formatCurrency(lease.outstandingLeaseLiability)}</span>
        </div>
        <div className="mt-xs flex justify-between">
          <span className="text-text-secondary">{gainLoss >= 0 ? 'Gain' : 'Loss'} on Termination</span>
          <FinancialNumber value={gainLoss} format={formatCurrency} showFlash={false} />
        </div>
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={submit} disabled={submitting || !terminationDate}>
          Terminate Lease
        </Button>
      </div>
    </div>
  );
}
