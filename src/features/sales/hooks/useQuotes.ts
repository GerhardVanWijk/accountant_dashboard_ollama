import { useEffect, useState } from 'react';
import type { Quote } from '@/types';
import { quoteService } from '../services';

export interface UseQuotesOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the quotes list. */
export function useQuotes(options?: UseQuotesOptions) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchQuotes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await quoteService.getQuotes();
      setQuotes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    quotes,
    isLoading,
    error,
    refetch: fetchQuotes,
  };
}
