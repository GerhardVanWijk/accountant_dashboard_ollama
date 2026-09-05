import { useMemo } from 'react';
import type { Product, ReturnNote } from '@/types';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import type { BusinessDocumentViewModel } from '../types';
import { returnNoteToBusinessDocument } from '../adapters/returnNoteToBusinessDocument';

export interface UseReturnNoteBusinessDocumentResult {
  viewModel: BusinessDocumentViewModel | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads everything the Return Note printable document needs (Phase 5D) — a
 * dedicated, small hook mirroring `useDeliveryNoteBusinessDocument` exactly.
 */
export function useReturnNoteBusinessDocument(returnNote: ReturnNote | undefined): UseReturnNoteBusinessDocumentResult {
  const { company, loading: companyLoading = true, error: companyError = null } = useCompany() ?? {};
  const { customers = [], loading: customersLoading = true, error: customersError = null } = useCustomerList() ?? {};
  const { products = [], loading: productsLoading = true } = useProducts() ?? {};
  const { warehouses = [], loading: warehousesLoading = true } = useWarehouses() ?? {};
  const { deliveryNotes = [], isLoading: deliveryNotesLoading = true } = useDeliveryNotes() ?? {};

  const productMap = useMemo<Map<string, Product>>(() => new Map(products.map((p) => [p.id, p])), [products]);

  const loading = companyLoading || customersLoading || productsLoading || warehousesLoading || deliveryNotesLoading;
  const error = companyError?.message ?? customersError ?? null;

  const viewModel = useMemo<BusinessDocumentViewModel | null>(() => {
    if (loading || error || !returnNote || !company) return null;
    const customer = customers.find((c) => c.id === returnNote.customerId);
    if (!customer) return null;
    const warehouse = warehouses.find((w) => w.id === returnNote.warehouseId);
    const deliveryNoteNumber = deliveryNotes.find((d) => d.id === returnNote.deliveryNoteId)?.deliveryNoteNumber;
    return returnNoteToBusinessDocument(returnNote, { company, customer, warehouse, products: productMap, deliveryNoteNumber });
  }, [loading, error, returnNote, company, customers, warehouses, deliveryNotes, productMap]);

  return { viewModel, loading, error };
}
