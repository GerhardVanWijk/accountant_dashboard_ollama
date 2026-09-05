import { useCallback, useEffect, useState } from 'react';
import { accountMappingService, journalEntryService } from '@/features/accounting/services';
import { productService } from '../services/productService';
import { stockService } from '../services/stockService';
import { deliveryNoteService, returnNoteService } from '@/features/sales/services';
import { invoiceService } from '@/services';
import {
  reconcileGoodsDeliveredNotInvoiced,
  type GoodsDeliveredNotInvoicedResult,
} from '../services/reconcileGoodsDeliveredNotInvoiced';

export interface UseGoodsDeliveredNotInvoicedReconciliationResult {
  result: GoodsDeliveredNotInvoicedResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Phase 5C — see `reconcileGoodsDeliveredNotInvoiced`'s own doc comment. Read-only. */
export function useGoodsDeliveredNotInvoicedReconciliation(): UseGoodsDeliveredNotInvoicedReconciliationResult {
  const [result, setResult] = useState<GoodsDeliveredNotInvoicedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deliveryNotes, invoices, products, stockMovements, returnNotes] = await Promise.all([
        deliveryNoteService.listDeliveryNotes(),
        invoiceService.getInvoices(),
        productService.getProducts(),
        stockService.getMovements(),
        returnNoteService.listReturnNotes(),
      ]);
      setResult(
        await reconcileGoodsDeliveredNotInvoiced(
          { deliveryNotes, invoices, products, stockMovements, returnNotes },
          accountMappingService,
          journalEntryService,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reconcile Goods Delivered Not Invoiced'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { result, loading, error, refetch };
}
