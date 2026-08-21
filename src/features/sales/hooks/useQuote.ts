import { useEffect, useState } from 'react';
import type { Quote } from '@/types';
import { quoteService } from '../services';

export interface UseQuoteOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch a single quote by ID. */
export function useQuote(id: string | undefined, options?: UseQuoteOptions) {
  const [quote, setQuote] = useState<Quote | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setQuote(undefined);
      setIsLoading(false);
      return;
    }

    const fetchQuote = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await quoteService.getQuote(id);
        setQuote(data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options?.onError?.(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { quote, isLoading, error };
}
