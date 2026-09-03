import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { OpeningStockBatch } from '@/types';
import { OpeningStockBatchDetailPage } from './OpeningStockBatchDetailPage';

vi.mock('../hooks/useOpeningStockBatches');
vi.mock('../hooks/useProducts');
vi.mock('../hooks/useWarehouses');
vi.mock('@/features/accounting/hooks/useAccounts');
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';

const batch = (o: Partial<OpeningStockBatch> = {}): OpeningStockBatch => ({
  id: 'b1', createdAt: '', updatedAt: '', batchNumber: 'OSB-0001', warehouseId: 'wh1', effectiveDate: '2026-09-01',
  lineItems: [{ id: 'l1', productId: 'p1', warehouseId: 'wh1', quantity: 5, unitCost: 10, totalCost: 50 }],
  totalCost: 50, status: 'draft', ...o,
} as OpeningStockBatch);

beforeEach(() => {
  vi.mocked(useOpeningStockBatches).mockReturnValue({
    batches: [batch()], loading: false, error: null, refetch: vi.fn(),
    updateBatch: vi.fn(), confirmBatch: vi.fn(), cancelBatch: vi.fn(),
    previewAccountingEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Toner' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main' }], loading: false, error: null } as never);
  vi.mocked(useAccounts).mockReturnValue({ accounts: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/inventory/opening-stock/b1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/opening-stock/:batchId" element={<OpeningStockBatchDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpeningStockBatchDetailPage', () => {
  it('keeps Confirm disabled until the explicit confirmation checkbox is ticked', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: 'OSB-0001' })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/inventory/opening-stock/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
