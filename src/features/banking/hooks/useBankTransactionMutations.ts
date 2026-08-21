import { useState } from 'react';
import { bankTransactionService } from '../services';
import type {
  AllocationInput,
  CreateDirectTransactionInput,
  CreateTransferInput,
} from '../services';
import type { ParsedStatementLine } from '../types';

export interface UseBankTransactionMutationsOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/** Hook for recording Direct Payments/Receipts, transfers, allocation, import, and deletion. */
export function useBankTransactionMutations(options?: UseBankTransactionMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fn();
      options?.onSuccess?.();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const createDirectTransaction = (input: CreateDirectTransactionInput) =>
    run(() => bankTransactionService.createDirectTransaction(input));

  const createTransfer = (input: CreateTransferInput) => run(() => bankTransactionService.createTransfer(input));

  const allocateTransaction = (id: string, allocations: AllocationInput[]) =>
    run(() => bankTransactionService.allocateTransaction(id, allocations));

  const deleteTransaction = (id: string) => run(() => bankTransactionService.deleteTransaction(id));

  const importStatementLines = (bankAccountId: string, lines: ParsedStatementLine[]) =>
    run(() => bankTransactionService.importStatementLines(bankAccountId, lines));

  return {
    isLoading,
    error,
    createDirectTransaction,
    createTransfer,
    allocateTransaction,
    deleteTransaction,
    importStatementLines,
  };
}
