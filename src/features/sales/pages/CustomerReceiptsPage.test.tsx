import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { CustomerReceipt } from '@/types';
import { CustomerReceiptsPage } from './CustomerReceiptsPage';

vi.mock('@/features/sales/hooks/useCustomerReceipts');
vi.mock('@/features/sales/hooks/useCustomerReceiptMutations');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useCustomerMap');

import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

const r: CustomerReceipt = {
  id: 'r1', createdAt: '', updatedAt: '', receiptNumber: 'RCT-2026-0001', customerId: 'c1',
  date: '2026-09-10', method: 'eft', amount: 1000, unallocatedAmount: 1000, currency: 'ZAR', allocations: [],
};

beforeEach(() => {
  vi.mocked(useCustomerReceipts).mockReturnValue({ receipts: [r], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerReceiptMutations).mockReturnValue({ recordReceipt: vi.fn(), allocateToInvoice: vi.fn(), error: null } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useCustomerList).mockReturnValue({ customers: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}
function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sales/receipts" element={<><CustomerReceiptsPage /><Loc /></>} />
        <Route path="/sales/receipts/:receiptId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerReceiptsPage', () => {
  it('navigates to the full-page record on row click', async () => {
    renderAt('/sales/receipts');
    fireEvent.click(screen.getByRole('button', { name: 'RCT-2026-0001' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/receipts/r1'));
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    renderAt('/sales/receipts?record=r1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/receipts/r1'));
  });
});
