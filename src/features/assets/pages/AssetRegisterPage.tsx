import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { FixedAsset } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { CircleCheckIcon, CircleDollarSignIcon, TrendingDownIcon, WalletCardsIcon } from 'lucide-react';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { formatCurrency, formatPercent } from '@/lib/app/format';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useDepreciation } from '../hooks/useDepreciation';
import { useEstimateRevisions } from '../hooks/useEstimateRevisions';
import { useAssetDisposals } from '../hooks/useAssetDisposals';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useAssetRegisterHealth } from '../hooks/useAssetRegisterHealth';
import { AssetFormModal } from '../components/AssetFormModal';
import { PostAcquisitionFormModal } from '../components/PostAcquisitionFormModal';
import { ReviseEstimateForm } from '../components/ReviseEstimateForm';
import { DisposeAssetForm, type DisposeAssetFormInput } from '../components/DisposeAssetForm';
import { AssetsTable } from '../components/AssetsTable';
import { AssetDetailSheet } from '../components/AssetDetailSheet';
import { AssetRegisterHealthCard } from '../components/AssetRegisterHealthCard';
import type { CreateFixedAssetDTO, ReviseEstimateInput, UpdateFixedAssetDTO } from '../services';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; asset: FixedAsset }
  | { mode: 'post-acquisition'; asset: FixedAsset }
  | { mode: 'revise'; asset: FixedAsset }
  | { mode: 'dispose'; asset: FixedAsset }
  | null;

/**
 * Fixed Asset Register — route `/assets/register`. Cost, accumulated
 * depreciation and carrying value are read straight off the FixedAsset
 * record, never recomputed here; the Register Health card reconciles the
 * register total to the GL and runs the integrity sweep.
 */
export function AssetRegisterPage() {
  const { assets, loading, error, refetch, createFixedAsset, updateFixedAsset, deleteFixedAsset, postAcquisition, reviseEstimate } = useFixedAssets();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { taxRates } = useAllTaxRates();
  const { history: depreciationHistory } = useDepreciation();
  const { revisions, refetch: refetchRevisions } = useEstimateRevisions();
  const { disposals, disposeAsset } = useAssetDisposals();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAssetId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedAssetId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }
  const detailAsset = assets.find((a) => a.id === selectedAssetId);
  const detailDisposal = disposals.find((d) => d.assetId === selectedAssetId);

  const busy = loading || accountsLoading;
  const health = useAssetRegisterHealth(assets, depreciationHistory, disposals, accounts, !busy && !error, revisions);

  const closeDialog = () => {
    setDialog(null);
    setDirty(false);
  };

  const handleFormSubmit = async (data: CreateFixedAssetDTO | UpdateFixedAssetDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') await updateFixedAsset(dialog.asset.id, data as UpdateFixedAssetDTO);
      else await createFixedAsset(data as CreateFixedAssetDTO);
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the asset.');
    }
  };

  const handlePostAcquisition = async (contraAccountId: string) => {
    if (dialog?.mode !== 'post-acquisition') return;
    setActionError(null);
    try {
      await postAcquisition(dialog.asset.id, contraAccountId);
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post the acquisition.');
    }
  };

  const handleRevise = async (input: ReviseEstimateInput) => {
    if (dialog?.mode !== 'revise') return;
    setActionError(null);
    try {
      await reviseEstimate(dialog.asset.id, input);
      await refetchRevisions();
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revise the estimate.');
    }
  };

  const handleDispose = async (input: DisposeAssetFormInput) => {
    setActionError(null);
    try {
      await disposeAsset(input);
      await refetch();
      await health.refetch();
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to dispose the asset.');
    }
  };

  const handleDelete = async (asset: FixedAsset) => {
    if (!window.confirm(`Delete draft asset "${asset.assetNumber} - ${asset.name}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteFixedAsset(asset.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the asset.');
    }
  };

  const totalCost = assets.filter((a) => a.status !== 'draft' && a.status !== 'disposed').reduce((sum, a) => sum + a.cost, 0);
  const totalAccumDep = assets.filter((a) => a.status !== 'draft' && a.status !== 'disposed').reduce((sum, a) => sum + a.accumulatedDepreciation, 0);
  const totalCarrying = totalCost - totalAccumDep;
  const depreciatedShare = totalCost > 0 ? (totalAccumDep / totalCost) * 100 : 0;
  const activeCount = assets.filter((a) => a.status === 'active').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fixed assets"
        description="Cost less accumulated depreciation gives the carrying value that appears on the balance sheet."
        actions={
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
            <Plus data-icon="inline-start" />
            New asset
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <StatTileGrid
        columns={4}
        metrics={[
          { label: 'Cost', value: formatCurrency(totalCost), hint: `${assets.filter((a) => a.status !== 'draft' && a.status !== 'disposed').length} assets on the books`, icon: WalletCardsIcon },
          { label: 'Accumulated depreciation', value: formatCurrency(totalAccumDep), hint: `${formatPercent(depreciatedShare)} of cost written off`, icon: TrendingDownIcon },
          { label: 'Carrying value', value: formatCurrency(totalCarrying), hint: 'Cost less depreciation', icon: CircleDollarSignIcon },
          { label: 'Active', value: String(activeCount), hint: 'Currently depreciating', icon: CircleCheckIcon },
        ]}
      />

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading fixed assets…</p>
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
        <>
          <AssetRegisterHealthCard
            reconciliation={health.reconciliation}
            integrity={health.integrity}
            loading={health.loading}
            error={health.error}
            onRefresh={() => void health.refetch()}
            onOpenAsset={openRecord}
          />

          <SectionCard title="Asset register" description="Every capitalized item, its depreciation to date and where it sits.">
            <AssetsTable
              assets={assets}
              onEdit={(asset) => setDialog({ mode: 'edit', asset })}
              onPostAcquisition={(asset) => setDialog({ mode: 'post-acquisition', asset })}
              onDelete={(asset) => void handleDelete(asset)}
              onSelect={(asset) => openRecord(asset.id)}
            />
          </SectionCard>
        </>
      )}

      <AssetDetailSheet
        asset={detailAsset}
        depreciationHistory={depreciationHistory}
        disposal={detailDisposal}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        onRevise={(asset) => setDialog({ mode: 'revise', asset })}
        onDispose={(asset) => setDialog({ mode: 'dispose', asset })}
      />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <AssetFormModal
          asset={dialog.mode === 'edit' ? dialog.asset : undefined}
          accounts={accounts}
          onSubmit={handleFormSubmit}
          onClose={closeDialog}
        />
      )}

      {dialog?.mode === 'post-acquisition' && (
        <PostAcquisitionFormModal asset={dialog.asset} accounts={accounts} onSubmit={handlePostAcquisition} onClose={closeDialog} />
      )}

      {dialog?.mode === 'revise' && (
        <FormShell open onClose={closeDialog} size="md" mode="edit" isDirty={dirty}>
          <FormHeader title="Revise estimate" />
          <ReviseEstimateForm
            asset={dialog.asset}
            revisions={revisions.filter((r) => r.assetId === dialog.asset.id)}
            onSubmit={handleRevise}
            onCancel={closeDialog}
            onDirtyChange={setDirty}
          />
        </FormShell>
      )}

      {dialog?.mode === 'dispose' && (
        <FormShell open onClose={closeDialog} size="md" mode="edit" isDirty={dirty}>
          <FormHeader title="Dispose asset" />
          <DisposeAssetForm assets={[dialog.asset]} accounts={accounts} taxRates={taxRates} onSubmit={handleDispose} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}
    </div>
  );
}
