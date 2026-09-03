import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SupplierReturn } from '@/types';
import { SupplierReturnDetailPage } from './SupplierReturnDetailPage';

vi.mock('../hooks/useSupplierReturns');
vi.mock('../hooks/useProducts');
vi.mock('../hooks/useWarehouses');
vi.mock('@/features/suppliers/hooks/useSuppliers');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/features/accounting/hooks/useAccounts');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';

const ret = (o: Partial<SupplierReturn> = {}): SupplierReturn => ({
  id: 'r1', createdAt: '', updatedAt: '2026-09-01T00:00:00Z', returnNumber: 'SRET-0001', supplierId: 'sup1',
  returnDate: '2026-09-01', reason: 'damaged',
  lineItems: [{ id: 'l1', productId: 'p1', warehouseId: 'wh1', quantity: 1, unitPrice: 100, lineTotal: 100 }],
  subtotal: 100, taxTotal: 15, total: 115, status: 'draft', ...o,
} as SupplierReturn);

beforeEach(() => {
  vi.mocked(useSupplierReturns).mockReturnValue({
    supplierReturns: [ret()], loading: false, error: null, refetch: vi.fn(),
    updateSupplierReturn: vi.fn(), postSupplierReturn: vi.fn(), cancelSupplierReturn: vi.fn(),
    previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Toner' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main' }], loading: false, error: null } as never);
  vi.mocked(useSuppliers).mockReturnValue({ suppliers: [{ id: 'sup1', name: 'Paper Co' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useTaxRates).mockReturnValue({ taxRates: [], loading: false, error: null } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/inventory/supplier-returns/r1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/supplier-returns/:supplierReturnId" element={<SupplierReturnDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierReturnDetailPage', () => {
  it('renders as a full page with the supplier and Post action; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'SRET-0001' })).toBeInTheDocument();
    expect(screen.getAllByText('Paper Co').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a posted return offers no lifecycle actions', () => {
    vi.mocked(useSupplierReturns).mockReturnValue({
      supplierReturns: [ret({ status: 'posted', journalEntryId: 'je1' })], loading: false, error: null, refetch: vi.fn(),
      updateSupplierReturn: vi.fn(), postSupplierReturn: vi.fn(), cancelSupplierReturn: vi.fn(),
      previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/inventory/supplier-returns/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
