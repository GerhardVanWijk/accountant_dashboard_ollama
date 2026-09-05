import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { DeliveryNote } from '@/types';
import { CreateReturnNotePage } from './CreateReturnNotePage';

vi.mock('@/features/sales/hooks/useDeliveryNotes');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useReturnNotes');
vi.mock('@/features/sales/hooks/useReturnNoteMutations');
vi.mock('@/features/sales/hooks/useCustomerMap');

import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useReturnNoteMutations } from '@/features/sales/hooks/useReturnNoteMutations';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

function dn(o: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn1', createdAt: '', updatedAt: '', deliveryNoteNumber: 'DN-2026-0001', salesOrderId: 'so1',
    customerId: 'c1', warehouseId: 'wh1', deliveryDate: '2026-09-01', status: 'posted',
    lineItems: [{ id: 'dnl1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
    ...o,
  };
}

const createDraft = vi.fn();

beforeEach(() => {
  createDraft.mockReset().mockResolvedValue({ id: 'rn9' });
  vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn()], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useReturnNotes).mockReturnValue({ returnNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useReturnNoteMutations).mockReturnValue({ createDraft, isLoading: false, error: null } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}
function renderAt(entry = '/sales/delivery-notes/dn1/return') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sales/delivery-notes/:deliveryNoteId/return" element={<><CreateReturnNotePage /><Loc /></>} />
        <Route path="/sales/return-notes/:id" element={<Loc />} />
        <Route path="/sales/delivery-notes/:id" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreateReturnNotePage', () => {
  it('renders as a full page (not a modal/sheet) with the delivery note number and the returnable line, defaulting Return-now to 0', () => {
    const { container } = renderAt();
    expect(screen.getByText(/Create return — DN-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText('Printer')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toBeNull();
    const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(qtyInput.value).toBe('0');
    expect(qtyInput.max).toBe('10');
  });

  it('a fully-invoiced delivery shows no returnable lines and disables submit', () => {
    vi.mocked(useInvoices).mockReturnValue({
      invoices: [{ id: 'inv1', status: 'sent', lineItems: [{ id: 'il1', deliveryNoteLineId: 'dnl1', quantity: 10 }] }],
      loading: false, error: null, refetch: vi.fn(),
    } as never);
    renderAt();
    expect(screen.getByText(/already been fully invoiced or returned/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create return note/i })).toBeDisabled();
  });

  it('a non-posted delivery note shows a friendly blocking message instead of the form', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn({ status: 'draft' })], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByText(/Only a posted delivery note has physical stock to return/)).toBeInTheDocument();
    expect(screen.queryByText('Printer')).not.toBeInTheDocument();
  });

  it('an unknown delivery note id shows a friendly not-found message', () => {
    renderAt('/sales/delivery-notes/nope/return');
    expect(screen.getByText('Delivery note not found.')).toBeInTheDocument();
  });

  it('rejects submit with a zero quantity, without calling createDraft', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Create return note/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('submits with a valid quantity and navigates to the new return note', async () => {
    renderAt();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Create return note/i }));
    await screen.findByTestId('loc');
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({
      deliveryNoteId: 'dn1',
      lines: [{ deliveryNoteLineId: 'dnl1', quantity: 4 }],
    }));
  });

  it('Cancel navigates back to the delivery note', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/sales/delivery-notes/dn1');
  });
});
