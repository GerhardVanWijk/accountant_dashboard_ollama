import { useState } from 'react';
import type { BankAccount } from '@/types';
import { bankAccountService, type CreateBankAccountDTO } from '../services';

export interface UseBankAccountMutationsOptions {
  onSuccess?: (account: BankAccount | null) => void;
  onError?: (error: Error) => void;
}

/** Hook for Cash & Bank Account create/update/deactivate mutations. */
export function useBankAccountMutations(options?: UseBankAccountMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fn();
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

  const createBankAccount = (data: CreateBankAccountDTO) =>
    run(async () => {
      const account = await bankAccountService.createBankAccount(data);
      options?.onSuccess?.(account);
      return account;
    });

  const updateBankAccount = (id: string, patch: Partial<BankAccount>) =>
    run(async () => {
      const account = await bankAccountService.updateBankAccount(id, patch);
      options?.onSuccess?.(account);
      return account;
    });

  const deleteBankAccount = (id: string) =>
    run(async () => {
      await bankAccountService.deleteBankAccount(id);
      options?.onSuccess?.(null);
    });

  return { isLoading, error, createBankAccount, updateBankAccount, deleteBankAccount };
}
