import { useEffect, useState } from 'react';
import type { Bill } from '@/types';
import { billService } from '../services';

export interface UseBillsOptions {
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch and manage bills.
 * Provides loading, error, and data states.
 */
export function useBills(options?: UseBillsOptions) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBills = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await billService.getBills();
      setBills(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    bills,
    isLoading,
    error,
    refetch: fetchBills,
  };
}
