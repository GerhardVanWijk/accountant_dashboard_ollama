import { useEffect, useState } from 'react';
import type { SalesOrder } from '@/types';
import { salesOrderService } from '../services';

export interface UseSalesOrdersOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the sales orders list. */
export function useSalesOrders(options?: UseSalesOrdersOptions) {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSalesOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await salesOrderService.getSalesOrders();
      setSalesOrders(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    salesOrders,
    isLoading,
    error,
    refetch: fetchSalesOrders,
  };
}
