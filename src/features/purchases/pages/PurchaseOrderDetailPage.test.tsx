import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { PurchaseOrder } from '@/types';
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage';

vi.mock('@/features/suppliers/hooks/useSuppliers');
vi.mock('@/features/purchases/hooks');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/inventory/hooks/useWarehouses');
vi.mock('@/features/inventory/hooks/useStockMovements');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations, useBills, useBillMutations } from '@/features/purchases/hooks';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

const po = (o: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'po1', createdAt: '', updatedAt: '', poNumber: 'PO-2026-0001', supplierId: 's1', orderDate: '2026-09-01',
  lineItems: [{ id: 'l1', description: 'A4 paper', quantity: 10, unitPrice: 50, taxAmount: 75, lineTotal: 500 }],
  subtotal: 500, taxTotal: 75, total: 575, currency: 'ZAR', status: 'sent', ...o,
});

beforeEach(() => {
  vi.mocked(useSuppliers).mockReturnValue({ suppliers: [{ id: 's1', name: 'Paper Co' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePurchaseOrders).mockReturnValue({ purchaseOrders: [po()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePurchaseOrderMutations).mockReturnValue({
    createPurchaseOrder: vi.fn(), updatePurchaseOrder: vi.fn(), deletePurchaseOrder: vi.fn(),
    sendPurchaseOrder: vi.fn(), recordReceipt: vi.fn(), convertToBill: vi.fn(), isLoading: false, error: null,
  } as never);
  vi.mocked(useBills).mockReturnValue({ bills: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useBillMutations).mockReturnValue({ createBill: vi.fn(), postBill: vi.fn(), isLoading: false, error: null } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [], loading: false, error: null } as never);
  vi.mocked(useStockMovements).mockReturnValue({ movements: [], stockLevels: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useAllTaxRates).mockReturnValue({ taxRates: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/purchases/orders/po1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/purchases/orders/:purchaseOrderId" element={<PurchaseOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PurchaseOrderDetailPage', () => {
  it('renders as a full page with a Goods received section; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'PO-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('Goods received')).toBeInTheDocument();
    expect(screen.getByText('A4 paper')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a sent PO offers "Record receipt" and "Convert to bill"', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Record receipt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert to bill' })).toBeInTheDocument();
  });

  it('a PO already converted to a bill offers no "Convert to bill"', () => {
    vi.mocked(usePurchaseOrders).mockReturnValue({ purchaseOrders: [po({ billId: 'b1' })], isLoading: false, error: null, refetch: vi.fn() } as never);
    vi.mocked(useBills).mockReturnValue({ bills: [{ id: 'b1', billNumber: 'BILL-9', supplierId: 's1' }], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Convert to bill' })).not.toBeInTheDocument();
    expect(screen.getAllByText('BILL-9').length).toBeGreaterThanOrEqual(1);
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/purchases/orders/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
