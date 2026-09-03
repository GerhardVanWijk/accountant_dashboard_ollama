import { useState } from 'react';
import type { Quote } from '@/types';
import { quoteService, type CreateQuoteDTO } from '../services';

export interface UseQuoteMutationsOptions {
  onSuccess?: (quote: Quote) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle quote mutations (create, update, lifecycle transitions, conversion). */
export function useQuoteMutations(options?: UseQuoteMutationsOptions) {
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

  const createQuote = (data: CreateQuoteDTO) =>
    run(() => quoteService.createQuote(data), (q) => options?.onSuccess?.(q));

  const updateQuote = (id: string, patch: Partial<Quote>) =>
    run(() => quoteService.updateQuote(id, patch), (q) => options?.onSuccess?.(q));

  const deleteQuote = (id: string) =>
    run(() => quoteService.deleteQuote(id), () => options?.onSuccess?.(null as unknown as Quote));

  const markAsSent = (id: string) =>
    run(() => quoteService.markAsSent(id), (q) => options?.onSuccess?.(q));

  const markAsAccepted = (id: string) =>
    run(() => quoteService.markAsAccepted(id), (q) => options?.onSuccess?.(q));

  const markAsDeclined = (id: string) =>
    run(() => quoteService.markAsDeclined(id), (q) => options?.onSuccess?.(q));

  const convertToSalesOrder = (id: string) =>
    run(() => quoteService.convertToSalesOrder(id), () => undefined);

  const duplicateQuote = (id: string) =>
    run(() => quoteService.duplicateQuote(id), (q) => options?.onSuccess?.(q));

  return {
    isLoading,
    error,
    createQuote,
    updateQuote,
    deleteQuote,
    markAsSent,
    markAsAccepted,
    markAsDeclined,
    convertToSalesOrder,
    duplicateQuote,
  };
}
