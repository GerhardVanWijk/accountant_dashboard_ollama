import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { DeliveryNote } from '@/types';
import { DeliveryNotesPage } from './DeliveryNotesPage';

vi.mock('@/features/sales/hooks/useDeliveryNotes');
vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/inventory/hooks/useWarehouses');

import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

const dn: DeliveryNote = {
  id: 'dn1', createdAt: '', updatedAt: '', deliveryNoteNumber: 'DN-2026-0001', salesOrderId: 'so1',
  customerId: 'c1', warehouseId: 'wh1', deliveryDate: '2026-09-05', status: 'posted',
  lineItems: [{ id: 'l1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 4, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
};

beforeEach(() => {
  vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [], loading: false, error: null, refetch: vi.fn() } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}
function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sales/delivery-notes" element={<><DeliveryNotesPage /><Loc /></>} />
        <Route path="/sales/delivery-notes/:deliveryNoteId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DeliveryNotesPage', () => {
  it('renders the seeded delivery note with a human-readable number, never a raw UUID', () => {
    renderAt('/sales/delivery-notes');
    expect(screen.getByText('DN-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('dn1')).not.toBeInTheDocument();
  });

  it('navigates to the full-page record on row click', async () => {
    renderAt('/sales/delivery-notes');
    fireEvent.click(screen.getByText('DN-2026-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/delivery-notes/dn1'));
  });

  it('filters by status', () => {
    renderAt('/sales/delivery-notes');
    fireEvent.click(screen.getByRole('button', { name: 'draft' }));
    expect(screen.queryByText('DN-2026-0001')).not.toBeInTheDocument();
  });

  it('shows an empty state with no delivery notes', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    renderAt('/sales/delivery-notes');
    expect(screen.getByText(/no delivery notes yet/i)).toBeInTheDocument();
  });
});
