import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockTransfer } from '@/types';
import { TransferReportPage } from './TransferReportPage';

const transfersHook = vi.fn();
vi.mock('../../hooks/useStockTransfers', () => ({ useStockTransfers: () => transfersHook() }));
vi.mock('../../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }, { id: 'w2', name: 'Overflow' }], loading: false }) }));
vi.mock('@/features/accounting/hooks/useFinancialYears', () => ({ useFinancialYears: () => ({ financialYears: [] }) }));

const today = new Date().toISOString().slice(0, 10);

function transfer(overrides: Partial<StockTransfer> = {}): StockTransfer {
  return {
    id: 'tr_1', transferNumber: 'TRF-0001', fromWarehouseId: 'w1', toWarehouseId: 'w2', transferDate: today,
    lineItems: [{ id: 'l1', transferId: 'tr_1', productId: 'p1', quantity: 10, unitCost: 4, totalCost: 40 }],
    totalCost: 40, status: 'in_transit', createdAt: '', updatedAt: '', ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/transfers']}>
      <TransferReportPage />
    </MemoryRouter>,
  );
}

describe('TransferReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows transfers dispatched within the default this-month range', () => {
    transfersHook.mockReturnValue({ transfers: [transfer()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('TRF-0001')).toBeInTheDocument();
    expect(screen.getByText('Overflow')).toBeInTheDocument();
  });

  it('shows the empty state outside the range', () => {
    transfersHook.mockReturnValue({ transfers: [transfer({ transferDate: '2000-01-01' })], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No transfers in this period')).toBeInTheDocument();
  });
});
