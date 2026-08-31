import { useCallback, useEffect, useState } from 'react';
import { accountMappingService, journalEntryService } from '@/features/accounting/services';
import { productService } from '../services/productService';
import { stockBalanceService } from '../services/stockBalanceService';
import { stockService } from '../services/stockService';
import {
  reconcileInventory,
  type InventoryReconciliationResult,
} from '../services/reconcileInventory';

export interface UseInventoryReconciliationResult {
  result: InventoryReconciliationResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Surfaces the Phase-3 `reconcileInventory()` engine (Review 3B) for the UI —
 * the Inventory Overview reconciliation card and, later, the Difference
 * Investigator (Phase 14). Read-only: it pulls products, the balance cache and
 * the movement ledger, resolves the Inventory Asset / Inventory-in-Transit
 * control accounts through the shared `accountMappingService` +
 * `journalEntryService`, and returns the exact subledger / GL / difference
 * figures. It never mutates anything.
 *
 * Check F (movement source-evidence) is deliberately NOT run here — it needs a
 * caller-built `knownDocumentRefs` set (a Phase-14 concern); the card reports
 * the A–E balance checks, which is what "is inventory reconciled?" means.
 */
export function useInventoryReconciliation(): UseInventoryReconciliationResult {
  const [result, setResult] = useState<InventoryReconciliationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, stockBalances, stockMovements] = await Promise.all([
        productService.getProducts(),
        stockBalanceService.getBalances(),
        stockService.getMovements(),
      ]);
      setResult(
        await reconcileInventory(
          { products, stockBalances, stockMovements },
          accountMappingService,
          journalEntryService,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reconcile inventory'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { result, loading, error, refetch };
}
