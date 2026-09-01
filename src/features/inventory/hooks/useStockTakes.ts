import { useCallback, useEffect, useState } from 'react';
import type { ID, StockTake } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import {
  stockTakeService,
  type CreateStockTakeDTO,
  type StockTakeCountInput,
  type UpdateStockTakeDTO,
} from '../services/stockTakeService';

export interface UseStockTakesResult {
  stockTakes: StockTake[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createStockTake: (data: CreateStockTakeDTO) => Promise<StockTake>;
  updateStockTake: (id: ID, patch: UpdateStockTakeDTO) => Promise<StockTake>;
  deleteStockTake: (id: ID) => Promise<void>;
  freeze: (id: ID) => Promise<StockTake>;
  enterCounts: (id: ID, counts: StockTakeCountInput[]) => Promise<StockTake>;
  markReadyForReview: (id: ID) => Promise<StockTake>;
  postStockTake: (id: ID) => Promise<StockTake>;
  cancelStockTake: (id: ID) => Promise<StockTake>;
  previewPostEffect: (id: ID) => Promise<AccountingEffectPreview>;
}

/**
 * Component → Hook → Service chain (docs/ARCHITECTURE.md) for the
 * draft→counting→ready_for_review→posted stock-take lifecycle
 * (stockTakeService.ts, migration 0028 / Phase 3C freeze executor).
 */
export function useStockTakes(): UseStockTakesResult {
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStockTakes(await stockTakeService.getStockTakes());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock takes'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createStockTake = useCallback(
    async (data: CreateStockTakeDTO) => {
      const created = await stockTakeService.createStockTake(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateStockTake = useCallback(
    async (id: ID, patch: UpdateStockTakeDTO) => {
      const updated = await stockTakeService.updateStockTake(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteStockTake = useCallback(
    async (id: ID) => {
      await stockTakeService.deleteStockTake(id);
      await refetch();
    },
    [refetch],
  );

  const freeze = useCallback(
    async (id: ID) => {
      const updated = await stockTakeService.freeze(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const enterCounts = useCallback(
    async (id: ID, counts: StockTakeCountInput[]) => {
      const updated = await stockTakeService.enterCounts(id, counts);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const markReadyForReview = useCallback(
    async (id: ID) => {
      const updated = await stockTakeService.markReadyForReview(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const postStockTake = useCallback(
    async (id: ID) => {
      const updated = await stockTakeService.postStockTake(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const cancelStockTake = useCallback(
    async (id: ID) => {
      const updated = await stockTakeService.cancelStockTake(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const previewPostEffect = useCallback(async (id: ID) => stockTakeService.previewPostEffect(id), []);

  return {
    stockTakes,
    loading,
    error,
    refetch,
    createStockTake,
    updateStockTake,
    deleteStockTake,
    freeze,
    enterCounts,
    markReadyForReview,
    postStockTake,
    cancelStockTake,
    previewPostEffect,
  };
}
