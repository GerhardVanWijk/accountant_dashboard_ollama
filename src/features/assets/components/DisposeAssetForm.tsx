import { useState } from 'react';
import type { Account, FixedAsset } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';

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
 * here is exactly what will post.
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
    return <p className="text-sm text-text-secondary">No capitalized assets are available to dispose.</p>;
  }

  return (
    <div className="flex flex-col gap-md">
      <div>
        <label className={fieldLabel} htmlFor="assetId">
          Asset
        </label>
        <select id="assetId" className={fieldInput} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          {disposable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.assetNumber} - {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="disposalDate">
            Disposal Date
          </label>
          <input
            id="disposalDate"
            type="date"
            className={fieldInput}
            value={disposalDate}
            onChange={(e) => setDisposalDate(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="proceeds">
            Proceeds
          </label>
          <input
            id="proceeds"
            type="number"
            step="0.01"
            className={fieldInput}
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
          />
          {proceedsError && <p className={fieldError}>Proceeds cannot be negative</p>}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="proceedsAccountId">
          Proceeds Account
        </label>
        <select
          id="proceedsAccountId"
          className={fieldInput}
          value={proceedsAccountId}
          onChange={(e) => setProceedsAccountId(e.target.value)}
        >
          {accounts
            .filter((a) => a.isActive)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
        </select>
        <p className={fieldHint}>Where the disposal proceeds land — Cash and Bank, or Accounts Receivable if on credit.</p>
      </div>

      {asset && (
        <div className="rounded-md border border-border bg-background p-md text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Carrying Value</span>
            <span className="font-medium tabular-nums">{formatCurrency(carryingValue)}</span>
          </div>
          <div className="mt-xs flex justify-between">
            <span className="text-text-secondary">{gainLoss >= 0 ? 'Gain' : 'Loss'} on Disposal</span>
            <FinancialNumber value={gainLoss} format={formatCurrency} showFlash={false} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={submit} disabled={submitting || !asset || proceedsError}>
          Dispose Asset
        </Button>
      </div>
    </div>
  );
}
