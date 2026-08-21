import { useEffect, useState } from 'react';
import type { CustomerReceipt } from '@/types';
import { customerReceiptService } from '../services';

export interface UseCustomerReceiptsOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the customer receipts list. */
export function useCustomerReceipts(options?: UseCustomerReceiptsOptions) {
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReceipts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await customerReceiptService.getReceipts();
      setReceipts(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    receipts,
    isLoading,
    error,
    refetch: fetchReceipts,
  };
}
