import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SalesOrder } from '@/types';
import { SalesOrderDetailPage } from './SalesOrderDetailPage';

vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useSalesOrderMutations');
vi.mock('@/features/sales/hooks/useQuotes');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/sales/hooks/useDeliveryNotes', () => ({ useDeliveryNotes: () => ({ deliveryNotes: [], isLoading: false, loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/features/inventory/hooks/useProducts', () => ({ useProducts: () => ({ products: [], loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/features/inventory/hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [], loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/features/inventory/hooks/useStockCommitments', () => ({ useStockCommitments: () => ({ commitments: new Map(), loading: false, error: null, refetch: vi.fn() }) }));

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
    cancelOrder: vi.fn(), closeRemaining: vi.fn(),
    convertToInvoice: vi.fn(),
    createInvoiceFromSalesOrder: vi.fn(),
    duplicateSalesOrder: vi.fn(),
  });
  vi.mocked(useQuotes).mockReturnValue({ quotes: [] } as never);
  vi.mocked(useInvoices).mockReturnValue({ invoices: [], refetch: vi.fn() } as never);
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

  it('shows "Create invoice" as the primary action for an eligible order', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument();
  });

  it('a cancelled order offers neither invoice nor confirm', () => {
    vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [order({ status: 'cancelled' })], isLoading: false, error: null, refetch: vi.fn() });
    renderAt();
    expect(screen.queryByRole('button', { name: /invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument();
  });

  it('offers "Print / PDF" and "Duplicate" document actions (Phase 4B)', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });

  describe('Phase 5B.1 — fulfilment progress', () => {
    const confirmedOrder = () =>
      order({
        id: 'so_1',
        status: 'confirmed',
        lineItems: [{ id: 'sol-1', description: 'Ergonomic chair', quantity: 10, unitPrice: 1500, taxAmount: 2250, lineTotal: 15000 }],
        subtotal: 15000,
        taxTotal: 2250,
        total: 17250,
      });

    const partialInvoice = (over: Partial<import('@/types').Invoice> = {}) =>
      ({
        id: 'inv_1',
        invoiceNumber: 'INV-2026-0001',
        customerId: 'cust_1',
        salesOrderId: 'so_1',
        issueDate: '2026-09-15',
        dueDate: '2026-10-15',
        lineItems: [{ id: 'il-1', salesOrderLineId: 'sol-1', description: 'Ergonomic chair', quantity: 4, unitPrice: 1500, taxAmount: 900, lineTotal: 6000 }],
        subtotal: 6000,
        taxTotal: 900,
        total: 6900,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'sent',
        createdAt: '',
        updatedAt: '',
        ...over,
      }) as import('@/types').Invoice;

    it('shows Ordered / Invoiced / Remaining per line and a partially-invoiced badge', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [confirmedOrder()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [partialInvoice()], refetch: vi.fn() } as never);
      renderAt();
      expect(screen.getByText('Partially invoiced')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Invoiced' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Remaining' })).toBeInTheDocument();
      // Overview summary fields
      expect(screen.getByText('Invoiced (posted)').parentElement).toHaveTextContent('4');
      // Phase 5C: "Remaining to fulfil" was superseded by the delivery-aware
      // "Remaining to deliver" — numerically identical here since no
      // Delivery Note exists (proven to reduce byte-identically in
      // salesOrderFulfilment.test.ts).
      expect(screen.getByText('Remaining to deliver').parentElement).toHaveTextContent('6');
      // primary action reads "Invoice remaining" when partly invoiced
      expect(screen.getByRole('button', { name: 'Invoice remaining' })).toBeInTheDocument();
    });

    it('lists related invoices and opens a preview without leaving the page', async () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [confirmedOrder()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [partialInvoice()], refetch: vi.fn() } as never);
      renderAt();
      const section = screen.getByRole('heading', { name: 'Related invoices' });
      expect(section).toBeInTheDocument();
      const link = screen.getAllByRole('button', { name: 'INV-2026-0001' })[0];
      link.click();
      // the SO page is still mounted underneath
      expect(screen.getByRole('heading', { name: 'SO-2026-0004' })).toBeInTheDocument();
    });

    it('a fully-invoiced order offers no convert action', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [order({ id: 'so_1', status: 'fulfilled', lineItems: confirmedOrder().lineItems })], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [partialInvoice({ lineItems: [{ id: 'il-1', salesOrderLineId: 'sol-1', description: 'Ergonomic chair', quantity: 10, unitPrice: 1500, taxAmount: 2250, lineTotal: 15000 }] })], refetch: vi.fn() } as never);
      renderAt();
      expect(screen.queryByRole('button', { name: /invoice/i })).not.toBeInTheDocument();
    });
  });

  describe('Phase 5B.2 — partial-invoice picker', () => {
    const confirmedOrder = () =>
      order({ id: 'so_1', status: 'confirmed', lineItems: [
        { id: 'sol-1', productId: 'p1', description: 'Chair', quantity: 10, unitPrice: 1500, taxRateId: 'v', taxAmount: 2250, lineTotal: 15000 },
      ], subtotal: 15000, taxTotal: 2250, total: 17250 });

    it('opens the picker modal (not a RecordDetailSheet) from the primary action', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [confirmedOrder()], isLoading: false, error: null, refetch: vi.fn() });
      const { container } = renderAt();
      fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Create invoice from sales order')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
      // remaining quantity shown, defaulted into the "Invoice now" field
      expect((within(dialog).getAllByRole('spinbutton')[0] as HTMLInputElement).value).toBe('10');
    });

    it('creates the draft, shows the success banner with View / Open actions, and does not auto-navigate', async () => {
      const createInvoiceFromSalesOrder = vi.fn().mockResolvedValue({ id: 'inv_new', invoiceNumber: 'INV-2026-0007' });
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [confirmedOrder()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useSalesOrderMutations).mockReturnValue({
        isLoading: false, error: null,
        createSalesOrder: vi.fn(), updateSalesOrder: vi.fn(), deleteSalesOrder: vi.fn(),
        confirmOrder: vi.fn(), cancelOrder: vi.fn(), closeRemaining: vi.fn(), convertToInvoice: vi.fn(),
        createInvoiceFromSalesOrder, duplicateSalesOrder: vi.fn(),
      });
      renderAt();
      fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }));
      const [l1Qty] = within(screen.getByRole('dialog')).getAllByRole('spinbutton');
      fireEvent.change(l1Qty, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create draft invoice' }));

      expect(await screen.findByText(/Draft invoice/)).toHaveTextContent('INV-2026-0007');
      expect(createInvoiceFromSalesOrder).toHaveBeenCalledWith('so_1', [{ salesOrderLineId: 'sol-1', quantity: 3 }]);
      expect(screen.getByRole('button', { name: 'View invoice' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open full invoice' })).toBeInTheDocument();
      // still on the SO page
      expect(screen.getByRole('heading', { name: 'SO-2026-0004' })).toBeInTheDocument();
    });

    it('surfaces a service validation error inside the picker', async () => {
      const createInvoiceFromSalesOrder = vi.fn().mockRejectedValue(new Error('only 2 remain to invoice'));
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [confirmedOrder()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useSalesOrderMutations).mockReturnValue({
        isLoading: false, error: null,
        createSalesOrder: vi.fn(), updateSalesOrder: vi.fn(), deleteSalesOrder: vi.fn(),
        confirmOrder: vi.fn(), cancelOrder: vi.fn(), closeRemaining: vi.fn(), convertToInvoice: vi.fn(),
        createInvoiceFromSalesOrder, duplicateSalesOrder: vi.fn(),
      });
      renderAt();
      fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create draft invoice' }));
      expect(await screen.findByText(/only 2 remain to invoice/i)).toBeInTheDocument();
      // picker stays open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Phase 5B FINAL — Close remaining', () => {
    const partlySO = () =>
      order({ id: 'so_1', status: 'confirmed', lineItems: [
        { id: 'sol-1', productId: 'p1', description: 'Chair', quantity: 10, unitPrice: 100, taxRateId: 'v', taxAmount: 150, lineTotal: 1000 },
      ], subtotal: 1000, taxTotal: 150, total: 1150 });
    const postedFor = (q: number) =>
      ({
        id: 'inv_p', invoiceNumber: 'INV-2026-0009', customerId: 'cust_1', salesOrderId: 'so_1',
        issueDate: '2026-09-15', dueDate: '2026-10-15',
        lineItems: [{ id: 'il', salesOrderLineId: 'sol-1', description: 'Chair', quantity: q, unitPrice: 100, taxAmount: 15 * q, lineTotal: 100 * q }],
        subtotal: 100 * q, taxTotal: 15 * q, total: 115 * q, amountPaid: 0, currency: 'ZAR', status: 'sent', createdAt: '', updatedAt: '',
      }) as import('@/types').Invoice;

    it('offers "Close remaining" for a partly-invoiced order and confirms the abandoned quantity/value', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [partlySO()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [postedFor(7)], refetch: vi.fn() } as never);
      renderAt();
      fireEvent.click(screen.getByRole('button', { name: 'Close remaining' }));
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText(/remaining 3 un-invoiced unit/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/No stock moves, no journal, no credit note/i)).toBeInTheDocument();
    });

    it('calls closeRemaining on confirm', async () => {
      const closeRemaining = vi.fn().mockResolvedValue({ ...partlySO(), status: 'closed' });
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [partlySO()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [postedFor(7)], refetch: vi.fn() } as never);
      vi.mocked(useSalesOrderMutations).mockReturnValue({
        isLoading: false, error: null, createSalesOrder: vi.fn(), updateSalesOrder: vi.fn(), deleteSalesOrder: vi.fn(),
        confirmOrder: vi.fn(), cancelOrder: vi.fn(), closeRemaining, convertToInvoice: vi.fn(),
        createInvoiceFromSalesOrder: vi.fn(), duplicateSalesOrder: vi.fn(),
      });
      renderAt();
      fireEvent.click(screen.getByRole('button', { name: 'Close remaining' }));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Close remaining' }));
      expect(closeRemaining).toHaveBeenCalledWith('so_1');
    });

    it('does NOT offer Close remaining when nothing is invoiced, and offers Cancel instead', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [partlySO()], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [], refetch: vi.fn() } as never);
      renderAt();
      expect(screen.queryByRole('button', { name: 'Close remaining' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    });

    it('a closed order shows the "Closed" badge and no invoice / cancel / close actions', () => {
      vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [{ ...partlySO(), status: 'closed' }], isLoading: false, error: null, refetch: vi.fn() });
      vi.mocked(useInvoices).mockReturnValue({ invoices: [postedFor(7)], refetch: vi.fn() } as never);
      renderAt();
      expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: /invoice/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close remaining' })).not.toBeInTheDocument();
    });
  });
});
