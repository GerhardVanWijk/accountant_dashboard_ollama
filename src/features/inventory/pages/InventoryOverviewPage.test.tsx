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
const useReconMock = vi.fn();

vi.mock('../hooks/useProducts', () => ({ useProducts: () => useProductsMock() }));
vi.mock('../hooks/useStockAlerts', () => ({ useStockAlerts: () => ({ lowStock: [], outOfStock: [] }) }));
vi.mock('../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));
vi.mock('../hooks/useStockMovements', () => ({
  useStockMovements: () => ({
    movements: [],
    transferStock: vi.fn(),
    adjustStock: vi.fn(),
    recordOpeningStock: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('../hooks/useStockBalances', () => ({ useStockBalances: () => ({ balances: [], refetch: vi.fn() }) }));
vi.mock('../hooks/useProductCategories', () => ({ useProductCategories: () => ({ categories: [] }) }));
vi.mock('../hooks/useInventoryReconciliation', () => ({ useInventoryReconciliation: () => useReconMock() }));

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
    useReconMock.mockReturnValue({
      result: {
        subledgerValuation: 1200,
        inventoryGlBalance: 1200,
        subledgerVsGl: 0,
        inTransitValuation: 0,
        inTransitGlBalance: 0,
        inTransitVsGl: 0,
        totalInventoryVsGl: 0,
        isReconciled: true,
        findings: [],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });
  afterEach(cleanup);

  it('renders the header, the summary strip and the reconciliation card', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Items in stock')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Activity (30 days)')).toBeInTheDocument();
    expect(screen.getByText('Inventory reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
  });

  it('renders the primary actions and the inventory register', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stock actions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByText('Oak desk')).toBeInTheDocument();
    expect(screen.getByText('AAA-1')).toBeInTheDocument();
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
