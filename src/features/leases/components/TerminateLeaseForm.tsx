import { useState } from 'react';
import type { LeaseContract } from '@/types/lease';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount, FigureBlock } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';

export interface TerminateLeaseFormProps {
  lease: LeaseContract;
  onSubmit: (terminationDate: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Small confirm form for terminating an active lease — the gain/loss
 * preview below is computed the same way
 * leaseDisposalService.terminateLease() computes it for real
 * (outstandingLeaseLiability - ROU carrying value), mirroring
 * DisposeAssetForm's live preview. Re-skinned onto v0's Field (M13).
 */
export function TerminateLeaseForm({ lease, onSubmit, onCancel, onDirtyChange }: TerminateLeaseFormProps) {
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <p className="text-sm text-muted-foreground">
        Terminating <span className="font-medium text-foreground">{lease.leaseNumber} - {lease.assetDescription}</span>.
      </p>
      <Field>
        <FieldLabel htmlFor="terminationDate">Termination Date</FieldLabel>
        <Input id="terminationDate" type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
        <FieldDescription>Clears the Right-of-Use asset and remaining lease liability and books the resulting gain or loss.</FieldDescription>
      </Field>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <FigureBlock label="ROU Carrying Value" value={formatCurrency(rouCarryingValue)} className="text-base" />
        <FigureBlock label="Outstanding Lease Liability" value={formatCurrency(lease.outstandingLeaseLiability)} className="text-base" />
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{gainLoss >= 0 ? 'Gain' : 'Loss'} on Termination</span>
          <Amount value={gainLoss} className="text-base font-medium" />
        </div>
      </div>

      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={submitting || !terminationDate} onClick={() => void submit()}>
          Terminate Lease
        </Button>
      </FormFooter>
    </div>
  );
}
