import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CategoryAnalysisReportPage } from './CategoryAnalysisReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useProductCategories', () => ({ useProductCategories: () => ({ categories: [{ id: 'c1', name: 'Stationery' }] }) }));

function row() {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: 'Stationery', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/category-analysis']}>
      <CategoryAnalysisReportPage />
    </MemoryRouter>,
  );
}

describe('CategoryAnalysisReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows a category rollup and the limitation footnote, never a sales/margin column', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Stationery')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /gross margin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/carry no product link/i)).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    dataHook.mockReturnValue({ rows: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No tracked stock')).toBeInTheDocument();
  });
});
