import { useState } from 'react';
import type { DeliveryNote, Invoice } from '@/types';
import { deliveryNoteService, type CreateDeliveryNoteDTO, type UpdateDeliveryNoteDTO } from '../services';
import { salesOrderService } from '../services';
import type { SalesOrderInvoiceSelection } from '../utils/salesOrderFulfilment';

export interface UseDeliveryNoteMutationsOptions {
  onSuccess?: (deliveryNote: DeliveryNote) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle delivery note mutations — create/update/cancel/post (Phase 5C). */
export function useDeliveryNoteMutations(options?: UseDeliveryNoteMutationsOptions) {
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

  const createDraft = (dto: CreateDeliveryNoteDTO) =>
    run(() => deliveryNoteService.createDraft(dto), (dn) => options?.onSuccess?.(dn));

  const updateDraft = (id: string, patch: UpdateDeliveryNoteDTO) =>
    run(() => deliveryNoteService.updateDraft(id, patch), (dn) => options?.onSuccess?.(dn));

  const cancelDraft = (id: string) =>
    run(() => deliveryNoteService.cancelDraft(id), (dn) => options?.onSuccess?.(dn));

  const deleteDraft = (id: string) =>
    run(() => deliveryNoteService.deleteDraft(id), () => options?.onSuccess?.(null as unknown as DeliveryNote));

  const postDeliveryNote = (id: string) =>
    run(() => deliveryNoteService.postDeliveryNote(id), (dn) => options?.onSuccess?.(dn));

  /** Part 14: "Create invoice" from a posted delivery note — one selection per DN line, defaulting to each line's own remaining-to-invoice quantity. */
  const createInvoiceFromDeliveryNote = async (
    deliveryNoteId: string,
    requestedQuantities?: ReadonlyMap<string, number>,
  ): Promise<Invoice> => {
    const dn = await deliveryNoteService.getDeliveryNote(deliveryNoteId);
    if (!dn) throw new Error(`Delivery note "${deliveryNoteId}" not found`);
    const selections: SalesOrderInvoiceSelection[] = await deliveryNoteService.buildInvoiceSelectionsForDeliveryNote(
      deliveryNoteId,
      requestedQuantities,
    );
    return salesOrderService.createInvoiceFromSalesOrder(dn.salesOrderId, selections);
  };

  return {
    isLoading,
    error,
    createDraft,
    updateDraft,
    cancelDraft,
    deleteDraft,
    postDeliveryNote,
    createInvoiceFromDeliveryNote,
  };
}
