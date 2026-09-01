import { useCallback, useEffect, useState } from 'react';
import type { ID, StockAdjustment } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import {
  stockAdjustmentService,
  type CreateStockAdjustmentDTO,
  type UpdateStockAdjustmentDTO,
} from '../services/stockAdjustmentService';

export interface UseStockAdjustmentsResult {
  adjustments: StockAdjustment[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createAdjustment: (data: CreateStockAdjustmentDTO) => Promise<StockAdjustment>;
  updateAdjustment: (id: ID, patch: UpdateStockAdjustmentDTO) => Promise<StockAdjustment>;
  deleteAdjustment: (id: ID) => Promise<void>;
  submitForApproval: (id: ID) => Promise<StockAdjustment>;
  approve: (id: ID) => Promise<StockAdjustment>;
  postAdjustment: (id: ID) => Promise<StockAdjustment>;
  cancelAdjustment: (id: ID) => Promise<StockAdjustment>;
  reverseAdjustment: (id: ID, reason: string) => Promise<StockAdjustment>;
  previewAccountingEffect: (id: ID) => Promise<AccountingEffectPreview>;
}

/**
 * Component → Hook → Service chain (docs/ARCHITECTURE.md) for the
 * draft→pending_approval→posted stock-adjustment lifecycle
 * (stockAdjustmentService.ts, migration 0027). Every mutating call
 * refetches the register afterwards so a list screen never shows a stale
 * status badge or total after an action.
 */
export function useStockAdjustments(): UseStockAdjustmentsResult {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAdjustments(await stockAdjustmentService.getAdjustments());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock adjustments'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createAdjustment = useCallback(
    async (data: CreateStockAdjustmentDTO) => {
      const created = await stockAdjustmentService.createAdjustment(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateAdjustment = useCallback(
    async (id: ID, patch: UpdateStockAdjustmentDTO) => {
      const updated = await stockAdjustmentService.updateAdjustment(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteAdjustment = useCallback(
    async (id: ID) => {
      await stockAdjustmentService.deleteAdjustment(id);
      await refetch();
    },
    [refetch],
  );

  const submitForApproval = useCallback(
    async (id: ID) => {
      const updated = await stockAdjustmentService.submitForApproval(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const approve = useCallback(
    async (id: ID) => {
      const updated = await stockAdjustmentService.approve(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const postAdjustment = useCallback(
    async (id: ID) => {
      const updated = await stockAdjustmentService.postAdjustment(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const cancelAdjustment = useCallback(
    async (id: ID) => {
      const updated = await stockAdjustmentService.cancelAdjustment(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const reverseAdjustment = useCallback(
    async (id: ID, reason: string) => {
      const updated = await stockAdjustmentService.reverseAdjustment(id, reason);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const previewAccountingEffect = useCallback(async (id: ID) => stockAdjustmentService.previewAccountingEffect(id), []);

  return {
    adjustments,
    loading,
    error,
    refetch,
    createAdjustment,
    updateAdjustment,
    deleteAdjustment,
    submitForApproval,
    approve,
    postAdjustment,
    cancelAdjustment,
    reverseAdjustment,
    previewAccountingEffect,
  };
}
