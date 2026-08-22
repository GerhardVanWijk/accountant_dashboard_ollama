import { useState } from 'react';
import type { Account, FixedAsset } from '@/types';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface PostAcquisitionFormProps {
  asset: FixedAsset;
  accounts: Account[];
  onSubmit: (contraAccountId: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Capitalizes a draft asset: the user picks the funding source (typically
 * Accounts Payable if bought on credit, Cash and Bank if paid
 * immediately) and fixedAssetService.postAcquisition() posts
 * DR Fixed Asset / CR that account for the full cost.
 */
export function PostAcquisitionForm({ asset, accounts, onSubmit, onCancel }: PostAcquisitionFormProps) {
  const contraCandidates = accounts.filter(
    (a) => a.isActive && a.id !== asset.glAssetAccountId && a.id !== asset.glAccumulatedDepreciationAccountId,
  );
  const [contraAccountId, setContraAccountId] = useState(contraCandidates[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!contraAccountId) return;
    setSubmitting(true);
    try {
      await onSubmit(contraAccountId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-secondary">
        Capitalizing <span className="font-medium text-text-primary">{asset.assetNumber} - {asset.name}</span> for{' '}
        <span className="font-medium tabular-nums">{formatCurrency(asset.cost)}</span>.
      </p>
      <div>
        <label className={fieldLabel} htmlFor="contraAccountId">
          Funding Source
        </label>
        <select
          id="contraAccountId"
          className={fieldInput}
          value={contraAccountId}
          onChange={(e) => setContraAccountId(e.target.value)}
        >
          {contraCandidates.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
        <p className={fieldHint}>
          The account credited for the acquisition — Accounts Payable if bought on credit, Cash and Bank if paid
          immediately.
        </p>
      </div>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || !contraAccountId}>
          Post Acquisition
        </Button>
      </div>
    </div>
  );
}
