import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockAdjustment } from '@/types';
import { StockAdjustmentReportPage } from './StockAdjustmentReportPage';

const adjustmentsHook = vi.fn();
vi.mock('../../hooks/useStockAdjustments', () => ({ useStockAdjustments: () => adjustmentsHook() }));
vi.mock('../../hooks/useProducts', () => ({ useProducts: () => ({ products: [{ id: 'p1', sku: 'PEN-1', name: 'Blue Pen' }], loading: false }) }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }], loading: false }) }));
vi.mock('@/features/accounting/hooks/useFinancialYears', () => ({ useFinancialYears: () => ({ financialYears: [] }) }));

const today = new Date().toISOString().slice(0, 10);

function adjustment(overrides: Partial<StockAdjustment> = {}): StockAdjustment {
  return {
    id: 'adj_1', adjustmentNumber: 'ADJ-0001', warehouseId: 'w1', adjustmentDate: today, reason: 'write_off',
    lineItems: [{ id: 'l1', adjustmentId: 'adj_1', productId: 'p1', warehouseId: 'w1', quantityDelta: -5, unitCost: 4, costEffect: -20 }],
    totalCostEffect: -20, status: 'posted', createdAt: '', updatedAt: '', ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/adjustments']}>
      <StockAdjustmentReportPage />
    </MemoryRouter>,
  );
}

describe('StockAdjustmentReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows adjustment lines and the write-off total for the default this-month range', () => {
    adjustmentsHook.mockReturnValue({ adjustments: [adjustment()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('Total write-offs')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('shows the empty state outside the range', () => {
    adjustmentsHook.mockReturnValue({ adjustments: [adjustment({ adjustmentDate: '2000-01-01' })], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No adjustments in this period')).toBeInTheDocument();
  });
});
