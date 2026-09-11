import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { LeaseAmortizationPreviewRow } from '../services';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';

export interface RunAmortizationFormProps {
  defaultPeriodEnd: string;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  previewAmortization: (periodEnd: string) => Promise<LeaseAmortizationPreviewRow[]>;
}

/**
 * Triggers leaseAmortizationService.runAmortization() for the chosen
 * period-end date across every eligible active lease in one combined
 * journal entry — mirrors RunDepreciationForm.tsx. Before the user can
 * confirm, loads a live PREVIEW (leaseAmortizationService.previewAmortization(),
 * the same computation the real post uses) so every lease's opening
 * liability/payment/interest/principal/closing liability/ROU depreciation
 * — and, for a lease that can't post this period, exactly why — is visible
 * up front (PART 1.20 of the Leases + Payroll integrity audit).
 */
export function RunAmortizationForm({ defaultPeriodEnd, onSubmit, onCancel, onDirtyChange, previewAmortization }: RunAmortizationFormProps) {
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<LeaseAmortizationPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!periodEnd) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    previewAmortization(periodEnd)
      .then((rows) => {
        if (!cancelled) setPreview(rows);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to load the preview.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodEnd, previewAmortization]);

  const ready = preview?.filter((row) => row.status === 'ready') ?? [];
  const blocked = preview?.filter((row) => row.status === 'blocked') ?? [];

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(periodEnd);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <Field>
          <FieldLabel htmlFor="periodEnd">Period End Date</FieldLabel>
          <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <FieldDescription>
            Amortizes every active lease not already run for this exact date, one month&apos;s interest/principal
            split and ROU depreciation charge each. Running twice for the same date is safe — the second run finds
            nothing left to do.
          </FieldDescription>
        </Field>

        {previewLoading && (
          <div role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading preview…
          </div>
        )}
        {previewError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {previewError}
          </p>
        )}

        {!previewLoading && !previewError && preview && preview.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Lease</th>
                    <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Opening</th>
                    <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Interest</th>
                    <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Principal</th>
                    <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Closing</th>
                    <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">ROU dep.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ready, ...blocked].map((row) => (
                    <tr key={row.lease.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{row.lease.leaseNumber}</span>
                          <span className="text-xs text-muted-foreground">{row.lease.assetDescription}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right"><Amount value={row.openingLiability} plain className="text-sm" /></td>
                      <td className="px-3 py-2 text-right"><Amount value={row.interest} plain className="text-sm" /></td>
                      <td className="px-3 py-2 text-right"><Amount value={row.principal} plain className="text-sm" /></td>
                      <td className="px-3 py-2 text-right"><Amount value={row.closingLiability} plain className="text-sm" /></td>
                      <td className="px-3 py-2 text-right"><Amount value={row.rouDepreciation} plain className="text-sm" /></td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            row.status === 'ready'
                              ? 'bg-status-positive-surface text-status-positive'
                              : 'bg-muted text-muted-foreground',
                          )}
                          title={row.reason}
                        >
                          {row.status === 'ready' ? 'Ready' : `Blocked — ${row.reason}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {ready.length} lease{ready.length === 1 ? '' : 's'} ready to post, {blocked.length} blocked, for the period ending {periodEnd}.
            </p>
          </div>
        )}
        {!previewLoading && !previewError && preview && preview.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No leases on the register yet.</p>
        )}
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !periodEnd || ready.length === 0} onClick={() => void submit()}>
          {ready.length > 0 ? `Post ${ready.length} lease${ready.length === 1 ? '' : 's'}` : 'Run Amortization'}
        </Button>
      </FormFooter>
    </div>
  );
}
