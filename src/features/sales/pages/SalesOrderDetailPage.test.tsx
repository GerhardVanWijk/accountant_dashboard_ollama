import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SalesOrder } from '@/types';
import { SalesOrderDetailPage } from './SalesOrderDetailPage';

vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useSalesOrderMutations');
vi.mock('@/features/sales/hooks/useQuotes');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

const order = (o: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'so_1',
  createdAt: '',
  updatedAt: '',
  orderNumber: 'SO-2026-0004',
  customerId: 'cust_1',
  orderDate: '2026-09-10',
  lineItems: [
    { id: 'l1', description: 'Ergonomic chair', quantity: 3, unitPrice: 1500, taxAmount: 675, lineTotal: 4500 },
  ],
  subtotal: 4500,
  taxTotal: 675,
  total: 5175,
  currency: 'ZAR',
  status: 'pending',
  ...o,
});

beforeEach(() => {
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [order()], isLoading: false, error: null, refetch: vi.fn() });
  vi.mocked(useSalesOrderMutations).mockReturnValue({
    isLoading: false,
    error: null,
    createSalesOrder: vi.fn(),
    updateSalesOrder: vi.fn(),
    deleteSalesOrder: vi.fn(),
    confirmOrder: vi.fn(),
    cancelOrder: vi.fn(),
    convertToInvoice: vi.fn(),
    duplicateSalesOrder: vi.fn(),
  });
  vi.mocked(useQuotes).mockReturnValue({ quotes: [] } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [] } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['cust_1', 'FreshMart Retail Group']]), loading: false, error: null });
});

afterEach(cleanup);

function renderAt(path = '/sales/orders/so_1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/orders/:orderId" element={<SalesOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SalesOrderDetailPage', () => {
  it('renders as a full page: order number, customer, breadcrumb, line table — not a RecordDetailSheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'SO-2026-0004' })).toBeInTheDocument();
    expect(screen.getAllByText('FreshMart Retail Group').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Ergonomic chair')).toBeInTheDocument();
    expect(screen.getAllByText('Total').length).toBeGreaterThanOrEqual(1);
    // The right-hand sheet dialog must not be used for this record.
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('the order number heading never character-wraps', () => {
    renderAt();
    const heading = screen.getByRole('heading', { name: 'SO-2026-0004' });
    expect(heading).toHaveClass('whitespace-nowrap');
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/orders/does-not-exist');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });

  it('shows "Convert to invoice" as the primary action for an eligible order', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Convert to invoice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument();
  });

  it('a cancelled order offers neither convert nor confirm', () => {
    vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [order({ status: 'cancelled' })], isLoading: false, error: null, refetch: vi.fn() });
    renderAt();
    expect(screen.queryByRole('button', { name: 'Convert to invoice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument();
  });

  it('offers "Print / PDF" and "Duplicate" document actions (Phase 4B)', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });
});
