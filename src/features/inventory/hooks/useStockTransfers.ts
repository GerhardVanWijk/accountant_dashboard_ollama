import { useCallback, useEffect, useState } from 'react';
import type { ID, StockTransfer } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import {
  stockTransferService,
  type CreateStockTransferDTO,
  type UpdateStockTransferDTO,
} from '../services/stockTransferService';

export interface UseStockTransfersResult {
  transfers: StockTransfer[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createTransfer: (data: CreateStockTransferDTO) => Promise<StockTransfer>;
  updateTransfer: (id: ID, patch: UpdateStockTransferDTO) => Promise<StockTransfer>;
  deleteTransfer: (id: ID) => Promise<void>;
  dispatch: (id: ID) => Promise<StockTransfer>;
  receive: (id: ID) => Promise<StockTransfer>;
  completeImmediate: (id: ID) => Promise<StockTransfer>;
  cancelTransfer: (id: ID) => Promise<StockTransfer>;
  previewDispatchEffect: (id: ID) => Promise<AccountingEffectPreview>;
  previewReceiveEffect: (id: ID) => Promise<AccountingEffectPreview>;
}

/**
 * Component → Hook → Service chain (docs/ARCHITECTURE.md) for the
 * draft→in_transit→completed (or draft→completed immediate) stock-transfer
 * lifecycle (stockTransferService.ts, migration 0027).
 */
export function useStockTransfers(): UseStockTransfersResult {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTransfers(await stockTransferService.getTransfers());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock transfers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createTransfer = useCallback(
    async (data: CreateStockTransferDTO) => {
      const created = await stockTransferService.createTransfer(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateTransfer = useCallback(
    async (id: ID, patch: UpdateStockTransferDTO) => {
      const updated = await stockTransferService.updateTransfer(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteTransfer = useCallback(
    async (id: ID) => {
      await stockTransferService.deleteTransfer(id);
      await refetch();
    },
    [refetch],
  );

  const dispatch = useCallback(
    async (id: ID) => {
      const updated = await stockTransferService.dispatch(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const receive = useCallback(
    async (id: ID) => {
      const updated = await stockTransferService.receive(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const completeImmediate = useCallback(
    async (id: ID) => {
      const updated = await stockTransferService.completeImmediate(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const cancelTransfer = useCallback(
    async (id: ID) => {
      const updated = await stockTransferService.cancelTransfer(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const previewDispatchEffect = useCallback(async (id: ID) => stockTransferService.previewDispatchEffect(id), []);
  const previewReceiveEffect = useCallback(async (id: ID) => stockTransferService.previewReceiveEffect(id), []);

  return {
    transfers,
    loading,
    error,
    refetch,
    createTransfer,
    updateTransfer,
    deleteTransfer,
    dispatch,
    receive,
    completeImmediate,
    cancelTransfer,
    previewDispatchEffect,
    previewReceiveEffect,
  };
}
