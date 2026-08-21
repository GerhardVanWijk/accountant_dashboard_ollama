import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/types';
import { purchaseOrderService } from '../services';

export interface UsePurchaseOrderOptions {
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch a single purchase order by ID.
 */
export function usePurchaseOrder(id: string | undefined, options?: UsePurchaseOrderOptions) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setPurchaseOrder(undefined);
      setIsLoading(false);
      return;
    }

    const fetchPurchaseOrder = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await purchaseOrderService.getPurchaseOrder(id);
        setPurchaseOrder(data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options?.onError?.(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchaseOrder();
  }, [id, options]);

  return {
    purchaseOrder,
    isLoading,
    error,
  };
}
