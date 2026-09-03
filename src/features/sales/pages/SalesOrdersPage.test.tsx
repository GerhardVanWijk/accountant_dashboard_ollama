import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { SalesOrder } from '@/types';
import { SalesOrdersPage } from './SalesOrdersPage';

vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useSalesOrderMutations');
vi.mock('@/features/sales/hooks/useCustomerMap');

import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

const so: SalesOrder = {
  id: 'so_1', createdAt: '', updatedAt: '', orderNumber: 'SO-2026-0004', customerId: 'c1',
  orderDate: '2026-09-10', lineItems: [], subtotal: 0, taxTotal: 0, total: 0, currency: 'ZAR', status: 'pending',
};

beforeEach(() => {
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [so], isLoading: false, error: null, refetch: vi.fn() });
  vi.mocked(useSalesOrderMutations).mockReturnValue({
    isLoading: false, error: null, createSalesOrder: vi.fn(), updateSalesOrder: vi.fn(),
    deleteSalesOrder: vi.fn(), confirmOrder: vi.fn(), cancelOrder: vi.fn(), convertToInvoice: vi.fn(),
  });
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null });
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
        <Route path="/sales/orders" element={<><SalesOrdersPage /><Loc /></>} />
        <Route path="/sales/orders/:orderId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SalesOrdersPage', () => {
  it('navigates to the full-page record on row click — no ?record= modal state', async () => {
    renderAt('/sales/orders');
    fireEvent.click(screen.getByRole('button', { name: /open sales order SO-2026-0004/i }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/orders/so_1'));
  });

  it('redirects a legacy /sales/orders?record=<id> deep link to the canonical record route', async () => {
    renderAt('/sales/orders?record=so_1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/orders/so_1'));
    expect(screen.getByTestId('loc')).not.toHaveTextContent('record=');
  });
});
