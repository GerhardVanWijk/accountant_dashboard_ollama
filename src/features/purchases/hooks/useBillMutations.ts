import { useState } from 'react';
import type { Bill } from '@/types';
import { billService, type CreateBillDTO } from '../services';

export interface UseBillMutationsOptions {
  onSuccess?: (bill: Bill) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to handle bill mutations (create, update, delete, etc.).
 */
export function useBillMutations(options?: UseBillMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createBill = async (data: CreateBillDTO) => {
    try {
      setIsLoading(true);
      setError(null);
      const bill = await billService.createBill(data);
      options?.onSuccess?.(bill);
      return bill;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateBill = async (id: string, patch: Partial<Bill>) => {
    try {
      setIsLoading(true);
      setError(null);
      const bill = await billService.updateBill(id, patch);
      options?.onSuccess?.(bill);
      return bill;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBill = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await billService.deleteBill(id);
      options?.onSuccess?.(null as unknown as Bill);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const postBill = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const bill = await billService.postBill(id);
      options?.onSuccess?.(bill);
      return bill;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const recordPayment = async (id: string, amount: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const bill = await billService.recordPayment(id, amount);
      options?.onSuccess?.(bill);
      return bill;
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
    createBill,
    updateBill,
    deleteBill,
    postBill,
    recordPayment,
  };
}
