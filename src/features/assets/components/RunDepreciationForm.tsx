import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { DepreciationPreview } from '../services';

export interface RunDepreciationFormProps {
  defaultPeriodEnd: string;
  onPreview: (periodEnd: string) => Promise<DepreciationPreview>;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Two-step run: pick a period end → preview exactly what will post, broken
 * out by accounting period → confirm. One run can generate several
 * journals — one per calendar month, each dated in its own month. Any month
 * whose accounting period is closed (or that sits after a closed month) is
 * shown as Blocked and is not posted. The preview is
 * `depreciationService.previewDepreciation()` — the same classification the
 * run uses, so there is no separate frontend depreciation maths.
 */
export function RunDepreciationForm({ defaultPeriodEnd, onPreview, onSubmit, onCancel, onDirtyChange }: RunDepreciationFormProps) {
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [preview, setPreview] = useState<DepreciationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadPreview = useCallback(async (date: string) => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      setPreview(await onPreview(date));
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : 'Could not compute the preview.');
    } finally {
      setLoadingPreview(false);
    }
  }, [onPreview]);

  useEffect(() => {
    if (periodEnd) void loadPreview(periodEnd);
  }, [periodEnd, loadPreview]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(periodEnd);
    } finally {
      setSubmitting(false);
    }
  };

  const readyPeriods = preview?.periods.filter((p) => p.status === 'ready') ?? [];
  const blockedPeriods = preview?.periods.filter((p) => p.status === 'blocked') ?? [];
  const nothingDue = preview !== null && preview.periods.length === 0;
  const nothingToPost = preview !== null && readyPeriods.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <Field>
          <FieldLabel htmlFor="periodEnd">Run through</FieldLabel>
          <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <FieldDescription>
            Every active asset is brought current to this date. Each unposted month posts as its own journal, dated
            in that month — one run can create several. Running twice for the same date is safe.
          </FieldDescription>
        </Field>

        {loadingPreview && (
          <div role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Calculating…
          </div>
        )}
        {previewError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {previewError}
          </p>
        )}

        {preview && !loadingPreview && nothingDue && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Nothing due for {formatDate(preview.targetDate)} — every active asset is already current, or none are eligible.
          </p>
        )}

        {preview && !loadingPreview && !nothingDue && (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2 text-left font-medium">Accounting period</th>
                    <th className="px-3 py-2 text-right font-medium">Assets</th>
                    <th className="px-3 py-2 text-right font-medium">Charge</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.periods.map((p) => (
                    <tr key={p.periodEnd} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{p.label}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.assetCount}</td>
                      <td className="px-3 py-2 text-right"><Amount value={-p.amount} plain className="text-sm" /></td>
                      <td className="px-3 py-2">
                        {p.status === 'ready' ? (
                          <span className="text-status-positive">Ready</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-status-warning">
                            <Lock className="size-3" aria-hidden="true" /> Blocked
                          </span>
                        )}
                        {p.blockedReason && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.blockedReason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 text-sm font-medium">
                    <td className="px-3 py-2" colSpan={2}>
                      Will post — Dr Depreciation expense / Cr Accumulated depreciation
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({readyPeriods.length} journal{readyPeriods.length === 1 ? '' : 's'})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right" colSpan={2}>{formatCurrency(preview.totalCharge)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {blockedPeriods.length > 0 && (
              <p role="alert" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-sm text-status-warning">
                {formatCurrency(preview.blockedTotal)} of depreciation across {blockedPeriods.length}{' '}
                period{blockedPeriods.length === 1 ? '' : 's'} cannot post — the accounting period is closed, or an
                earlier one is. Reopen and post it, then run again. Nothing is rolled forward into a later month.
              </p>
            )}
          </div>
        )}
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !periodEnd || loadingPreview || nothingToPost} onClick={() => void submit()}>
          {nothingToPost ? 'Nothing to post' : `Post ${readyPeriods.length} journal${readyPeriods.length === 1 ? '' : 's'}`}
        </Button>
      </FormFooter>
    </div>
  );
}
