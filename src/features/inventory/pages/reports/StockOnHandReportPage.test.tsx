import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StockOnHandReportPage } from './StockOnHandReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useProductCategories', () => ({ useProductCategories: () => ({ categories: [] }) }));
vi.mock('@/features/suppliers/hooks/useSuppliers', () => ({ useSuppliers: () => ({ suppliers: [] }) }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));

function row(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 15, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—',
    supplierName: '—',
    onHand: 15,
    available: 15,
    committed: 0,
    reorderLevel: 20,
    reorderQuantity: undefined,
    wac: 4,
    inventoryValue: 60,
    status: 'low',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/stock-on-hand']}>
      <StockOnHandReportPage />
    </MemoryRouter>,
  );
}

describe('StockOnHandReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('renders a row per product/warehouse with status', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    dataHook.mockReturnValue({ rows: [], loading: true, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    dataHook.mockReturnValue({ rows: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No tracked stock')).toBeInTheDocument();
  });
});
