import { useState } from 'react';
import type { CustomerReceipt } from '@/types';
import { customerReceiptService, type CreateCustomerReceiptDTO } from '../services';

export interface UseCustomerReceiptMutationsOptions {
  onSuccess?: (receipt: CustomerReceipt) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle customer receipt mutations (record, allocate). */
export function useCustomerReceiptMutations(options?: UseCustomerReceiptMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>, notify: (result: T) => void): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fn();
      notify(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const recordReceipt = (data: CreateCustomerReceiptDTO) =>
    run(() => customerReceiptService.recordReceipt(data), (r) => options?.onSuccess?.(r));

  const allocateToInvoice = (id: string, invoiceId: string, amount: number) =>
    run(() => customerReceiptService.allocateToInvoice(id, invoiceId, amount), (r) => options?.onSuccess?.(r));

  return {
    isLoading,
    error,
    recordReceipt,
    allocateToInvoice,
  };
}
