import { useState } from 'react';
import type { FinancialPlanLine } from '@/types';
import { financialPlanService, type UpsertPlanLineDTO } from '../services';

export interface UseFinancialPlanMutationsOptions {
  onSuccess?: (line: FinancialPlanLine) => void;
  onError?: (error: Error) => void;
}

export function useFinancialPlanMutations(options?: UseFinancialPlanMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const upsertPlanLine = async (dto: UpsertPlanLineDTO) => {
    setIsLoading(true);
    setError(null);
    try {
      const line = await financialPlanService.upsertPlanLine(dto);
      options?.onSuccess?.(line);
      return line;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, error, upsertPlanLine };
}
