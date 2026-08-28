import { useState } from 'react';
import type { Account, FixedAsset } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { Amount, FigureBlock } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';

export interface DisposeAssetFormProps {
  assets: FixedAsset[];
  accounts: Account[];
  onSubmit: (input: { assetId: string; disposalDate: string; proceeds: number; proceedsAccountId: string }) => Promise<void>;
  onCancel: () => void;
}

/**
 * Disposes an active/fully_depreciated asset — the gain/loss preview
 * below is computed the same way assetDisposalService.disposeAsset()
 * computes it for real (proceeds - carrying value), so what the user sees
 * here is exactly what will post. Re-skinned onto v0's Field/Input (M8).
 */
export function DisposeAssetForm({ assets, accounts, onSubmit, onCancel }: DisposeAssetFormProps) {
  const disposable = assets.filter((a) => a.status === 'active' || a.status === 'fully_depreciated');
  const [assetId, setAssetId] = useState(disposable[0]?.id ?? '');
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState('0');
  const [proceedsAccountId, setProceedsAccountId] = useState(accounts[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);

  const asset = disposable.find((a) => a.id === assetId);
  const carryingValue = asset ? asset.cost - asset.accumulatedDepreciation : 0;
  const proceedsValue = Number(proceeds) || 0;
  const gainLoss = proceedsValue - carryingValue;
  const proceedsError = proceeds.trim() !== '' && (Number.isNaN(proceedsValue) || proceedsValue < 0);

  const submit = async () => {
    if (!asset || !proceedsAccountId || proceedsError) return;
    setSubmitting(true);
    try {
      await onSubmit({ assetId: asset.id, disposalDate, proceeds: proceedsValue, proceedsAccountId });
    } finally {
      setSubmitting(false);
    }
  };

  if (disposable.length === 0) {
    return <p className="text-sm text-muted-foreground">No capitalized assets are available to dispose.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="assetId">Asset</FieldLabel>
        <NativeSelect id="assetId" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          {disposable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.assetNumber} - {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="disposalDate">Disposal Date</FieldLabel>
          <Input id="disposalDate" type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="proceeds">Proceeds</FieldLabel>
          <Input id="proceeds" type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          {proceedsError && <FieldError errors={[{ message: 'Proceeds cannot be negative' }]} />}
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="proceedsAccountId">Proceeds Account</FieldLabel>
        <NativeSelect id="proceedsAccountId" value={proceedsAccountId} onChange={(e) => setProceedsAccountId(e.target.value)}>
          {accounts
            .filter((a) => a.isActive)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
        </NativeSelect>
        <FieldDescription>Where the disposal proceeds land — Cash and Bank, or Accounts Receivable if on credit.</FieldDescription>
      </Field>

      {asset && (
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <FigureBlock label="Carrying Value" value={formatCurrency(carryingValue)} className="text-base" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{gainLoss >= 0 ? 'Gain' : 'Loss'} on Disposal</span>
            <Amount value={gainLoss} className="text-base font-medium" />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={submitting || !asset || proceedsError} onClick={() => void submit()}>
          Dispose Asset
        </Button>
      </div>
    </div>
  );
}
