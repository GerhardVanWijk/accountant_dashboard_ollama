import { useCallback, useEffect, useState } from 'react';
import type { DividendDeclaration } from '@/types';
import { dividendDeclarationService, type CreateDividendDeclarationInput } from '../services';

export interface UseDividendDeclarationsResult {
  declarations: DividendDeclaration[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createDeclaration: (input: CreateDividendDeclarationInput) => Promise<DividendDeclaration>;
  declare: (id: string) => Promise<DividendDeclaration>;
  pay: (id: string, paidDate?: string) => Promise<DividendDeclaration>;
  remitToSars: (id: string, remittedDate?: string) => Promise<DividendDeclaration>;
  deleteDraft: (id: string) => Promise<void>;
}

/** Component -> Hook -> Service -> Repository chain for dividend declarations, mirroring useAssetDisposals.ts. */
export function useDividendDeclarations(): UseDividendDeclarationsResult {
  const [declarations, setDeclarations] = useState<DividendDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await dividendDeclarationService.getDeclarations();
      setDeclarations([...all].sort((a, b) => b.declarationDate.localeCompare(a.declarationDate)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load dividend declarations'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createDeclaration = useCallback(
    async (input: CreateDividendDeclarationInput) => {
      const created = await dividendDeclarationService.createDeclaration(input);
      await refetch();
      return created;
    },
    [refetch],
  );

  const declare = useCallback(
    async (id: string) => {
      const declared = await dividendDeclarationService.declare(id);
      await refetch();
      return declared;
    },
    [refetch],
  );

  const pay = useCallback(
    async (id: string, paidDate?: string) => {
      const paid = await dividendDeclarationService.pay(id, paidDate);
      await refetch();
      return paid;
    },
    [refetch],
  );

  const remitToSars = useCallback(
    async (id: string, remittedDate?: string) => {
      const remitted = await dividendDeclarationService.remitToSars(id, remittedDate);
      await refetch();
      return remitted;
    },
    [refetch],
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      await dividendDeclarationService.deleteDraftDeclaration(id);
      await refetch();
    },
    [refetch],
  );

  return { declarations, loading, error, refetch, createDeclaration, declare, pay, remitToSars, deleteDraft };
}
