import { useEffect, useState } from 'react';
import type { CreditNote } from '@/types';
import { creditNoteService } from '../services';

export interface UseCreditNotesOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the credit notes list. */
export function useCreditNotes(options?: UseCreditNotesOptions) {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCreditNotes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await creditNoteService.getCreditNotes();
      setCreditNotes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    creditNotes,
    isLoading,
    error,
    refetch: fetchCreditNotes,
  };
}
