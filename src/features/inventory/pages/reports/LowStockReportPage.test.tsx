import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LowStockReportPage } from './LowStockReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));

function row(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 15, reorderQuantity: 40, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: 'Acme', onHand: 15, available: 15, committed: 0, reorderLevel: 20, reorderQuantity: 40, wac: 4, inventoryValue: 60, status: 'low',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/low-stock']}>
      <LowStockReportPage />
    </MemoryRouter>,
  );
}

describe('LowStockReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('includes only low-stock rows, with the suggested order quantity', () => {
    dataHook.mockReturnValue({ rows: [row(), row({ product: { ...row().product, id: 'p2', name: 'Healthy Item' }, status: 'in_stock' })], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.queryByText('Healthy Item')).not.toBeInTheDocument();
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it('shows the empty state when nothing is low on stock', () => {
    dataHook.mockReturnValue({ rows: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No low-stock items')).toBeInTheDocument();
  });
});
