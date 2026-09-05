import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { DeliveryNote, SalesOrder } from '@/types';
import { DeliveryNoteDetailPage } from './DeliveryNoteDetailPage';

vi.mock('@/features/sales/hooks/useDeliveryNotes');
vi.mock('@/features/sales/hooks/useDeliveryNoteMutations');
vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/inventory/hooks/useWarehouses');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/inventory/hooks/useStockMovements');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useReturnNotes');
vi.mock('@/features/admin/hooks/useCompany');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useDeliveryNoteMutations } from '@/features/sales/hooks/useDeliveryNoteMutations';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useCompany } from '@/features/admin/hooks/useCompany';

const so: SalesOrder = {
  id: 'so1', createdAt: '', updatedAt: '', orderNumber: 'SO-2026-0004', customerId: 'c1',
  orderDate: '2026-09-01', status: 'confirmed', notes: undefined,
  lineItems: [{ id: 'sol1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
  subtotal: 0, taxTotal: 0, total: 0, currency: 'ZAR',
} as unknown as SalesOrder;

function dn(o: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn1', createdAt: '', updatedAt: '', deliveryNoteNumber: 'DN-2026-0001', salesOrderId: 'so1',
    customerId: 'c1', warehouseId: 'wh1', deliveryDate: '2026-09-05', status: 'draft',
    lineItems: [{ id: 'l1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 4, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
    ...o,
  };
}

beforeEach(() => {
  vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn()], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useDeliveryNoteMutations).mockReturnValue({
    postDeliveryNote: vi.fn(), cancelDraft: vi.fn(), deleteDraft: vi.fn(), createInvoiceFromDeliveryNote: vi.fn(), isLoading: false, error: null,
  } as never);
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [so], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useCustomerList).mockReturnValue({ customers: [{ id: 'c1', name: 'FreshMart' }], loading: false, error: null } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [{ id: 'wh1', name: 'Main Warehouse' }], loading: false, error: null } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', name: 'Printer', costPrice: 3200 }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useStockMovements).mockReturnValue({ movements: [], stockLevels: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useReturnNotes).mockReturnValue({ returnNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCompany).mockReturnValue({ company: undefined, loading: false, error: null, refetch: vi.fn() } as never);
});

afterEach(cleanup);

function renderAt(path = '/sales/delivery-notes/dn1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/delivery-notes/:deliveryNoteId" element={<DeliveryNoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DeliveryNoteDetailPage', () => {
  it('renders as a full page with the number, customer and line items; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'DN-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('Printer')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('never renders the raw UUID for the record — only its human number', () => {
    renderAt();
    expect(screen.queryByText('dn1')).not.toBeInTheDocument();
  });

  it('links the originating sales order as a related record', () => {
    renderAt();
    expect(screen.getAllByRole('link', { name: 'SO-2026-0004' }).length).toBeGreaterThanOrEqual(1);
  });

  it('a draft delivery note offers Post delivery, Cancel draft (inline) and Delete draft (overflow); never Create invoice', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Post delivery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel draft' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Delete draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create invoice' })).not.toBeInTheDocument();
  });

  it('a posted delivery note with remaining quantity offers Create invoice, never Post/Cancel/Delete', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn({ status: 'posted', journalEntryId: 'je1' })], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post delivery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('a fully-invoiced posted delivery note offers no primary action', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn({ status: 'posted', journalEntryId: 'je1' })], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    vi.mocked(useInvoices).mockReturnValue({
      invoices: [{ id: 'inv1', invoiceNumber: 'INV-2026-0001', status: 'sent', lineItems: [{ id: 'il1', deliveryNoteLineId: 'l1', quantity: 4 }] }],
      loading: false, error: null, refetch: vi.fn(),
    } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Create invoice' })).not.toBeInTheDocument();
    expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
  });

  it('a posted delivery note with returnable quantity offers a "Create return" action', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn({ status: 'posted', journalEntryId: 'je1' })], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Create return' })).toBeInTheDocument();
  });

  it('a draft delivery note never offers "Create return" — nothing has physically left the warehouse yet', () => {
    renderAt();
    expect(screen.queryByRole('button', { name: 'Create return' })).not.toBeInTheDocument();
  });

  it('lists posted return notes against this delivery, linking to the full-page record', () => {
    vi.mocked(useDeliveryNotes).mockReturnValue({ deliveryNotes: [dn({ status: 'posted', journalEntryId: 'je1' })], isLoading: false, loading: false, error: null, refetch: vi.fn() } as never);
    vi.mocked(useReturnNotes).mockReturnValue({
      returnNotes: [{
        id: 'rn1', createdAt: '', updatedAt: '', returnNoteNumber: 'RN-2026-0001', deliveryNoteId: 'dn1',
        salesOrderId: 'so1', customerId: 'c1', warehouseId: 'wh1', returnDate: '2026-09-06', status: 'posted',
        lineItems: [{ id: 'rl1', deliveryNoteLineId: 'l1', salesOrderLineId: 'sol1', productId: 'p1', description: 'Printer', quantity: 1, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      }],
      isLoading: false, loading: false, error: null, refetch: vi.fn(),
    } as never);
    renderAt();
    expect(screen.getByRole('link', { name: 'RN-2026-0001' })).toHaveAttribute('href', '/sales/return-notes/rn1');
  });

  it('offers a "Print / PDF" action but never a "Duplicate" one', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/delivery-notes/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
