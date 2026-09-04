import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Product, StockMovement } from '@/types';
import { InventoryItemDetailPage } from './InventoryItemDetailPage';

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: () => true }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/features/suppliers/hooks/useSuppliers', () => ({ useSuppliers: () => ({ suppliers: [{ id: 'sup_1', name: 'TonerZone' }] }) }));
vi.mock('@/features/sales/hooks/useInvoices', () => ({ useInvoices: () => ({ invoices: [{ id: 'inv_1', customerId: 'cust_1' }] }) }));
vi.mock('@/features/sales/hooks/useCustomerMap', () => ({ useCustomerList: () => ({ customers: [{ id: 'cust_1', name: 'Riverside Traders' }] }) }));
vi.mock('@/features/purchases/hooks/useBills', () => ({ useBills: () => ({ bills: [{ id: 'bill_1', supplierId: 'sup_1' }] }) }));
vi.mock('../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'wh_1', name: 'Main DC' }] }) }));
vi.mock('../hooks/useStockBalances', () => ({ useStockBalances: () => ({ balances: [] }) }));
vi.mock('../hooks/useStockCommitments', () => ({ useStockCommitments: () => ({ commitments: new Map(), loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('../hooks/useProductCategories', () => ({ useProductCategories: () => ({ categories: [] }) }));

const movementsMock = vi.fn<() => { movements: StockMovement[] }>();
vi.mock('../hooks/useStockMovements', () => ({ useStockMovements: () => movementsMock() }));

const useProductsMock = vi.fn();
vi.mock('../hooks/useProducts', () => ({ useProducts: () => useProductsMock() }));

const useAllTaxRatesMock = vi.fn();
vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useAllTaxRates: () => useAllTaxRatesMock() }));

const product: Product = {
  id: 'p_1', sku: 'CON-001', name: 'Black Toner Cartridge', type: 'good', unitPrice: 1200, costPrice: 784,
  trackInventory: true, quantityOnHand: 12, status: 'active', taxRateId: 'std', createdAt: '', updatedAt: '',
};

const saleMovement: StockMovement = {
  id: 'm_1', productId: 'p_1', warehouseId: 'wh_1', type: 'sale', quantityDelta: -5,
  reference: 'INV-1061', sourceDocumentType: 'invoice', sourceDocumentId: 'inv_1',
  movementDate: '2026-09-12', createdAt: '2026-09-12',
} as StockMovement;

beforeEach(() => {
  vi.clearAllMocks();
  useProductsMock.mockReturnValue({ products: [product], loading: false, error: null, refetch: vi.fn(), updateProduct: vi.fn() });
  useAllTaxRatesMock.mockReturnValue({ taxRates: [{ id: 'std', code: 'STD', name: 'Standard Rate 15%', rate: 15 }], loading: false, error: null });
  movementsMock.mockReturnValue({ movements: [saleMovement] });
});

afterEach(cleanup);

function renderAt(path = '/inventory/products/p_1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/products/:productId" element={<InventoryItemDetailPage />} />
        <Route path="/sales/invoices" element={<div>invoice list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InventoryItemDetailPage', () => {
  it('renders the item record full-page with all eight tabs', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: 'CON-001' })).toBeInTheDocument();
    for (const label of ['Overview', 'Stock', 'Purchasing', 'Sales', 'Transactions', 'Accounting', 'Documents', 'Activity']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('resolves the real tax rate — never "Unknown tax rate" for a valid id', () => {
    renderAt();
    expect(screen.getAllByText('Standard Rate 15% — 15%').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Unknown tax rate')).not.toBeInTheDocument();
    expect(screen.queryByText('std')).not.toBeInTheDocument();
  });

  it('shows the stock movement ledger with a human document number, linked, not a raw UUID', () => {
    renderAt();
    fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }));
    const ref = screen.getByRole('link', { name: 'INV-1061' });
    expect(ref).toHaveAttribute('href', expect.stringContaining('/sales/invoices'));
    expect(screen.getByText('Riverside Traders')).toBeInTheDocument(); // resolved party
    expect(screen.queryByText('inv_1')).not.toBeInTheDocument(); // raw id not the primary reference
  });

  it('deep-link to an unknown id shows the not-found state', () => {
    renderAt('/inventory/products/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });

  it('does not use the right-hand RecordDetailSheet', () => {
    const { container } = renderAt();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });
});
