import { useState } from 'react';
import type { DepreciationMethod, EstimateRevision, FixedAsset } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import { FormBody, FormFooter, FormGrid } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { DEPRECIATION_METHOD_LABELS } from '../constants';
import type { ReviseEstimateInput } from '../services';

const METHOD_OPTIONS = Object.entries(DEPRECIATION_METHOD_LABELS).map(([value, label]) => ({ value, label }));

/** First day of the month after `iso` — the earliest a revision can normally take effect. */
function firstOfNextMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export interface ReviseEstimateFormProps {
  asset: FixedAsset;
  /** Prior revisions — shown as authoritative history. */
  revisions?: EstimateRevision[];
  onSubmit: (input: ReviseEstimateInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Prospective change in accounting estimate (IAS 8 / IAS 16.51) — the only
 * sanctioned way to change useful life, residual value or method after an
 * asset is capitalized. Recorded as an effective-dated revision (persisted,
 * append-only). The effective date must be the first day of a month, on or
 * after the last posted depreciation period; posted depreciation is never
 * rewritten — the next run re-spreads the remaining amount from the
 * effective date over the revised remaining life.
 */
export function ReviseEstimateForm({ asset, revisions = [], onSubmit, onCancel, onDirtyChange }: ReviseEstimateFormProps) {
  const carryingValue = asset.cost - asset.accumulatedDepreciation;
  const [effectiveMonth, setEffectiveMonth] = useState(firstOfNextMonth(new Date().toISOString()).slice(0, 7));
  const [usefulLifeYears, setUsefulLifeYears] = useState(String(asset.usefulLifeYears));
  const [residualValue, setResidualValue] = useState(String(asset.residualValue));
  const [method, setMethod] = useState<DepreciationMethod>(asset.depreciationMethod);
  const [rate, setRate] = useState(asset.reducingBalanceRatePercent !== undefined ? String(asset.reducingBalanceRatePercent) : '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lifeNum = Number(usefulLifeYears);
  const residualNum = Number(residualValue);
  const rateNum = Number(rate);
  const effectiveError = !/^\d{4}-\d{2}$/.test(effectiveMonth);
  const lifeError = usefulLifeYears.trim() === '' || Number.isNaN(lifeNum) || lifeNum <= 0;
  const residualError = residualValue.trim() === '' || Number.isNaN(residualNum) || residualNum < 0 || residualNum > carryingValue + 0.005;
  const rateError = method === 'reducing_balance' && (rate.trim() === '' || Number.isNaN(rateNum) || rateNum <= 0);
  const invalid = effectiveError || lifeError || residualError || rateError;

  const submit = async () => {
    if (invalid) return;
    setSubmitting(true);
    try {
      await onSubmit({
        effectiveDate: `${effectiveMonth}-01`,
        usefulLifeYears: lifeNum,
        residualValue: residualNum,
        depreciationMethod: method,
        reducingBalanceRatePercent: method === 'reducing_balance' ? rateNum : undefined,
        reason: reason.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <p className="text-sm text-muted-foreground">
          Revising <span className="font-medium text-foreground">{asset.assetNumber} - {asset.name}</span>. Current
          carrying value <span className="font-medium tabular-nums">{formatCurrency(carryingValue)}</span>.
        </p>

        <FormGrid columns={2}>
          <Field>
            <FieldLabel htmlFor="revEffective">Effective from</FieldLabel>
            <Input id="revEffective" type="month" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} />
            <FieldDescription>Applies from the 1st of this month. Earlier posted months keep the old estimate.</FieldDescription>
            {effectiveError && <FieldError errors={[{ message: 'Pick a month' }]} />}
          </Field>
          <Field>
            <FieldLabel htmlFor="revUsefulLife">Total useful life (years, from acquisition)</FieldLabel>
            <Input id="revUsefulLife" type="number" step="0.25" value={usefulLifeYears} onChange={(e) => setUsefulLifeYears(e.target.value)} />
            {lifeError && <FieldError errors={[{ message: 'Must be greater than 0' }]} />}
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field>
            <FieldLabel htmlFor="revResidual">Residual value</FieldLabel>
            <Input id="revResidual" type="number" step="0.01" value={residualValue} onChange={(e) => setResidualValue(e.target.value)} />
            {residualError && <FieldError errors={[{ message: `0 to ${formatCurrency(carryingValue)}` }]} />}
          </Field>
          <Field>
            <FieldLabel htmlFor="revMethod">Depreciation method</FieldLabel>
            <EnumSelect
              id="revMethod"
              name="revMethod"
              value={method}
              onValueChange={(v) => setMethod(v as DepreciationMethod)}
              options={METHOD_OPTIONS}
            />
          </Field>
        </FormGrid>

        {method === 'reducing_balance' && (
          <Field className="max-w-xs">
            <FieldLabel htmlFor="revRate">Annual rate (%)</FieldLabel>
            <Input id="revRate" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            {rateError && <FieldError errors={[{ message: 'Required for reducing balance' }]} />}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="revReason">Reason</FieldLabel>
          <Textarea id="revReason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Major overhaul extended the expected life" />
          <FieldDescription>Recorded on the revision. Posted depreciation is not changed — only charges from the effective date.</FieldDescription>
        </Field>

        {revisions.length > 0 && (
          <div className="rounded-lg border border-border">
            <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Revision history
            </p>
            <ul className="divide-y divide-border text-sm">
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                  <span className="font-medium">{formatDate(r.effectiveDate)}</span>
                  <span className="text-muted-foreground">
                    {r.usefulLifeYears}y life · residual {formatCurrency(r.residualValue)} · {DEPRECIATION_METHOD_LABELS[r.depreciationMethod]}
                  </span>
                  {r.reason && <span className="w-full text-xs text-muted-foreground">{r.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || invalid} onClick={() => void submit()}>
          Revise Estimate
        </Button>
      </FormFooter>
    </div>
  );
}
