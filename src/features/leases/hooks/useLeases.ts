import { useCallback, useEffect, useState } from 'react';
import type { LeaseContract } from '@/types/lease';
import { leaseService, leaseDisposalService, type CreateLeaseDTO, type UpdateLeaseDTO } from '../services';

export interface UseLeasesResult {
  leases: LeaseContract[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createLease: (data: CreateLeaseDTO) => Promise<LeaseContract>;
  updateLease: (id: string, patch: UpdateLeaseDTO) => Promise<LeaseContract>;
  deleteLease: (id: string) => Promise<void>;
  postCommencement: (id: string) => Promise<LeaseContract>;
  terminateLease: (id: string, terminationDate: string) => Promise<LeaseContract>;
}

/** Component -> Hook -> Service -> Repository chain for the Lease Register (docs/ARCHITECTURE.md). */
export function useLeases(): UseLeasesResult {
  const [leases, setLeases] = useState<LeaseContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeases(await leaseService.getLeases());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load leases'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createLease = useCallback(
    async (data: CreateLeaseDTO) => {
      const created = await leaseService.createLease(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateLease = useCallback(
    async (id: string, patch: UpdateLeaseDTO) => {
      const updated = await leaseService.updateLease(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteLease = useCallback(
    async (id: string) => {
      await leaseService.deleteLease(id);
      await refetch();
    },
    [refetch],
  );

  const postCommencement = useCallback(
    async (id: string) => {
      const updated = await leaseService.postCommencement(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const terminateLease = useCallback(
    async (id: string, terminationDate: string) => {
      const updated = await leaseDisposalService.terminateLease(id, terminationDate);
      await refetch();
      return updated;
    },
    [refetch],
  );

  return { leases, loading, error, refetch, createLease, updateLease, deleteLease, postCommencement, terminateLease };
}
