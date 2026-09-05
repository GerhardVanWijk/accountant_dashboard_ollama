import { useEffect, useState } from 'react';
import type { ReturnNote } from '@/types';
import { returnNoteService } from '../services';

export interface UseReturnNotesOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the return notes list (Phase 5D). */
export function useReturnNotes(options?: UseReturnNotesOptions) {
  const [returnNotes, setReturnNotes] = useState<ReturnNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReturnNotes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await returnNoteService.listReturnNotes();
      setReturnNotes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    returnNotes,
    isLoading,
    loading: isLoading,
    error,
    refetch: fetchReturnNotes,
  };
}
