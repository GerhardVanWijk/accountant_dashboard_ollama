import { useState } from 'react';
import type { FixedAsset } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { AssetForm } from '../components/AssetForm';
import { PostAcquisitionForm } from '../components/PostAcquisitionForm';
import { AssetsTable } from '../components/AssetsTable';
import { Modal } from '../components/Modal';
import type { CreateFixedAssetDTO, UpdateFixedAssetDTO } from '../services';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; asset: FixedAsset }
  | { mode: 'post-acquisition'; asset: FixedAsset }
  | null;

/** Asset Register — route `/assets/register` (docs/ROUTES.md). */
export function AssetRegisterPage() {
  const { assets, loading, error, refetch, createFixedAsset, updateFixedAsset, deleteFixedAsset, postAcquisition } = useFixedAssets();
  const { accounts, loading: accountsLoading } = useAccounts();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Fixed Asset Register</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Register, capitalize, and track fixed assets. /assets/register
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Asset</Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading fixed assets…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {assets.length === 0 ? (
            <EmptyState
              title="No fixed assets yet"
              message="Add an asset to start the register."
              action={<Button onClick={() => setDialog({ mode: 'create' })}>New Asset</Button>}
            />
          ) : (
            <AssetsTable
              assets={assets}
              onEdit={(asset) => setDialog({ mode: 'edit', asset })}
              onPostAcquisition={(asset) => setDialog({ mode: 'post-acquisition', asset })}
              onDelete={handleDelete}
            />
          )}
        </Card>
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Asset' : 'New Asset'} onClose={() => setDialog(null)}>
          <AssetForm asset={dialog.mode === 'edit' ? dialog.asset : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />
        </Modal>
      )}

      {dialog?.mode === 'post-acquisition' && (
        <Modal title="Post Acquisition" onClose={() => setDialog(null)}>
          <PostAcquisitionForm asset={dialog.asset} accounts={accounts} onSubmit={handlePostAcquisition} onCancel={() => setDialog(null)} />
        </Modal>
      )}
    </div>
  );
}
