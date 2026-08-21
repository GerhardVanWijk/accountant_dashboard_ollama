import { useEffect, useState } from 'react';
import type { ID } from '@/types';
import { bankTransactionService } from '../services';
import type { BankTransactionWithAllocations } from '../types';

export interface UseBankTransactionsOptions {
  onError?: (error: Error) => void;
}

/** Fetches bank transactions, optionally filtered to one bank account. */
export function useBankTransactions(bankAccountId?: ID, options?: UseBankTransactionsOptions) {
  const [transactions, setTransactions] = useState<BankTransactionWithAllocations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await bankTransactionService.getTransactions(bankAccountId);
      setTransactions(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountId]);

  return { transactions, isLoading, error, refetch: fetchTransactions };
}
