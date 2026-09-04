import { useMemo } from 'react';
import type { DeliveryNote, Product } from '@/types';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import type { BusinessDocumentViewModel } from '../types';
import { deliveryNoteToBusinessDocument } from '../adapters/deliveryNoteToBusinessDocument';

export interface UseDeliveryNoteBusinessDocumentResult {
  viewModel: BusinessDocumentViewModel | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads everything the Delivery Note printable document needs (Phase 5C,
 * Part 21) — a dedicated, small hook rather than folding a sixth kind into
 * `useBusinessDocument`'s existing 5-way union, keeping this addition
 * low-risk and independently reviewable.
 */
export function useDeliveryNoteBusinessDocument(deliveryNote: DeliveryNote | undefined): UseDeliveryNoteBusinessDocumentResult {
  const { company, loading: companyLoading = true, error: companyError = null } = useCompany() ?? {};
  const { customers = [], loading: customersLoading = true, error: customersError = null } = useCustomerList() ?? {};
  const { products = [], loading: productsLoading = true } = useProducts() ?? {};
  const { warehouses = [], loading: warehousesLoading = true } = useWarehouses() ?? {};
  const { salesOrders = [], isLoading: salesOrdersLoading = true } = useSalesOrders() ?? {};

  const productMap = useMemo<Map<string, Product>>(() => new Map(products.map((p) => [p.id, p])), [products]);

  const loading = companyLoading || customersLoading || productsLoading || warehousesLoading || salesOrdersLoading;
  const error = companyError?.message ?? customersError ?? null;

  const viewModel = useMemo<BusinessDocumentViewModel | null>(() => {
    if (loading || error || !deliveryNote || !company) return null;
    const customer = customers.find((c) => c.id === deliveryNote.customerId);
    if (!customer) return null;
    const warehouse = warehouses.find((w) => w.id === deliveryNote.warehouseId);
    const salesOrderNumber = salesOrders.find((o) => o.id === deliveryNote.salesOrderId)?.orderNumber;
    return deliveryNoteToBusinessDocument(deliveryNote, { company, customer, warehouse, products: productMap, salesOrderNumber });
  }, [loading, error, deliveryNote, company, customers, warehouses, salesOrders, productMap]);

  return { viewModel, loading, error };
}
