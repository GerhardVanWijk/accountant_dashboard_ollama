import { useCallback, useEffect, useState } from 'react';
import type { FixedAsset } from '@/types';
import { fixedAssetService, type CreateFixedAssetDTO, type UpdateFixedAssetDTO } from '../services';

export interface UseFixedAssetsResult {
  assets: FixedAsset[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createFixedAsset: (data: CreateFixedAssetDTO) => Promise<FixedAsset>;
  updateFixedAsset: (id: string, patch: UpdateFixedAssetDTO) => Promise<FixedAsset>;
  deleteFixedAsset: (id: string) => Promise<void>;
  postAcquisition: (id: string, contraAccountId: string) => Promise<FixedAsset>;
}

/** Component -> Hook -> Service -> Repository chain for the Fixed Asset Register (docs/ARCHITECTURE.md). */
export function useFixedAssets(): UseFixedAssetsResult {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await fixedAssetService.getFixedAssets());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load fixed assets'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createFixedAsset = useCallback(
    async (data: CreateFixedAssetDTO) => {
      const created = await fixedAssetService.createFixedAsset(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateFixedAsset = useCallback(
    async (id: string, patch: UpdateFixedAssetDTO) => {
      const updated = await fixedAssetService.updateFixedAsset(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteFixedAsset = useCallback(
    async (id: string) => {
      await fixedAssetService.deleteFixedAsset(id);
      await refetch();
    },
    [refetch],
  );

  const postAcquisition = useCallback(
    async (id: string, contraAccountId: string) => {
      const updated = await fixedAssetService.postAcquisition(id, contraAccountId);
      await refetch();
      return updated;
    },
    [refetch],
  );

  return { assets, loading, error, refetch, createFixedAsset, updateFixedAsset, deleteFixedAsset, postAcquisition };
}
