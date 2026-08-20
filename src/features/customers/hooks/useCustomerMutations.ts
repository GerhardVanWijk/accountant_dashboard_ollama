import { useCallback, useState } from 'react';
import type { Customer } from '@/types';
import { customerService, type CreateCustomerDTO } from '../services/customerService';

interface UseCustomerMutationsResult {
  saving: boolean;
  error: Error | null;
  createCustomer: (data: CreateCustomerDTO) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<Customer>;
  inactivateCustomer: (id: string) => Promise<Customer>;
  activateCustomer: (id: string) => Promise<Customer>;
  setCreditHold: (id: string, creditHold: boolean) => Promise<Customer>;
}

/**
 * Wraps every write operation the Customer module performs, all routed
 * through the shared CustomerService (never a direct repository import,
 * per docs/DO_NOT_BREAK.md). Centralizing saving/error state here keeps
 * the form and detail-page components free of duplicated try/catch logic.
 */
export function useCustomerMutations(): UseCustomerMutationsResult {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaving(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error('Customer operation failed');
      setError(wrapped);
      throw wrapped;
    } finally {
      setSaving(false);
    }
  }, []);

  const createCustomer = useCallback((data: CreateCustomerDTO) => run(() => customerService.createCustomer(data)), [run]);
  const updateCustomer = useCallback(
    (id: string, patch: Partial<Customer>) => run(() => customerService.updateCustomer(id, patch)),
    [run],
  );
  const inactivateCustomer = useCallback((id: string) => run(() => customerService.inactivateCustomer(id)), [run]);
  const activateCustomer = useCallback((id: string) => run(() => customerService.activateCustomer(id)), [run]);
  const setCreditHold = useCallback(
    (id: string, creditHold: boolean) => run(() => customerService.setCreditHold(id, creditHold)),
    [run],
  );

  return { saving, error, createCustomer, updateCustomer, inactivateCustomer, activateCustomer, setCreditHold };
}
