import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { StockTransfer } from '@/types';
import { StockTransferDetailPage } from './StockTransferDetailPage';

vi.mock('../hooks/useStockTransfers');
vi.mock('../hooks/useProducts');
vi.mock('../hooks/useWarehouses');
vi.mock('@/features/accounting/hooks/useAccounts');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useStockTransfers } from '../hooks/useStockTransfers';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';

const transfer = (o: Partial<StockTransfer> = {}): StockTransfer => ({
  id: 't1', createdAt: '', updatedAt: '', transferNumber: 'TRF-0001', fromWarehouseId: 'wh1', toWarehouseId: 'wh2',
  transferDate: '2026-09-01', lineItems: [{ id: 'l1', transferId: 't1', productId: 'p1', quantity: 3, unitCost: 10, totalCost: 30 }],
  totalCost: 30, status: 'draft', ...o,
} as StockTransfer);

beforeEach(() => {
  vi.mocked(useStockTransfers).mockReturnValue({
    transfers: [transfer()], loading: false, error: null, refetch: vi.fn(),
    updateTransfer: vi.fn(), dispatch: vi.fn(), receive: vi.fn(), completeImmediate: vi.fn(), cancelTransfer: vi.fn(),
    previewDispatchEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    previewReceiveEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Toner' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main' }, { id: 'wh2', name: 'Depot' }], loading: false, error: null } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/inventory/transfers/t1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/transfers/:transferId" element={<StockTransferDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StockTransferDetailPage', () => {
  it('renders as a full page showing the from → to route; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'TRF-0001' })).toBeInTheDocument();
    expect(screen.getAllByText('Main → Depot').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Complete now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dispatch' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('an in-transit transfer offers Receive', () => {
    vi.mocked(useStockTransfers).mockReturnValue({
      transfers: [transfer({ status: 'in_transit' })], loading: false, error: null, refetch: vi.fn(),
      updateTransfer: vi.fn(), dispatch: vi.fn(), receive: vi.fn(), completeImmediate: vi.fn(), cancelTransfer: vi.fn(),
      previewDispatchEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
      previewReceiveEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/inventory/transfers/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
