import { useState } from 'react';
import type { Payment } from '@/types';
import { paymentService, type CreatePaymentDTO } from '../services';

export interface UsePaymentMutationsOptions {
  onSuccess?: (payment: Payment) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to handle payment mutations (create, update metadata).
 */
export function usePaymentMutations(options?: UsePaymentMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPayment = async (data: CreatePaymentDTO) => {
    try {
      setIsLoading(true);
      setError(null);
      const payment = await paymentService.createPayment(data);
      options?.onSuccess?.(payment);
      return payment;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePayment = async (id: string, patch: Pick<Payment, 'reference' | 'notes'>) => {
    try {
      setIsLoading(true);
      setError(null);
      const payment = await paymentService.updatePayment(id, patch);
      options?.onSuccess?.(payment);
      return payment;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    createPayment,
    updatePayment,
  };
}
