import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Payment } from '@/types';
import { SupplierPaymentDetailPage } from './SupplierPaymentDetailPage';

vi.mock('@/features/suppliers/hooks/useSuppliers');
vi.mock('@/features/purchases/hooks');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePayments, useBills } from '@/features/purchases/hooks';

const payment = (o: Partial<Payment> = {}): Payment => ({
  id: 'pay1', createdAt: '', updatedAt: '', paymentNumber: 'PAY-2026-0001', supplierId: 's1', date: '2026-09-15',
  method: 'eft', amount: 1000, unallocatedAmount: 400, currency: 'ZAR',
  allocations: [{ billId: 'b1', amount: 600 }], ...o,
});

beforeEach(() => {
  vi.mocked(useSuppliers).mockReturnValue({ suppliers: [{ id: 's1', name: 'Paper Co' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePayments).mockReturnValue({ payments: [payment()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useBills).mockReturnValue({
    bills: [{ id: 'b1', billNumber: 'BILL-2005', supplierId: 's1', total: 600, amountPaid: 600 }],
    isLoading: false, error: null, refetch: vi.fn(),
  } as never);
});

afterEach(cleanup);

function renderAt(path = '/purchases/payments/pay1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/purchases/payments/:paymentId" element={<SupplierPaymentDetailPage />} />
        <Route path="/purchases/bills/:billId" element={<div>bill page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierPaymentDetailPage', () => {
  it('renders a tabbed page; the Allocations tab links each supplier invoice; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'PAY-2026-0001' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Allocations/ }));
    expect(screen.getByRole('columnheader', { name: 'Supplier invoice' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'BILL-2005' }).length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/purchases/payments/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
