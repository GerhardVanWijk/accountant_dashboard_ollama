import { useEffect, useState } from 'react';
import type { Customer } from '@/types';
import { customerService } from '../services/customerService';

interface UseCustomersResult {
  customers: Customer[];
  loading: boolean;
  error: Error | null;
}

/**
 * Reference hook proving the repository pattern end-to-end:
 * component -> useCustomers -> customerService -> MockCustomerRepository.
 * The customers-bee will replace/extend this with real list-page logic.
 */
export function useCustomers(): UseCustomersResult {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
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
  }, []);

  return { customers, loading, error };
}
