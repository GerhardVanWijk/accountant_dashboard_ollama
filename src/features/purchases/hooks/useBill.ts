import { useEffect, useState } from 'react';
import type { Bill } from '@/types';
import { billService } from '../services';

export interface UseBillOptions {
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch a single bill by ID.
 */
export function useBill(id: string | undefined, options?: UseBillOptions) {
  const [bill, setBill] = useState<Bill | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setBill(undefined);
      setIsLoading(false);
      return;
    }

    const fetchBill = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await billService.getBill(id);
        setBill(data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options?.onError?.(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBill();
  }, [id, options]);

  return {
    bill,
    isLoading,
    error,
  };
}
