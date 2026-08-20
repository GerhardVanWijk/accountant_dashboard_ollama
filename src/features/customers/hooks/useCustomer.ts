import { useCallback, useEffect, useState } from 'react';
import type { Customer } from '@/types';
import { customerService } from '../services/customerService';

interface UseCustomerResult {
  customer: Customer | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Detail-page data hook for a single customer by id. */
export function useCustomer(id: string | undefined): UseCustomerResult {
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!id) {
      setCustomer(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    customerService
      .getCustomer(id)
      .then((data) => {
        if (!cancelled) setCustomer(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load customer'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { customer, loading, error, refetch };
}
