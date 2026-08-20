import { useCallback, useEffect, useState } from 'react';
import type { Customer } from '@/types';
import { customerService } from '../services/customerService';

interface UseCustomersResult {
  customers: Customer[];
  loading: boolean;
  error: Error | null;
  /** Re-runs the fetch — call after a create/edit/inactivate mutation. */
  refetch: () => void;
}

/**
 * List-page data hook: component -> useCustomers -> customerService ->
 * MockCustomerRepository. Search/filter/sort are handled client-side by
 * the list page (derived state), so this hook only owns fetch/loading/error.
 */
export function useCustomers(): UseCustomersResult {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    customerService
      .getCustomers()
      .then((data) => {
        if (!cancelled) setCustomers(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load customers'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { customers, loading, error, refetch };
}
