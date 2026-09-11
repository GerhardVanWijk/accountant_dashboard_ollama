import { useMemo, useState } from 'react';
import type { Account, FixedAsset, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter, FormGrid } from '@/components/app/form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';
import { resolveEffectiveTaxRate } from '@/features/tax/utils/effectiveRate';
import { splitProceeds, DEFAULT_DISPOSAL_VAT_CODE, type DisposalVatTreatment } from '../services';

export interface DisposeAssetFormInput {
  assetId: string;
  disposalDate: string;
  proceeds: number;
  proceedsAccountId: string;
  vatTreatment?: DisposalVatTreatment;
  vatCode?: string;
}

export interface DisposeAssetFormProps {
  assets: FixedAsset[];
  accounts: Account[];
  /** Every tax rate (incl. superseded versions) — the effective one for the disposal date is resolved from here. */
  taxRates: TaxRate[];
  onSubmit: (input: DisposeAssetFormInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const VAT_OPTIONS = [
  { value: 'none', label: 'No VAT (out of scope)' },
  { value: 'inclusive', label: 'Proceeds include VAT' },
  { value: 'exclusive', label: 'Add VAT on top' },
];

/**
 * Disposes an active / fully-depreciated asset. The VAT rate is resolved
 * from the tax-rate engine for the disposal date (never typed here). The
 * waterfall uses the same `splitProceeds()` the service uses, so what the
 * user sees is what posts — except that depreciation is first brought
 * current to the disposal date, which the note calls out.
 */
export function DisposeAssetForm({ assets, accounts, taxRates, onSubmit, onCancel, onDirtyChange }: DisposeAssetFormProps) {
  const disposable = assets.filter((a) => a.status === 'active' || a.status === 'fully_depreciated');
  const [assetId, setAssetId] = useState(disposable[0]?.id ?? '');
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState('0');
  const [proceedsAccountId, setProceedsAccountId] = useState(accounts.find((a) => a.code === '1000')?.id ?? accounts[0]?.id ?? '');
  const [vatTreatment, setVatTreatment] = useState<DisposalVatTreatment>('none');
  const [submitting, setSubmitting] = useState(false);

  const asset = disposable.find((a) => a.id === assetId);
  const carryingValue = asset ? asset.cost - asset.accumulatedDepreciation : 0;
  const proceedsValue = Number(proceeds) || 0;
  const proceedsError = proceeds.trim() !== '' && (Number.isNaN(proceedsValue) || proceedsValue < 0);

  const effectiveRate = useMemo(
    () => (disposalDate ? resolveEffectiveTaxRate(taxRates, DEFAULT_DISPOSAL_VAT_CODE, new Date(disposalDate)) : undefined),
    [taxRates, disposalDate],
  );
  const rateMissing = vatTreatment !== 'none' && !effectiveRate;

  const split = splitProceeds({ proceeds: proceedsValue, vatTreatment, vatRatePercent: effectiveRate?.rate });
  const gainLoss = split.netProceeds - carryingValue;

  const submit = async () => {
    if (!asset || !proceedsAccountId || proceedsError || rateMissing) return;
    setSubmitting(true);
    try {
      await onSubmit({
        assetId: asset.id,
        disposalDate,
        proceeds: proceedsValue,
        proceedsAccountId,
        vatTreatment,
        vatCode: vatTreatment === 'none' ? undefined : DEFAULT_DISPOSAL_VAT_CODE,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (disposable.length === 0) {
    return <p className="text-sm text-muted-foreground">No capitalized assets are available to dispose.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        {disposable.length > 1 && (
          <Field>
            <FieldLabel htmlFor="assetId">Asset</FieldLabel>
            <SearchableSelect
              id="assetId"
              value={assetId || null}
              onChange={(value) => setAssetId(value ?? '')}
              options={disposable.map((a) => ({ value: a.id, label: `${a.assetNumber} - ${a.name}`, keywords: a.assetNumber }))}
            />
          </Field>
        )}

        <FormGrid>
          <Field>
            <FieldLabel htmlFor="disposalDate">Disposal date</FieldLabel>
            <Input id="disposalDate" type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="proceeds">Proceeds</FieldLabel>
            <Input id="proceeds" type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
            {proceedsError && <FieldError errors={[{ message: 'Proceeds cannot be negative' }]} />}
          </Field>
        </FormGrid>

        <Field>
          <FieldLabel htmlFor="vatTreatment">VAT on proceeds</FieldLabel>
          <EnumSelect id="vatTreatment" name="vatTreatment" value={vatTreatment} onValueChange={(v) => setVatTreatment(v as DisposalVatTreatment)} options={VAT_OPTIONS} />
          <FieldDescription>
            {vatTreatment === 'none'
              ? 'No output VAT is raised.'
              : effectiveRate
                ? `Standard rate ${effectiveRate.rate}% (${effectiveRate.name}), effective on the disposal date — from the tax-rate settings, not entered here.`
                : 'No standard VAT rate is configured for this date — set one up in the tax settings first.'}
          </FieldDescription>
          {rateMissing && <FieldError errors={[{ message: 'No effective VAT rate for the disposal date' }]} />}
        </Field>

        <Field>
          <FieldLabel htmlFor="proceedsAccountId">Proceeds account</FieldLabel>
          <SearchableSelect
            id="proceedsAccountId"
            value={proceedsAccountId || null}
            onChange={(value) => setProceedsAccountId(value ?? '')}
            options={accounts.filter((a) => a.isActive).map((account) => ({ value: account.id, label: `${account.code} - ${account.name}`, keywords: account.code }))}
          />
          <FieldDescription>Where the cash / receivable lands — Cash and Bank, or Accounts Receivable if sold on credit.</FieldDescription>
        </Field>

        {asset && (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
            <Row label="Original cost" value={formatCurrency(asset.cost)} muted />
            <Row label="Accumulated depreciation" value={formatCurrency(asset.accumulatedDepreciation)} muted />
            <Row label="Carrying value (before final depreciation)" value={formatCurrency(carryingValue)} />
            {split.vatAmount > 0 && <Row label="Gross proceeds" value={formatCurrency(split.grossProceeds)} muted />}
            {split.vatAmount > 0 && <Row label={`Output VAT (${effectiveRate?.rate ?? 0}%)`} value={formatCurrency(split.vatAmount)} muted />}
            <Row label="Net proceeds" value={formatCurrency(split.netProceeds)} />
            <div className="flex items-center justify-between gap-3 py-2 font-medium">
              <span>{gainLoss >= 0 ? 'Gain on disposal' : 'Loss on disposal'}</span>
              <Amount value={gainLoss} />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Depreciation is brought current to the disposal date before derecognition, so the final carrying value and
          gain/loss may differ slightly from the preview above.
        </p>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={submitting || !asset || proceedsError || rateMissing} onClick={() => void submit()}>
          Dispose asset
        </Button>
      </FormFooter>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className="figure tabular-nums">{value}</span>
    </div>
  );
}
