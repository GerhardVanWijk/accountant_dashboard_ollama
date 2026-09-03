import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Bill } from '@/types';
import { BillDetailPage } from './BillDetailPage';

vi.mock('@/features/suppliers/hooks/useSuppliers');
vi.mock('@/features/purchases/hooks');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/inventory/hooks/useWarehouses');
vi.mock('@/features/inventory/hooks/useStockMovements');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useBills, useBillMutations, usePayments, usePaymentMutations, usePurchaseOrders } from '@/features/purchases/hooks';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

const bill = (o: Partial<Bill> = {}): Bill => ({
  id: 'b1', createdAt: '', updatedAt: '', billNumber: 'BILL-2005', supplierId: 's1', issueDate: '2026-09-01', dueDate: '2026-09-30',
  lineItems: [{ id: 'l1', productId: 'p1', description: 'Toner', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
  subtotal: 500, taxTotal: 75, total: 575, amountPaid: 0, currency: 'ZAR', status: 'awaiting_payment', journalEntryId: 'je1', ...o,
});

beforeEach(() => {
  vi.mocked(useSuppliers).mockReturnValue({ suppliers: [{ id: 's1', name: 'Paper Co' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useBills).mockReturnValue({ bills: [bill()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useBillMutations).mockReturnValue({ createBill: vi.fn(), postBill: vi.fn(), isLoading: false, error: null } as never);
  vi.mocked(usePayments).mockReturnValue({ payments: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePaymentMutations).mockReturnValue({ createPayment: vi.fn(), isLoading: false, error: null } as never);
  vi.mocked(usePurchaseOrders).mockReturnValue({ purchaseOrders: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Black Toner Cartridge' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [], loading: false, error: null } as never);
  vi.mocked(useStockMovements).mockReturnValue({ movements: [], stockLevels: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useAllTaxRates).mockReturnValue({ taxRates: [{ id: 'tr1', name: 'Standard rate', rate: 15 }], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/purchases/bills/b1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/purchases/bills/:billId" element={<BillDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BillDetailPage', () => {
  it('renders as a full page with the product SKU on the line; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'BILL-2005' })).toBeInTheDocument();
    expect(screen.getByText('CON-001')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a posted bill with a balance offers "Record payment"', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
  });

  it('a draft bill offers "Post bill"', () => {
    vi.mocked(useBills).mockReturnValue({ bills: [bill({ status: 'draft', journalEntryId: undefined })], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Post bill' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/purchases/bills/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
