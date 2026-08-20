import { useCallback, useEffect, useState } from 'react';
import type { StockMovement } from '@/types';
import {
  stockService,
  type AdjustStockInput,
  type OpeningStockInput,
  type StockLevel,
  type TransferStockInput,
} from '../services/stockService';

export interface UseStockMovementsResult {
  movements: StockMovement[];
  stockLevels: StockLevel[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  transferStock: (input: TransferStockInput) => Promise<[StockMovement, StockMovement]>;
  adjustStock: (input: AdjustStockInput) => Promise<StockMovement>;
  recordOpeningStock: (input: OpeningStockInput) => Promise<StockMovement>;
}

/**
 * Component -> Hook -> Service -> Repository chain for the stock movement
 * ledger (docs/ARCHITECTURE.md). Exposes the append-only ledger plus the
 * derived per-product/per-warehouse stock levels that power the
 * Warehouses page's "stock by warehouse" view — every mutation goes
 * through stockService so the ledger stays the single source of truth
 * (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export function useStockMovements(): UseStockMovementsResult {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [movementData, levelData] = await Promise.all([
        stockService.getMovements(),
        stockService.getStockLevels(),
      ]);
      setMovements(movementData);
      setStockLevels(levelData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock movements'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const transferStock = useCallback(
    async (input: TransferStockInput) => {
      const result = await stockService.transferStock(input);
      await refetch();
      return result;
    },
    [refetch],
  );

  const adjustStock = useCallback(
    async (input: AdjustStockInput) => {
      const result = await stockService.adjustStock(input);
      await refetch();
      return result;
    },
    [refetch],
  );

  const recordOpeningStock = useCallback(
    async (input: OpeningStockInput) => {
      const result = await stockService.recordOpeningStock(input);
      await refetch();
      return result;
    },
    [refetch],
  );

  return { movements, stockLevels, loading, error, refetch, transferStock, adjustStock, recordOpeningStock };
}
