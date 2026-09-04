import { useState } from 'react';
import type { Invoice, SalesOrder } from '@/types';
import { salesOrderService, type CreateSalesOrderDTO } from '../services';
import type { SalesOrderInvoiceSelection } from '../utils/salesOrderFulfilment';

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

  /** Phase 5B FINAL: abandon the un-invoiced remainder of a partly-invoiced order. */
  const closeRemaining = (id: string) =>
    run(() => salesOrderService.closeRemaining(id), (o) => options?.onSuccess?.(o));

  const convertToInvoice = (id: string) =>
    run(() => salesOrderService.convertToInvoice(id), () => undefined);

  /** Phase 5B.2: create a draft invoice for an explicit per-line quantity selection. */
  const createInvoiceFromSalesOrder = (id: string, selections: readonly SalesOrderInvoiceSelection[]): Promise<Invoice> =>
    run(() => salesOrderService.createInvoiceFromSalesOrder(id, selections), () => undefined);

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
    closeRemaining,
    convertToInvoice,
    createInvoiceFromSalesOrder,
    duplicateSalesOrder,
  };
}
