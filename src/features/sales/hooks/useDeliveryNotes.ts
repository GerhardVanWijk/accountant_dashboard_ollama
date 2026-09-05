import { useEffect, useState } from 'react';
import type { DeliveryNote } from '@/types';
import { deliveryNoteService } from '../services';

export interface UseDeliveryNotesOptions {
  onError?: (error: Error) => void;
}

/** Hook to fetch and manage the delivery notes list (Phase 5C). */
export function useDeliveryNotes(options?: UseDeliveryNotesOptions) {
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDeliveryNotes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await deliveryNoteService.listDeliveryNotes();
      setDeliveryNotes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    deliveryNotes,
    isLoading,
    loading: isLoading,
    error,
    refetch: fetchDeliveryNotes,
  };
}
