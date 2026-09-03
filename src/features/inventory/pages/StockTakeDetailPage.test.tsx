import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { StockTake } from '@/types';
import { StockTakeDetailPage } from './StockTakeDetailPage';

vi.mock('../hooks/useStockTakes');
vi.mock('../hooks/useProducts');
vi.mock('../hooks/useWarehouses');
vi.mock('../hooks/useProductCategories');
vi.mock('@/features/accounting/hooks/useAccounts');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useStockTakes } from '../hooks/useStockTakes';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProductCategories } from '../hooks/useProductCategories';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';

const take = (o: Partial<StockTake> = {}): StockTake => ({
  id: 's1', createdAt: '', updatedAt: '', stockTakeNumber: 'STK-0001', warehouseId: 'wh1', scope: 'all',
  countDate: '2026-09-01', lineItems: [], totalVarianceValue: 0, status: 'draft', ...o,
} as StockTake);

beforeEach(() => {
  vi.mocked(useStockTakes).mockReturnValue({
    stockTakes: [take()], loading: false, error: null, refetch: vi.fn(),
    updateStockTake: vi.fn(), freeze: vi.fn(), enterCounts: vi.fn(), markReadyForReview: vi.fn(), postStockTake: vi.fn(), cancelStockTake: vi.fn(),
    previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main' }], loading: false, error: null } as never);
  vi.mocked(useProductCategories).mockReturnValue({ categories: [], loading: false, error: null } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/inventory/stock-takes/s1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/stock-takes/:stockTakeId" element={<StockTakeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StockTakeDetailPage', () => {
  it('renders as a full page with the warehouse and freeze action; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'STK-0001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freeze count sheet' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a counting stock take offers "Mark ready for review"', () => {
    vi.mocked(useStockTakes).mockReturnValue({
      stockTakes: [take({ status: 'counting' })], loading: false, error: null, refetch: vi.fn(),
      updateStockTake: vi.fn(), freeze: vi.fn(), enterCounts: vi.fn(), markReadyForReview: vi.fn(), postStockTake: vi.fn(), cancelStockTake: vi.fn(),
      previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Mark ready for review' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/inventory/stock-takes/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
