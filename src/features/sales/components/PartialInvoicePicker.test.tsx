import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { Invoice, SalesOrder } from '@/types';
import { PartialInvoicePicker } from './PartialInvoicePicker';

afterEach(cleanup);

vi.mock('@/features/inventory/hooks/useProducts', () => ({
  useProducts: () => ({
    products: [
      { id: 'p1', sku: 'PRN-1', name: 'Printer', type: 'good', unitPrice: 2000, costPrice: 1200, trackInventory: true, quantityOnHand: 12, status: 'active', createdAt: '', updatedAt: '' },
    ],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('@/features/inventory/hooks/useWarehouses', () => ({
  useWarehouses: () => ({ warehouses: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/inventory/hooks/useStockCommitments', () => ({
  useStockCommitments: () => ({ commitments: new Map([['p1__wh_main', 3]]), loading: false, error: null, refetch: vi.fn() }),
}));

function so(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so_1',
    orderNumber: 'SO-2026-0001',
    customerId: 'c1',
    orderDate: '2026-09-01',
    lineItems: [
      { id: 'L1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 2000, taxRateId: 'v15', taxAmount: 3000, lineTotal: 20000 },
      { id: 'L2', description: 'Delivery', quantity: 1, unitPrice: 500, taxRateId: 'v15', taxAmount: 75, lineTotal: 500 },
    ],
    subtotal: 20500,
    taxTotal: 3075,
    total: 23575,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function postedInvoice(qty: number): Invoice {
  return {
    id: 'inv_prev', invoiceNumber: 'INV-2026-0001', customerId: 'c1', salesOrderId: 'so_1',
    issueDate: '2026-09-05', dueDate: '2026-10-05',
    lineItems: [{ id: 'il', salesOrderLineId: 'L1', description: 'Printer', quantity: qty, unitPrice: 2000, taxAmount: 300 * qty, lineTotal: 2000 * qty }],
    subtotal: 2000 * qty, taxTotal: 300 * qty, total: 2300 * qty, amountPaid: 0, currency: 'ZAR', status: 'sent', createdAt: '', updatedAt: '',
  };
}

function renderPicker(props: Partial<React.ComponentProps<typeof PartialInvoicePicker>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <PartialInvoicePicker
      open
      onClose={vi.fn()}
      order={so()}
      invoices={[]}
      customerName="Acme"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit };
}

describe('PartialInvoicePicker', () => {
  it('opens with every remaining line selected at its full remaining quantity', () => {
    renderPicker();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const qtyInputs = screen.getAllByRole('spinbutton');
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('10');
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('1');
    // footer total = 10*2000 + 1*500 + VAT (15%) = 23575
    expect(screen.getByText('Invoice total').parentElement?.textContent?.replace(/\s/g, '')).toContain('23575,00');
  });

  it('shows previously-invoiced quantity and reduces the remaining', () => {
    renderPicker({ invoices: [postedInvoice(4)] });
    // L1 row: Ordered 10, Invoiced 4, Remaining 6
    const l1Row = screen.getByText('Printer').closest('tr')!;
    expect(within(l1Row).getByText('4')).toBeInTheDocument();
    expect(within(l1Row).getByText('6')).toBeInTheDocument();
    expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement).value).toBe('6');
  });

  it('rejects a quantity above the remaining, blocking submit', () => {
    const { onSubmit } = renderPicker({ invoices: [postedInvoice(4)] });
    const l1Qty = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(l1Qty, { target: { value: '7' } });
    expect(screen.getByText(/Only 6 remain to invoice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft invoice' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lets the user reduce a quantity and deselect a line, then submits only the chosen selection', async () => {
    const { onSubmit } = renderPicker();
    const [l1Qty] = screen.getAllByRole('spinbutton');
    fireEvent.change(l1Qty, { target: { value: '2' } });
    // deselect the delivery line
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Create draft invoice' }));
    expect(onSubmit).toHaveBeenCalledWith([{ salesOrderLineId: 'L1', quantity: 2 }]);
  });

  it('"Invoice all remaining" resets every line to its full remaining quantity', () => {
    renderPicker();
    const [l1Qty] = screen.getAllByRole('spinbutton');
    fireEvent.change(l1Qty, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invoice all remaining' }));
    expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement).value).toBe('10');
  });

  it('a fully-invoiced line is shown as such and cannot be selected', () => {
    renderPicker({ invoices: [postedInvoice(10)] });
    const l1Row = screen.getByText('Printer').closest('tr')!;
    expect(within(l1Row).getByText('Fully invoiced')).toBeInTheDocument();
    expect(within(l1Row).getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('surfaces a server error', () => {
    renderPicker({ error: 'Only 2 remain to invoice.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Only 2 remain to invoice.');
  });

  it('shows the draft disclaimer', () => {
    renderPicker();
    expect(screen.getByText(/creates a/i)).toHaveTextContent(/draft/i);
  });

  it('shows per-product stock context (on hand / committed / available)', () => {
    renderPicker();
    expect(screen.getByText(/On hand 12 · Committed 3 · Available 9/)).toBeInTheDocument();
  });
});
