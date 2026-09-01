import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Product } from '@/types';
import { InventoryOverviewPage } from './InventoryOverviewPage';

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/features/suppliers/hooks/useSuppliers', () => ({ useSuppliers: () => ({ suppliers: [] }) }));
vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useAllTaxRates: () => ({ taxRates: [] }) }));

const productA: Product = {
  id: 'a',
  sku: 'AAA-1',
  name: 'Oak desk',
  type: 'good',
  unitPrice: 200,
  costPrice: 120,
  trackInventory: true,
  quantityOnHand: 10,
  status: 'active',
  createdAt: '',
  updatedAt: '',
};

const useProductsMock = vi.fn();

vi.mock('../hooks/useProducts', () => ({ useProducts: () => useProductsMock() }));
vi.mock('../hooks/useStockAlerts', () => ({ useStockAlerts: () => ({ lowStock: [], outOfStock: [] }) }));
vi.mock('../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));
vi.mock('../hooks/useStockMovements', () => ({ useStockMovements: () => ({ movements: [] }) }));
vi.mock('../hooks/useStockBalances', () => ({ useStockBalances: () => ({ balances: [] }) }));
vi.mock('../hooks/useProductCategories', () => ({ useProductCategories: () => ({ categories: [] }) }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory']}>
      <InventoryOverviewPage />
    </MemoryRouter>,
  );
}

describe('InventoryOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductsMock.mockReturnValue({
      products: [productA],
      loading: false,
      error: null,
      refetch: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
    });
  });
  afterEach(cleanup);

  it('renders the header and the summary strip', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Items in stock')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Activity (30 days)')).toBeInTheDocument();
  });

  it('keeps reconciliation entirely off the operational overview (card, status line and engine)', () => {
    renderPage();
    expect(screen.queryByText('Inventory reconciliation')).not.toBeInTheDocument();
    expect(screen.queryByText(/inventory control:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view reconciliation/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Inventory Asset GL — 1200/)).not.toBeInTheDocument();
  });

  it('renders the primary actions and the inventory register', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stock actions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^reports$/i })).toHaveAttribute('href', '/inventory/reports');
    expect(screen.getByText('Oak desk')).toBeInTheDocument();
    expect(screen.getByText('AAA-1')).toBeInTheDocument();
  });

  it('the Stock actions menu links to each real workflow register, never a direct-mutation dialog', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /stock actions/i }));
    expect(screen.getByRole('menuitem', { name: /stock adjustment/i })).toHaveAttribute('href', '/inventory/adjustments');
    expect(screen.getByRole('menuitem', { name: /stock transfer/i })).toHaveAttribute('href', '/inventory/transfers');
    expect(screen.getByRole('menuitem', { name: /stock take/i })).toHaveAttribute('href', '/inventory/stock-takes');
    expect(screen.getByRole('menuitem', { name: /supplier return/i })).toHaveAttribute('href', '/inventory/supplier-returns');
    expect(screen.getByRole('menuitem', { name: /opening stock/i })).toHaveAttribute('href', '/inventory/opening-stock');
    expect(screen.getByRole('menuitem', { name: /view all operations/i })).toHaveAttribute('href', '/inventory/operations');
  });

  it('shows the loading state while products load', () => {
    useProductsMock.mockReturnValue({ products: [], loading: true, error: null, refetch: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn() });
    renderPage();
    expect(screen.getByText(/loading inventory/i)).toBeInTheDocument();
  });

  it('opens the tabbed item detail sheet on row click', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open Oak desk' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Accounting' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Transactions' })).toBeInTheDocument();
  });
});
