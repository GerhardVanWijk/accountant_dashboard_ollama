import { useEffect, useState } from 'react';
import type { BankAccount } from '@/types';
import { bankAccountService } from '../services';

export interface UseBankAccountsOptions {
  onError?: (error: Error) => void;
}

/** Fetches and manages the Cash & Bank Accounts list, with loading/error state. */
export function useBankAccounts(options?: UseBankAccountsOptions) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBankAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await bankAccountService.getBankAccounts();
      setBankAccounts(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBankAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bankAccounts, isLoading, error, refetch: fetchBankAccounts };
}
