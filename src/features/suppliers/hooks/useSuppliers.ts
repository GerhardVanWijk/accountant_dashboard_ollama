import { useCallback, useEffect, useState } from 'react';
import type { Supplier } from '@/types';
import { supplierService, type CreateSupplierDTO } from '../services/supplierService';

export interface UseSuppliersResult {
  suppliers: Supplier[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createSupplier: (data: CreateSupplierDTO) => Promise<Supplier>;
  updateSupplier: (id: string, patch: Partial<Supplier>) => Promise<Supplier>;
  deleteSupplier: (id: string) => Promise<void>;
  setStatus: (id: string, status: Supplier['status']) => Promise<Supplier>;
  setOnHold: (id: string, onHold: boolean) => Promise<Supplier>;
}

/**
 * Component -> useSuppliers -> supplierService -> MockSupplierRepository.
 * Owns the list fetch plus every mutation the Supplier module needs, each
 * mutation re-fetching afterwards so every consumer of this hook stays in
 * sync without a global store.
 */
export function useSuppliers(): UseSuppliersResult {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supplierService.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load suppliers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createSupplier = useCallback(
    async (data: CreateSupplierDTO) => {
      const created = await supplierService.createSupplier(data);
      await load();
      return created;
    },
    [load],
  );

  const updateSupplier = useCallback(
    async (id: string, patch: Partial<Supplier>) => {
      const updated = await supplierService.updateSupplier(id, patch);
      await load();
      return updated;
    },
    [load],
  );

  const deleteSupplier = useCallback(
    async (id: string) => {
      await supplierService.deleteSupplier(id);
      await load();
    },
    [load],
  );

  const setStatus = useCallback(
    async (id: string, status: Supplier['status']) => {
      const updated = await supplierService.setStatus(id, status);
      await load();
      return updated;
    },
    [load],
  );

  const setOnHold = useCallback(
    async (id: string, onHold: boolean) => {
      const updated = await supplierService.setOnHold(id, onHold);
      await load();
      return updated;
    },
    [load],
  );

  return { suppliers, loading, error, refetch: load, createSupplier, updateSupplier, deleteSupplier, setStatus, setOnHold };
}
