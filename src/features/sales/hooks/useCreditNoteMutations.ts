import { useState } from 'react';
import type { CreditNote } from '@/types';
import { creditNoteService, type CreateCreditNoteDTO } from '../services';

export interface UseCreditNoteMutationsOptions {
  onSuccess?: (creditNote: CreditNote) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle credit note mutations (create, issue, allocate, void). */
export function useCreditNoteMutations(options?: UseCreditNoteMutationsOptions) {
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

  const createCreditNote = (data: CreateCreditNoteDTO) =>
    run(() => creditNoteService.createCreditNote(data), (cn) => options?.onSuccess?.(cn));

  const issueCreditNote = (id: string) =>
    run(() => creditNoteService.issueCreditNote(id), (cn) => options?.onSuccess?.(cn));

  const allocateToInvoice = (id: string, invoiceId: string, amount: number) =>
    run(() => creditNoteService.allocateToInvoice(id, invoiceId, amount), (cn) => options?.onSuccess?.(cn));

  const voidCreditNote = (id: string) =>
    run(() => creditNoteService.voidCreditNote(id), (cn) => options?.onSuccess?.(cn));

  return {
    isLoading,
    error,
    createCreditNote,
    issueCreditNote,
    allocateToInvoice,
    voidCreditNote,
  };
}
