import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupplierAnalysisReportPage } from './SupplierAnalysisReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('@/features/suppliers/hooks/useSuppliers', () => ({
  useSuppliers: () => ({ suppliers: [{ id: 'sup_1', name: 'Acme Supplies' }], loading: false, error: null, refetch: vi.fn() }),
}));

function row() {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', preferredSupplierId: 'sup_1', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: 'Acme Supplies', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/supplier-analysis']}>
      <SupplierAnalysisReportPage />
    </MemoryRouter>,
  );
}

describe('SupplierAnalysisReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows a supplier position rollup and the limitation footnote, never a profitability field', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Acme Supplies')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /profitability/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/inventory POSITION/i).length).toBeGreaterThan(0);
  });

  it('shows the empty state', () => {
    dataHook.mockReturnValue({ rows: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No supplier relationships')).toBeInTheDocument();
  });
});
