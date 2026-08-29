import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { useAssetDisposals } from '../hooks/useAssetDisposals';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { DisposeAssetForm } from '../components/DisposeAssetForm';
import { DisposalsTable } from '../components/DisposalsTable';

/**
 * Asset Disposals — route `/assets/disposals`. Real
 * useAssetDisposals()/assetDisposalService data; disposal (with its
 * gain/loss) is a real, permanent status change on the FixedAsset — never
 * an invented hard delete. No literal v0 template exists for this report
 * — re-skinned onto v0's general PageHeader/SectionCard/Dialog language
 * (M8).
 */
export function DisposalsPage() {
  const { disposals, loading, error, refetch, disposeAsset } = useAssetDisposals();
  const { assets, loading: assetsLoading, refetch: refetchAssets } = useFixedAssets();
  const { accounts, loading: accountsLoading } = useAccounts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const closeDialog = () => { setDialogOpen(false); setDirty(false); };
  const [actionError, setActionError] = useState<string | null>(null);

  const disposableCount = assets.filter((a) => a.status === 'active' || a.status === 'fully_depreciated').length;
  const busy = loading || assetsLoading || accountsLoading;

  const handleDispose = async (input: { assetId: string; disposalDate: string; proceeds: number; proceedsAccountId: string }) => {
    setActionError(null);
    try {
      await disposeAsset(input);
      await refetchAssets();
      setDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to dispose the asset.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asset disposals"
        description="Dispose of a fixed asset and record the resulting gain or loss."
        actions={
          <Button size="sm" variant="destructive" disabled={busy || disposableCount === 0} onClick={() => setDialogOpen(true)}>
            <Trash2 data-icon="inline-start" />
            Dispose asset
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading disposals…</p>
        </div>
      )}
      {!busy && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!busy && !error && (
        <SectionCard title="Disposal history" description="Every disposed asset, its carrying value, proceeds and resulting gain or loss.">
          <DisposalsTable disposals={disposals} assets={assets} />
        </SectionCard>
      )}

      {dialogOpen && (
        <FormShell open onClose={closeDialog} size="sm" mode="edit" isDirty={dirty}>
          <FormHeader title="Dispose asset" />
          <DisposeAssetForm assets={assets} accounts={accounts} onSubmit={handleDispose} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}
    </div>
  );
}
