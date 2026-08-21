import { useState } from 'react';
import type { PurchaseOrder } from '@/types';
import { purchaseOrderService, type CreatePurchaseOrderDTO } from '../services';

export interface UsePurchaseOrderMutationsOptions {
  onSuccess?: (po: PurchaseOrder) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to handle purchase order mutations (create, update, delete, etc.).
 */
export function usePurchaseOrderMutations(options?: UsePurchaseOrderMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPurchaseOrder = async (data: CreatePurchaseOrderDTO) => {
    try {
      setIsLoading(true);
      setError(null);
      const po = await purchaseOrderService.createPurchaseOrder(data);
      options?.onSuccess?.(po);
      return po;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePurchaseOrder = async (id: string, patch: Partial<PurchaseOrder>) => {
    try {
      setIsLoading(true);
      setError(null);
      const po = await purchaseOrderService.updatePurchaseOrder(id, patch);
      options?.onSuccess?.(po);
      return po;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deletePurchaseOrder = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await purchaseOrderService.deletePurchaseOrder(id);
      options?.onSuccess?.(null as unknown as PurchaseOrder);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const sendPurchaseOrder = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const po = await purchaseOrderService.sendPurchaseOrder(id);
      options?.onSuccess?.(po);
      return po;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const recordReceipt = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const po = await purchaseOrderService.recordReceipt(id);
      options?.onSuccess?.(po);
      return po;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const convertToBill = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await purchaseOrderService.convertToBill(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    sendPurchaseOrder,
    recordReceipt,
    convertToBill,
  };
}
