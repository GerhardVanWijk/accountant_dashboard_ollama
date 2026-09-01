import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InventoryValuationReportPage } from './InventoryValuationReportPage';

const dataHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));

const reconciliationHook = vi.fn();
vi.mock('../../hooks/useInventoryReconciliation', () => ({ useInventoryReconciliation: () => reconciliationHook() }));

function row() {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 15, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: '—', onHand: 15, available: 15, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 60, status: 'in_stock',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/valuation']}>
      <InventoryValuationReportPage />
    </MemoryRouter>,
  );
}

describe('InventoryValuationReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reconciliationHook.mockReturnValue({ result: null, loading: false, error: null, refetch: vi.fn() });
  });
  afterEach(cleanup);

  it('renders line-level valuation and reuses the reconciliation card, not its own math', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    reconciliationHook.mockReturnValue({
      result: { subledgerValuation: 60, inventoryGlBalance: 60, subledgerVsGl: 0, inTransitValuation: 0, inTransitGlBalance: 0, inTransitVsGl: 0, totalInventoryVsGl: 0, isReconciled: true, findings: [] },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('Inventory reconciliation')).toBeInTheDocument();
    expect(screen.getAllByText('Reconciled').length).toBeGreaterThan(0);
  });

  it('shows the loading state', () => {
    dataHook.mockReturnValue({ rows: [], loading: true, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
