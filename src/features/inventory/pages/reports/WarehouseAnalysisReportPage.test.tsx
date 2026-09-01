import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WarehouseAnalysisReportPage } from './WarehouseAnalysisReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }, { id: 'w2', name: 'Overflow' }] }) }));

function row() {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/warehouse-analysis']}>
      <WarehouseAnalysisReportPage />
    </MemoryRouter>,
  );
}

describe('WarehouseAnalysisReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('lists every warehouse, including one with zero items', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Overflow')).toBeInTheDocument();
  });
});
