import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ReturnNote } from '@/types';
import { ReturnNotesPage } from './ReturnNotesPage';

vi.mock('@/features/sales/hooks/useReturnNotes');
vi.mock('@/features/sales/hooks/useDeliveryNotes');
vi.mock('@/features/sales/hooks/useCustomerMap');

import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

const rn: ReturnNote = {
  id: 'rn1', createdAt: '', updatedAt: '', returnNoteNumber: 'RN-2026-0001', deliveryNoteId: 'dn1',
  salesOrderId: 'so1', customerId: 'c1', warehouseId: 'wh1', returnDate: '2026-09-06', status: 'posted',
  lineItems: [{ id: 'l1', deliveryNoteLineId: 'dnl1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 2, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
};

beforeEach(() => {
  vi.mocked(useReturnNotes).mockReturnValue({ returnNotes: [rn], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
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
        <Route path="/sales/return-notes" element={<><ReturnNotesPage /><Loc /></>} />
        <Route path="/sales/return-notes/:returnNoteId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReturnNotesPage', () => {
  it('renders the seeded return note with a human-readable number, never a raw UUID', () => {
    renderAt('/sales/return-notes');
    expect(screen.getByText('RN-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('rn1')).not.toBeInTheDocument();
  });

  it('navigates to the full-page record on row click', async () => {
    renderAt('/sales/return-notes');
    fireEvent.click(screen.getByText('RN-2026-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/return-notes/rn1'));
  });

  it('filters by status', () => {
    renderAt('/sales/return-notes');
    fireEvent.click(screen.getByRole('button', { name: 'draft' }));
    expect(screen.queryByText('RN-2026-0001')).not.toBeInTheDocument();
  });

  it('shows an empty state with no return notes', () => {
    vi.mocked(useReturnNotes).mockReturnValue({ returnNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    renderAt('/sales/return-notes');
    expect(screen.getByText(/no return notes yet/i)).toBeInTheDocument();
  });
});
