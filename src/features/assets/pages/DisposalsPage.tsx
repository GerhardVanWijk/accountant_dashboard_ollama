import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { BanknoteIcon, PackageXIcon, ScaleIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import { useAssetDisposals } from '../hooks/useAssetDisposals';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { DisposeAssetForm, type DisposeAssetFormInput } from '../components/DisposeAssetForm';
import { DisposalsTable } from '../components/DisposalsTable';
import { AssetDetailSheet } from '../components/AssetDetailSheet';
import { useDepreciation } from '../hooks/useDepreciation';

/**
 * Asset Disposals — route `/assets/disposals`. Real
 * useAssetDisposals()/assetDisposalService data; the gain/loss and VAT split
 * are read from the posted records, never recomputed here.
 */
export function DisposalsPage() {
  const { disposals, loading, error, refetch, disposeAsset } = useAssetDisposals();
  const { assets, loading: assetsLoading, refetch: refetchAssets } = useFixedAssets();
  const { history: depreciationHistory } = useDepreciation();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { taxRates } = useAllTaxRates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const closeDialog = () => {
    setDialogOpen(false);
    setDirty(false);
  };
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAssetId = searchParams.get('record') ?? undefined;
  const openRecord = (id: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  const closeRecord = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });

  const disposableAssets = assets.filter((a) => a.status === 'active' || a.status === 'fully_depreciated');
  const busy = loading || assetsLoading || accountsLoading;

  const totalProceeds = disposals.reduce((s, d) => s + d.proceeds, 0);
  const netGainLoss = disposals.reduce((s, d) => s + d.gainLoss, 0);

  const handleDispose = async (input: DisposeAssetFormInput) => {
    setActionError(null);
    try {
      await disposeAsset(input);
      await refetchAssets();
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to dispose the asset.');
    }
  };

  const detailAsset = assets.find((a) => a.id === selectedAssetId);
  const detailDisposal = disposals.find((d) => d.assetId === selectedAssetId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asset disposals"
        description="Derecognise a fixed asset and record the resulting gain or loss."
        actions={
          <Button size="sm" variant="destructive" disabled={busy || disposableAssets.length === 0} onClick={() => setDialogOpen(true)}>
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

      <StatTileGrid
        columns={3}
        metrics={[
          { label: 'Available for disposal', value: String(disposableAssets.length), hint: 'Capitalized, still on the books', icon: PackageXIcon },
          { label: 'Proceeds recognised', value: formatCurrency(totalProceeds), hint: `${disposals.length} disposal${disposals.length === 1 ? '' : 's'}`, icon: BanknoteIcon },
          { label: 'Net gain / loss', value: formatCurrency(netGainLoss), hint: 'Across all disposals', icon: ScaleIcon, tone: netGainLoss < 0 ? 'warning' : 'default' },
        ]}
      />

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
        <SectionCard title="Disposal history" description="Every disposed asset, its carrying value at disposal, proceeds and resulting gain or loss.">
          <DisposalsTable disposals={disposals} assets={assets} onSelectAsset={openRecord} />
        </SectionCard>
      )}

      <AssetDetailSheet
        asset={detailAsset}
        depreciationHistory={depreciationHistory}
        disposal={detailDisposal}
        accounts={accounts}
        open={Boolean(selectedAssetId)}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
      />

      {dialogOpen && (
        <FormShell open onClose={closeDialog} size="md" mode="edit" isDirty={dirty}>
          <FormHeader title="Dispose asset" />
          <DisposeAssetForm assets={assets} accounts={accounts} taxRates={taxRates} onSubmit={handleDispose} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}
    </div>
  );
}
