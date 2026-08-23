import { useCallback, useEffect, useState } from 'react';
import type { RelatedParty } from '@/types/relatedParty';
import { relatedPartyService, type CreateRelatedPartyDTO, type UpdateRelatedPartyDTO } from '../services';

export interface UseRelatedPartiesResult {
  relatedParties: RelatedParty[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createRelatedParty: (data: CreateRelatedPartyDTO) => Promise<RelatedParty>;
  updateRelatedParty: (id: string, patch: UpdateRelatedPartyDTO) => Promise<RelatedParty>;
  deleteRelatedParty: (id: string) => Promise<void>;
}

/** Component -> Hook -> Service -> Repository chain for Related Party master data (docs/ARCHITECTURE.md). */
export function useRelatedParties(): UseRelatedPartiesResult {
  const [relatedParties, setRelatedParties] = useState<RelatedParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRelatedParties(await relatedPartyService.getRelatedParties());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load related parties'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createRelatedParty = useCallback(
    async (data: CreateRelatedPartyDTO) => {
      const created = await relatedPartyService.createRelatedParty(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateRelatedParty = useCallback(
    async (id: string, patch: UpdateRelatedPartyDTO) => {
      const updated = await relatedPartyService.updateRelatedParty(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteRelatedParty = useCallback(
    async (id: string) => {
      await relatedPartyService.deleteRelatedParty(id);
      await refetch();
    },
    [refetch],
  );

  return { relatedParties, loading, error, refetch, createRelatedParty, updateRelatedParty, deleteRelatedParty };
}
