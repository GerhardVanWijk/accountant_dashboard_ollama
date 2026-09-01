import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OutOfStockReportPage } from './OutOfStockReportPage';

const stockHook = vi.fn();
const movementsHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => stockHook() }));
vi.mock('../../hooks/useStockMovements', () => ({ useStockMovements: () => movementsHook() }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));

function row(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 0, status: 'inactive', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: '—', onHand: 0, available: 0, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 0, status: 'out',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/out-of-stock']}>
      <OutOfStockReportPage />
    </MemoryRouter>,
  );
}

describe('OutOfStockReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    movementsHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
  });
  afterEach(cleanup);

  it('shows the product and its active/inactive status explicitly', () => {
    stockHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows "Never" when no movement exists for the item', () => {
    stockHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows the empty state when nothing is out of stock', () => {
    stockHook.mockReturnValue({ rows: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Nothing out of stock')).toBeInTheDocument();
  });
});
