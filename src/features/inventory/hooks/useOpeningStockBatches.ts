import { useCallback, useEffect, useState } from 'react';
import type { ID, OpeningStockBatch } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import {
  openingStockBatchService,
  type CreateOpeningStockBatchDTO,
  type UpdateOpeningStockBatchDTO,
} from '../services/openingStockBatchService';

export interface UseOpeningStockBatchesResult {
  batches: OpeningStockBatch[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createBatch: (data: CreateOpeningStockBatchDTO) => Promise<OpeningStockBatch>;
  updateBatch: (id: ID, patch: UpdateOpeningStockBatchDTO) => Promise<OpeningStockBatch>;
  deleteBatch: (id: ID) => Promise<void>;
  confirmBatch: (id: ID) => Promise<OpeningStockBatch>;
  cancelBatch: (id: ID) => Promise<OpeningStockBatch>;
  previewAccountingEffect: (id: ID) => Promise<AccountingEffectPreview>;
}

/**
 * Component → Hook → Service chain (docs/ARCHITECTURE.md) for the
 * draft→confirmed opening-stock-batch lifecycle
 * (openingStockBatchService.ts, migration 0029). `confirmBatch()` always
 * passes `{ confirmed: true }` — the explicit-confirmation gate itself
 * lives in the UI (a checkbox on `OpeningStockBatchDetailSheet`, not
 * here), matching docs/INVENTORY_ACCOUNTING.md § "Opening stock batch".
 */
export function useOpeningStockBatches(): UseOpeningStockBatchesResult {
  const [batches, setBatches] = useState<OpeningStockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBatches(await openingStockBatchService.getOpeningStockBatches());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load opening stock batches'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createBatch = useCallback(
    async (data: CreateOpeningStockBatchDTO) => {
      const created = await openingStockBatchService.createOpeningStockBatch(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateBatch = useCallback(
    async (id: ID, patch: UpdateOpeningStockBatchDTO) => {
      const updated = await openingStockBatchService.updateOpeningStockBatch(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteBatch = useCallback(
    async (id: ID) => {
      await openingStockBatchService.deleteOpeningStockBatch(id);
      await refetch();
    },
    [refetch],
  );

  const confirmBatch = useCallback(
    async (id: ID) => {
      const updated = await openingStockBatchService.confirmBatch(id, { confirmed: true });
      await refetch();
      return updated;
    },
    [refetch],
  );

  const cancelBatch = useCallback(
    async (id: ID) => {
      const updated = await openingStockBatchService.cancelBatch(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const previewAccountingEffect = useCallback(async (id: ID) => openingStockBatchService.previewAccountingEffect(id), []);

  return { batches, loading, error, refetch, createBatch, updateBatch, deleteBatch, confirmBatch, cancelBatch, previewAccountingEffect };
}
