import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockMovement } from '@/types';
import { StockMovementReportPage } from './StockMovementReportPage';

const movementsHook = vi.fn();
vi.mock('../../hooks/useStockMovements', () => ({ useStockMovements: () => movementsHook() }));
vi.mock('../../hooks/useProducts', () => ({ useProducts: () => ({ products: [{ id: 'p1', sku: 'PEN-1', name: 'Blue Pen' }], loading: false }) }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }], loading: false }) }));
vi.mock('@/features/accounting/hooks/useFinancialYears', () => ({ useFinancialYears: () => ({ financialYears: [] }) }));

const today = new Date().toISOString().slice(0, 10);

function mv(overrides: Partial<StockMovement>): StockMovement {
  return { id: 'm1', productId: 'p1', warehouseId: 'w1', type: 'sale', quantityDelta: -3, movementDate: today, createdAt: `${today}T10:00:00.000Z`, updatedAt: `${today}T10:00:00.000Z`, ...overrides } as StockMovement;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/movements']}>
      <StockMovementReportPage />
    </MemoryRouter>,
  );
}

describe('StockMovementReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows movements falling within the default this-month range', () => {
    movementsHook.mockReturnValue({ movements: [mv({})], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
  });

  it('excludes movements outside the date range', () => {
    movementsHook.mockReturnValue({ movements: [mv({ movementDate: '2000-01-01', createdAt: '2000-01-01T10:00:00.000Z' })], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No movements in this period')).toBeInTheDocument();
  });

  it('shows the date range control', () => {
    movementsHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByLabelText('Date range')).toBeInTheDocument();
  });
});
