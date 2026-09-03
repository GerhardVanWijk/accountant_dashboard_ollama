import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { StockAdjustment } from '@/types';
import { StockAdjustmentDetailPage } from './StockAdjustmentDetailPage';

vi.mock('../hooks/useStockAdjustments');
vi.mock('../hooks/useProducts');
vi.mock('../hooks/useWarehouses');
vi.mock('@/features/accounting/hooks/useAccounts');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';

const adj = (o: Partial<StockAdjustment> = {}): StockAdjustment => ({
  id: 'adj1', createdAt: '', updatedAt: '', adjustmentNumber: 'STA-011', warehouseId: 'wh1', adjustmentDate: '2026-09-01',
  reason: 'write_off',
  lineItems: [{ id: 'l1', adjustmentId: 'adj1', productId: 'p1', warehouseId: 'wh1', quantityDelta: -2, unitCost: 10, costEffect: -20 }],
  totalCostEffect: -20, status: 'draft', ...o,
});

beforeEach(() => {
  vi.mocked(useStockAdjustments).mockReturnValue({
    adjustments: [adj()], loading: false, error: null, refetch: vi.fn(),
    updateAdjustment: vi.fn(), submitForApproval: vi.fn(), approve: vi.fn(), postAdjustment: vi.fn(),
    cancelAdjustment: vi.fn(), reverseAdjustment: vi.fn(),
    previewAccountingEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Toner' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main' }], loading: false, error: null } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/inventory/adjustments/adj1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/adjustments/:adjustmentId" element={<StockAdjustmentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StockAdjustmentDetailPage', () => {
  it('renders as a full page with the number, lines and action bar; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'STA-011' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a posted adjustment offers Reverse, not Post', () => {
    vi.mocked(useStockAdjustments).mockReturnValue({
      adjustments: [adj({ status: 'posted', journalEntryId: 'je1' })], loading: false, error: null, refetch: vi.fn(),
      updateAdjustment: vi.fn(), submitForApproval: vi.fn(), approve: vi.fn(), postAdjustment: vi.fn(),
      cancelAdjustment: vi.fn(), reverseAdjustment: vi.fn(),
      previewAccountingEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reverse' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/inventory/adjustments/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
