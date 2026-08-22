import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAssetDisposals } from '../hooks/useAssetDisposals';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { DisposeAssetForm } from '../components/DisposeAssetForm';
import { DisposalsTable } from '../components/DisposalsTable';
import { Modal } from '../components/Modal';

/** Disposals — route `/assets/disposals` (docs/ROUTES.md). */
export function DisposalsPage() {
  const { disposals, loading, error, refetch, disposeAsset } = useAssetDisposals();
  const { assets, loading: assetsLoading, refetch: refetchAssets } = useFixedAssets();
  const { accounts, loading: accountsLoading } = useAccounts();
  const [dialogOpen, setDialogOpen] = useState(false);
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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Asset Disposals</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Dispose of a fixed asset and record the resulting gain or loss. /assets/disposals
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={busy || disposableCount === 0}>
          Dispose Asset
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading disposals…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {disposals.length === 0 ? (
            <EmptyState title="No disposals yet" message="Dispose of a capitalized asset to record it here." />
          ) : (
            <DisposalsTable disposals={disposals} assets={assets} />
          )}
        </Card>
      )}

      {dialogOpen && (
        <Modal title="Dispose Asset" onClose={() => setDialogOpen(false)}>
          <DisposeAssetForm assets={assets} accounts={accounts} onSubmit={handleDispose} onCancel={() => setDialogOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
