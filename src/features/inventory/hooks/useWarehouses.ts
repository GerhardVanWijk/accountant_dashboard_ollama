import { useCallback, useEffect, useState } from 'react';
import type { Warehouse } from '@/types';
import { warehouseService, type CreateWarehouseDTO, type UpdateWarehouseDTO } from '../services/warehouseService';

export interface UseWarehousesResult {
  warehouses: Warehouse[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createWarehouse: (data: CreateWarehouseDTO) => Promise<Warehouse>;
  updateWarehouse: (id: string, patch: UpdateWarehouseDTO) => Promise<Warehouse>;
  deleteWarehouse: (id: string) => Promise<void>;
}

/** Component -> Hook -> Service -> Repository chain for warehouses (docs/ARCHITECTURE.md). */
export function useWarehouses(): UseWarehousesResult {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWarehouses(await warehouseService.getWarehouses());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load warehouses'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createWarehouse = useCallback(
    async (data: CreateWarehouseDTO) => {
      const created = await warehouseService.createWarehouse(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateWarehouse = useCallback(
    async (id: string, patch: UpdateWarehouseDTO) => {
      const updated = await warehouseService.updateWarehouse(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteWarehouse = useCallback(
    async (id: string) => {
      await warehouseService.deleteWarehouse(id);
      await refetch();
    },
    [refetch],
  );

  return { warehouses, loading, error, refetch, createWarehouse, updateWarehouse, deleteWarehouse };
}
