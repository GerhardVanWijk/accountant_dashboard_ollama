import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SlowMovingReportPage } from './SlowMovingReportPage';

const dataHook = vi.fn();
const movementsHook = vi.fn();
vi.mock('../../hooks/useStockOnHandData', () => ({ useStockOnHandData: () => dataHook() }));
vi.mock('../../hooks/useStockMovements', () => ({ useStockMovements: () => movementsHook() }));

function row() {
  return {
    product: { id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' },
    warehouse: { id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
    categoryName: '—', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/slow-moving']}>
      <SlowMovingReportPage />
    </MemoryRouter>,
  );
}

describe('SlowMovingReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('buckets a never-moved item as 180+ and shows "Never"/"Never sold"', () => {
    dataHook.mockReturnValue({ rows: [row()], loading: false, error: null, refetch: vi.fn() });
    movementsHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('180+ days')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('Never sold')).toBeInTheDocument();
  });

  it('excludes zero-quantity rows', () => {
    dataHook.mockReturnValue({ rows: [{ ...row(), onHand: 0, status: 'out', inventoryValue: 0 }], loading: false, error: null, refetch: vi.fn() });
    movementsHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No stock to analyse')).toBeInTheDocument();
  });
});
