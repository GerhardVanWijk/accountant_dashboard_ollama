import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { SalesOrder } from '@/types';
import { CreateDeliveryNotePage } from './CreateDeliveryNotePage';

vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useDeliveryNotes');
vi.mock('@/features/sales/hooks/useReturnNotes');
vi.mock('@/features/sales/hooks/useDeliveryNoteMutations');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/inventory/hooks/useWarehouses');

import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useDeliveryNoteMutations } from '@/features/sales/hooks/useDeliveryNoteMutations';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

function so(o: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so1', createdAt: '', updatedAt: '', orderNumber: 'SO-2026-0004', customerId: 'c1',
    orderDate: '2026-09-01', status: 'confirmed', notes: undefined,
    lineItems: [{ id: 'sol1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
    subtotal: 0, taxTotal: 0, total: 0, currency: 'ZAR',
    ...o,
  } as unknown as SalesOrder;
}

const createDraft = vi.fn();

beforeEach(() => {
  createDraft.mockReset().mockResolvedValue({ id: 'dn9' });
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [so()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useReturnNotes).mockReturnValue({ returnNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useDeliveryNoteMutations).mockReturnValue({ createDraft, isLoading: false, error: null } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main Warehouse' }], loading: false, error: null } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}
function renderAt(entry = '/sales/orders/so1/deliver') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sales/orders/:orderId/deliver" element={<><CreateDeliveryNotePage /><Loc /></>} />
        <Route path="/sales/delivery-notes/:id" element={<Loc />} />
        <Route path="/sales/orders/:id" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreateDeliveryNotePage', () => {
  it('renders as a full page (not a modal/sheet) with the order number and the deliverable line, defaulting Deliver-now to the full remaining quantity', () => {
    const { container } = renderAt();
    expect(screen.getByText(/Create delivery — SO-2026-0004/)).toBeInTheDocument();
    expect(screen.getByText('Printer')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toBeNull();
    const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(qtyInput.value).toBe('10');
    expect(qtyInput.max).toBe('10');
  });

  it('a fully-delivered order shows no deliverable lines and disables submit', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({
      deliveryNotes: [{ id: 'dn1', createdAt: '', updatedAt: '', deliveryNoteNumber: 'DN-1', salesOrderId: 'so1', customerId: 'c1', warehouseId: 'wh1', deliveryDate: '2026-09-01', status: 'posted', lineItems: [{ id: 'l1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }] }],
      isLoading: false, loading: false, error: null, refetch: vi.fn(),
    } as never);
    renderAt();
    expect(screen.getByText(/already been fully delivered/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create delivery note/i })).toBeDisabled();
  });

  it('a non-confirmed order shows a friendly blocking message instead of the form', () => {
    vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [so({ status: 'pending' })], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByText(/Only a confirmed sales order can be delivered against/)).toBeInTheDocument();
    expect(screen.queryByText('Printer')).not.toBeInTheDocument();
  });

  it('an unknown order id shows a friendly not-found message', () => {
    renderAt('/sales/orders/nope/deliver');
    expect(screen.getByText('Sales order not found.')).toBeInTheDocument();
  });

  it('rejects submit with no warehouse selected, without calling createDraft', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Create delivery note/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select a warehouse.');
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('Cancel navigates back to the sales order', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/sales/orders/so1');
  });
});
