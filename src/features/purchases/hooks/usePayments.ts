import { useEffect, useState } from 'react';
import type { Payment } from '@/types';
import { paymentService } from '../services';

export interface UsePaymentsOptions {
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch and manage payments.
 * Provides loading, error, and data states.
 */
export function usePayments(options?: UsePaymentsOptions) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await paymentService.getPayments();
      setPayments(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    payments,
    isLoading,
    error,
    refetch: fetchPayments,
  };
}
