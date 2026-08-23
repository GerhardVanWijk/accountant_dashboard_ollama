import { useCallback, useEffect, useState } from 'react';
import type { RelatedPartyTransaction } from '@/types/relatedParty';
import {
  relatedPartyTransactionService,
  type CreateRelatedPartyTransactionDTO,
  type UpdateRelatedPartyTransactionDTO,
} from '../services';

export interface UseRelatedPartyTransactionsResult {
  transactions: RelatedPartyTransaction[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createTransaction: (data: CreateRelatedPartyTransactionDTO) => Promise<RelatedPartyTransaction>;
  updateTransaction: (id: string, patch: UpdateRelatedPartyTransactionDTO) => Promise<RelatedPartyTransaction>;
  deleteTransaction: (id: string) => Promise<void>;
}

/** Component -> Hook -> Service -> Repository chain for Related Party Transaction data (docs/ARCHITECTURE.md). */
export function useRelatedPartyTransactions(): UseRelatedPartyTransactionsResult {
  const [transactions, setTransactions] = useState<RelatedPartyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTransactions(await relatedPartyTransactionService.getTransactions());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load related party transactions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createTransaction = useCallback(
    async (data: CreateRelatedPartyTransactionDTO) => {
      const created = await relatedPartyTransactionService.createTransaction(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateTransaction = useCallback(
    async (id: string, patch: UpdateRelatedPartyTransactionDTO) => {
      const updated = await relatedPartyTransactionService.updateTransaction(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      await relatedPartyTransactionService.deleteTransaction(id);
      await refetch();
    },
    [refetch],
  );

  return { transactions, loading, error, refetch, createTransaction, updateTransaction, deleteTransaction };
}
