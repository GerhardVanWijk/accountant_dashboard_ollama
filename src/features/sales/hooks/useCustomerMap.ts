import { useEffect, useState } from 'react';
import type { Customer } from '@/types';
import { customerService } from '@/features/customers/services/customerService';

function getCustomerService() {
  return customerService;
}

export function useCustomerMap() {
  const [customers, setCustomers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const service = getCustomerService();
    service
      .getCustomers()
      .then((data: Customer[]) => {
        const map = new Map(data.map((c) => [c.id, c.name]));
        setCustomers(map);
        setError(null);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { customers, loading, error };
}

export function useCustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const service = getCustomerService();
    service
      .getCustomers()
      .then((data: Customer[]) => {
        setCustomers(data);
        setError(null);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { customers, loading, error };
}
