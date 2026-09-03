import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGlobalSearchRecords } from './global-search-records';

vi.mock('@/features/inventory/services/productService', () => ({
  productService: { getProducts: vi.fn().mockResolvedValue([{ id: 'p_1', sku: 'CON-001', name: 'Black Toner' }]) },
}));
vi.mock('@/features/customers/services/customerService', () => ({
  customerService: { getCustomers: vi.fn().mockResolvedValue([{ id: 'c_1', customerNumber: 'CUS-1', name: 'Acme' }]) },
}));
vi.mock('@/features/suppliers/services/supplierService', () => ({
  supplierService: { getSuppliers: vi.fn().mockResolvedValue([{ id: 's_1', supplierNumber: 'SUP-1', name: 'Mills' }]) },
}));

beforeEach(() => vi.clearAllMocks());

describe('useGlobalSearchRecords', () => {
  it('routes a product result to its canonical full-page record, not ?record= modal state', async () => {
    const { result } = renderHook(() => useGlobalSearchRecords(true));
    await waitFor(() => expect(result.current.records.length).toBe(3));
    const product = result.current.records.find((r) => r.type === 'product');
    expect(product?.href).toBe('/inventory/products/p_1');
    expect(product?.href).not.toContain('?record=');
  });

  it('leaves customer / supplier results on their (still-sheet) list routes', async () => {
    const { result } = renderHook(() => useGlobalSearchRecords(true));
    await waitFor(() => expect(result.current.records.length).toBe(3));
    expect(result.current.records.find((r) => r.type === 'customer')?.href).toBe('/sales/customers?record=c_1');
    expect(result.current.records.find((r) => r.type === 'supplier')?.href).toBe('/purchases/vendors?record=s_1');
  });
});
