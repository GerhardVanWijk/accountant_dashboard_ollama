import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockTake } from '@/types';
import { StockTakeVarianceReportPage } from './StockTakeVarianceReportPage';

const takesHook = vi.fn();
vi.mock('../../hooks/useStockTakes', () => ({ useStockTakes: () => takesHook() }));
vi.mock('../../hooks/useProducts', () => ({ useProducts: () => ({ products: [{ id: 'p1', sku: 'PEN-1', name: 'Blue Pen' }], loading: false }) }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }], loading: false }) }));
vi.mock('@/features/accounting/hooks/useFinancialYears', () => ({ useFinancialYears: () => ({ financialYears: [] }) }));

const today = new Date().toISOString().slice(0, 10);

function stockTake(overrides: Partial<StockTake> = {}): StockTake {
  return {
    id: 'stk_1', stockTakeNumber: 'STK-0001', warehouseId: 'w1', scope: 'all', scopeRef: {}, countDate: today,
    lineItems: [{ id: 'l1', stockTakeId: 'stk_1', productId: 'p1', warehouseId: 'w1', expectedQty: 100, countedQty: 95, unitCost: 4, varianceQty: -5, varianceValue: -20 }],
    totalVarianceValue: -20, status: 'posted', createdAt: '', updatedAt: '', ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/stock-take-variance']}>
      <StockTakeVarianceReportPage />
    </MemoryRouter>,
  );
}

describe('StockTakeVarianceReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows counted variance lines for takes within the default this-month range', () => {
    takesHook.mockReturnValue({ stockTakes: [stockTake()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getByText('STK-0001')).toBeInTheDocument();
  });

  it('shows the empty state outside the range', () => {
    takesHook.mockReturnValue({ stockTakes: [stockTake({ countDate: '2000-01-01' })], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No counted variance in this period')).toBeInTheDocument();
  });
});
