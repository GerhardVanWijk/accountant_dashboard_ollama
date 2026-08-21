import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/types';
import { purchaseOrderService } from '../services';

export interface UsePurchaseOrdersOptions {
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch and manage purchase orders.
 */
export function usePurchaseOrders(options?: UsePurchaseOrdersOptions) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPurchaseOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await purchaseOrderService.getPurchaseOrders();
      setPurchaseOrders(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    purchaseOrders,
    isLoading,
    error,
    refetch: fetchPurchaseOrders,
  };
}
