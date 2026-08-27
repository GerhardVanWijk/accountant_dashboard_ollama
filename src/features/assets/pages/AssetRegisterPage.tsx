import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { FixedAsset } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { formatCurrency, formatPercent } from '@/lib/app/format';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useDepreciation } from '../hooks/useDepreciation';
import { useAssetDisposals } from '../hooks/useAssetDisposals';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { AssetForm } from '../components/AssetForm';
import { PostAcquisitionForm } from '../components/PostAcquisitionForm';
import { AssetsTable } from '../components/AssetsTable';
import { AssetDetailSheet } from '../components/AssetDetailSheet';
import type { CreateFixedAssetDTO, UpdateFixedAssetDTO } from '../services';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; asset: FixedAsset }
  | { mode: 'post-acquisition'; asset: FixedAsset }
  | null;

/**
 * Fixed Asset Register — route `/assets/register`. Real
 * useFixedAssets()/fixedAssetService data throughout — cost, accumulated
 * depreciation and carrying value are read straight off the FixedAsset
 * record, never recomputed here. Re-skinned onto v0's
 * PageHeader/SectionCard/FigureBlock/DataTable/Dialog (M8), matching
 * accounting-v0-frontend's Fixed Assets page shape.
 */
export function AssetRegisterPage() {
  const { assets, loading, error, refetch, createFixedAsset, updateFixedAsset, deleteFixedAsset, postAcquisition } = useFixedAssets();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { history: depreciationHistory } = useDepreciation();
  const { disposals } = useAssetDisposals();
  const [dialog, setDialog] = useState<DialogState>(null);
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

  const handleFormSubmit = async (data: CreateFixedAssetDTO | UpdateFixedAssetDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateFixedAsset(dialog.asset.id, data as UpdateFixedAssetDTO);
      } else {
        await createFixedAsset(data as CreateFixedAssetDTO);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the asset.');
    }
  };

  const handlePostAcquisition = async (contraAccountId: string) => {
    if (dialog?.mode !== 'post-acquisition') return;
    setActionError(null);
    try {
      await postAcquisition(dialog.asset.id, contraAccountId);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post the acquisition.');
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

  const busy = loading || accountsLoading;
  const totalCost = assets.reduce((sum, a) => sum + a.cost, 0);
  const totalAccumDep = assets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0);
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

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Cost" value={formatCurrency(totalCost)} hint={`${assets.length} assets on register`} />
          <FigureBlock label="Accumulated depreciation" value={formatCurrency(totalAccumDep)} hint={`${formatPercent(depreciatedShare)} of cost written off`} />
          <FigureBlock label="Carrying value" value={formatCurrency(totalCarrying)} hint="Cost less depreciation" />
          <FigureBlock label="Active" value={String(activeCount)} hint="Currently in use" />
        </div>
      </SectionCard>

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
        <SectionCard title="Asset register" description="Every capitalized item, its depreciation to date and where it sits.">
          <AssetsTable
            assets={assets}
            onEdit={(asset) => setDialog({ mode: 'edit', asset })}
            onPostAcquisition={(asset) => setDialog({ mode: 'post-acquisition', asset })}
            onDelete={(asset) => void handleDelete(asset)}
            onSelect={(asset) => openRecord(asset.id)}
          />
        </SectionCard>
      )}

      <AssetDetailSheet
        asset={detailAsset}
        depreciationHistory={depreciationHistory}
        disposal={detailDisposal}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
      />

      <Dialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Edit Asset' : 'New Asset'}</DialogTitle>
          </DialogHeader>
          {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
            <AssetForm asset={dialog.mode === 'edit' ? dialog.asset : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === 'post-acquisition'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post Acquisition</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'post-acquisition' && (
            <PostAcquisitionForm asset={dialog.asset} accounts={accounts} onSubmit={handlePostAcquisition} onCancel={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
