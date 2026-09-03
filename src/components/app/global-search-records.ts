import { useEffect, useRef, useState } from 'react';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';

export type GlobalSearchRecordType = 'product' | 'customer' | 'supplier';

export interface GlobalSearchRecord {
  type: GlobalSearchRecordType;
  id: string;
  /** Primary line — the record's code/number. */
  code: string;
  /** Secondary line — the record's name. */
  name: string;
  /** Where selecting this record navigates. */
  href: string;
  /** Concatenated text cmdk matches the query against. */
  keywords: string;
}

interface State {
  records: GlobalSearchRecord[];
  loading: boolean;
  error: boolean;
}

const EMPTY: State = { records: [], loading: false, error: false };

/**
 * Business-record index for the global command palette. Deliberately lazy:
 * nothing is fetched until the palette is first opened (`enabled`), then the
 * three master lists (products, customers, suppliers) load once and are
 * filtered client-side by cmdk — so typing never triggers a request, and the
 * topbar carries no cost until the user actually searches. Read-only: only
 * the existing list services, no mutation, no new endpoint.
 */
export function useGlobalSearchRecords(enabled: boolean): State {
  const [state, setState] = useState<State>(EMPTY);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    setState({ records: [], loading: true, error: false });

    Promise.all([
      productService.getProducts().catch(() => []),
      customerService.getCustomers().catch(() => []),
      supplierService.getSuppliers().catch(() => []),
    ])
      .then(([products, customers, suppliers]) => {
        if (cancelled) return;
        const records: GlobalSearchRecord[] = [
          ...products.map((p) => ({
            type: 'product' as const,
            id: p.id,
            code: p.sku,
            name: p.name,
            href: `/inventory/products/${p.id}`,
            keywords: `${p.sku} ${p.name} product item`,
          })),
          ...customers.map((c) => ({
            type: 'customer' as const,
            id: c.id,
            code: c.customerNumber,
            name: c.name,
            href: `/sales/customers?record=${c.id}`,
            keywords: `${c.customerNumber} ${c.name} customer`,
          })),
          ...suppliers.map((s) => ({
            type: 'supplier' as const,
            id: s.id,
            code: s.supplierNumber,
            name: s.name,
            href: `/purchases/vendors?record=${s.id}`,
            keywords: `${s.supplierNumber} ${s.name} supplier vendor`,
          })),
        ];
        setState({ records, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ records: [], loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
