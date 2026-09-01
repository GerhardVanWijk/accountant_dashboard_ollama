import { useCallback, useEffect, useState } from 'react';
import type { ID, SupplierReturn } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import {
  supplierReturnService,
  type CreateSupplierReturnDTO,
  type UpdateSupplierReturnDTO,
} from '../services/supplierReturnService';

export interface UseSupplierReturnsResult {
  supplierReturns: SupplierReturn[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createSupplierReturn: (data: CreateSupplierReturnDTO) => Promise<SupplierReturn>;
  updateSupplierReturn: (id: ID, patch: UpdateSupplierReturnDTO) => Promise<SupplierReturn>;
  deleteSupplierReturn: (id: ID) => Promise<void>;
  postSupplierReturn: (id: ID) => Promise<SupplierReturn>;
  cancelSupplierReturn: (id: ID) => Promise<SupplierReturn>;
  previewPostEffect: (id: ID) => Promise<AccountingEffectPreview>;
}

/**
 * Component → Hook → Service chain (docs/ARCHITECTURE.md) for the
 * draft→posted supplier-return lifecycle (supplierReturnService.ts,
 * migration 0029).
 */
export function useSupplierReturns(): UseSupplierReturnsResult {
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSupplierReturns(await supplierReturnService.getSupplierReturns());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load supplier returns'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createSupplierReturn = useCallback(
    async (data: CreateSupplierReturnDTO) => {
      const created = await supplierReturnService.createSupplierReturn(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateSupplierReturn = useCallback(
    async (id: ID, patch: UpdateSupplierReturnDTO) => {
      const updated = await supplierReturnService.updateSupplierReturn(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteSupplierReturn = useCallback(
    async (id: ID) => {
      await supplierReturnService.deleteSupplierReturn(id);
      await refetch();
    },
    [refetch],
  );

  const postSupplierReturn = useCallback(
    async (id: ID) => {
      const updated = await supplierReturnService.postSupplierReturn(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const cancelSupplierReturn = useCallback(
    async (id: ID) => {
      const updated = await supplierReturnService.cancelSupplierReturn(id);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const previewPostEffect = useCallback(async (id: ID) => supplierReturnService.previewPostEffect(id), []);

  return {
    supplierReturns,
    loading,
    error,
    refetch,
    createSupplierReturn,
    updateSupplierReturn,
    deleteSupplierReturn,
    postSupplierReturn,
    cancelSupplierReturn,
    previewPostEffect,
  };
}
