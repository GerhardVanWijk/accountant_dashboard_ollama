import { useState } from 'react';
import type { Account, FixedAsset } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { formatCurrency } from '@/lib/app/format';

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
 * DR Fixed Asset / CR that account for the full cost. Re-skinned onto
 * v0's Field (M8); posting logic unchanged.
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Capitalizing <span className="font-medium text-foreground">{asset.assetNumber} - {asset.name}</span> for{' '}
        <span className="font-medium tabular-nums">{formatCurrency(asset.cost)}</span>.
      </p>
      <Field>
        <FieldLabel htmlFor="contraAccountId">Funding Source</FieldLabel>
        <NativeSelect id="contraAccountId" value={contraAccountId} onChange={(e) => setContraAccountId(e.target.value)}>
          {contraCandidates.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>
          The account credited for the acquisition — Accounts Payable if bought on credit, Cash and Bank if paid
          immediately.
        </FieldDescription>
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !contraAccountId} onClick={() => void submit()}>
          Post Acquisition
        </Button>
      </div>
    </div>
  );
}
