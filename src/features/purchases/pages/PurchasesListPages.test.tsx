import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Bill, Payment, PurchaseOrder } from '@/types';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { BillsPage } from './BillsPage';
import { PaymentsPage } from './PaymentsPage';

vi.mock('@/features/suppliers/hooks/useSuppliers');
vi.mock('@/features/purchases/hooks');
vi.mock('../hooks/useBills');
vi.mock('../hooks/useBillMutations');

import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations, usePayments, usePaymentMutations } from '@/features/purchases/hooks';
import { useBills } from '../hooks/useBills';
import { useBillMutations } from '../hooks/useBillMutations';

const poRow: PurchaseOrder = {
  id: 'po1', createdAt: '', updatedAt: '', poNumber: 'PO-2026-0001', supplierId: 's1', orderDate: '2026-09-01',
  lineItems: [], subtotal: 0, taxTotal: 0, total: 0, currency: 'ZAR', status: 'sent',
};
const billRow: Bill = {
  id: 'b1', createdAt: '', updatedAt: '', billNumber: 'BILL-2005', supplierId: 's1', issueDate: '2026-09-01', dueDate: '2026-09-30',
  lineItems: [], subtotal: 0, taxTotal: 0, total: 0, amountPaid: 0, currency: 'ZAR', status: 'awaiting_payment',
};
const payRow: Payment = {
  id: 'pay1', createdAt: '', updatedAt: '', paymentNumber: 'PAY-2026-0001', supplierId: 's1', date: '2026-09-15',
  method: 'eft', amount: 0, unallocatedAmount: 0, currency: 'ZAR', allocations: [],
};

beforeEach(() => {
  vi.mocked(useSuppliers).mockReturnValue({ suppliers: [{ id: 's1', name: 'Paper Co' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePurchaseOrders).mockReturnValue({ purchaseOrders: [poRow], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePurchaseOrderMutations).mockReturnValue({ createPurchaseOrder: vi.fn() } as never);
  vi.mocked(usePayments).mockReturnValue({ payments: [payRow], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(usePaymentMutations).mockReturnValue({ createPayment: vi.fn(), isLoading: false } as never);
  vi.mocked(useBills).mockReturnValue({ bills: [billRow], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useBillMutations).mockReturnValue({ createBill: vi.fn(), postBill: vi.fn(), isLoading: false, error: null } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(el: React.ReactNode, listPath: string, entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={listPath} element={<>{el}<Loc /></>} />
        <Route path={`${listPath}/:id`} element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Purchases list pages → full-page records', () => {
  it('PurchaseOrdersPage row click navigates to the canonical route', async () => {
    renderPage(<PurchaseOrdersPage />, '/purchases/orders', '/purchases/orders');
    fireEvent.click(screen.getByRole('button', { name: 'PO-2026-0001' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/orders/po1'));
  });

  it('PurchaseOrdersPage redirects a legacy ?record= deep link', async () => {
    renderPage(<PurchaseOrdersPage />, '/purchases/orders', '/purchases/orders?record=po1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/orders/po1'));
  });

  it('BillsPage row click navigates to the canonical route', async () => {
    renderPage(<BillsPage />, '/purchases/bills', '/purchases/bills');
    fireEvent.click(screen.getByRole('button', { name: 'BILL-2005' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/bills/b1'));
  });

  it('BillsPage redirects a legacy ?record= deep link', async () => {
    renderPage(<BillsPage />, '/purchases/bills', '/purchases/bills?record=b1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/bills/b1'));
  });

  it('PaymentsPage row click navigates to the canonical route', async () => {
    renderPage(<PaymentsPage />, '/purchases/payments', '/purchases/payments');
    fireEvent.click(screen.getByRole('button', { name: 'PAY-2026-0001' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/payments/pay1'));
  });

  it('PaymentsPage redirects a legacy ?record= deep link', async () => {
    renderPage(<PaymentsPage />, '/purchases/payments', '/purchases/payments?record=pay1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/payments/pay1'));
  });
});
