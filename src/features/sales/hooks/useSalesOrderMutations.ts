import { useState } from 'react';
import type { SalesOrder } from '@/types';
import { salesOrderService, type CreateSalesOrderDTO } from '../services';

export interface UseSalesOrderMutationsOptions {
  onSuccess?: (order: SalesOrder) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle sales order mutations (create, update, lifecycle, conversion). */
export function useSalesOrderMutations(options?: UseSalesOrderMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>, notify: (result: T) => void): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fn();
      notify(result);
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

  const createSalesOrder = (data: CreateSalesOrderDTO) =>
    run(() => salesOrderService.createSalesOrder(data), (o) => options?.onSuccess?.(o));

  const updateSalesOrder = (id: string, patch: Partial<SalesOrder>) =>
    run(() => salesOrderService.updateSalesOrder(id, patch), (o) => options?.onSuccess?.(o));

  const deleteSalesOrder = (id: string) =>
    run(() => salesOrderService.deleteSalesOrder(id), () => options?.onSuccess?.(null as unknown as SalesOrder));

  const confirmOrder = (id: string) =>
    run(() => salesOrderService.confirmOrder(id), (o) => options?.onSuccess?.(o));

  const cancelOrder = (id: string) =>
    run(() => salesOrderService.cancelOrder(id), (o) => options?.onSuccess?.(o));

  const convertToInvoice = (id: string) =>
    run(() => salesOrderService.convertToInvoice(id), () => undefined);

  const duplicateSalesOrder = (id: string) =>
    run(() => salesOrderService.duplicateSalesOrder(id), (o) => options?.onSuccess?.(o));

  return {
    isLoading,
    error,
    createSalesOrder,
    updateSalesOrder,
    deleteSalesOrder,
    confirmOrder,
    cancelOrder,
    convertToInvoice,
    duplicateSalesOrder,
  };
}
