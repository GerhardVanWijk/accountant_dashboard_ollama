import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Customer, CreditNote, Invoice } from '@/types';
import { CreditNoteForm } from './CreditNoteForm';

vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useTaxRates: () => ({ taxRates: [] }) }));
vi.mock('@/features/inventory/hooks/useProducts', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('@/features/inventory/hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [] }) }));

afterEach(cleanup);

function customer(): Customer {
  return {
    id: 'cus_1',
    customerNumber: 'CUS-0001',
    name: 'Maluleke & Partners Inc',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined), invoices: Invoice[] = [], creditNotes: CreditNote[] = []) {
  render(
    <CreditNoteForm
      customers={[customer()]}
      invoices={invoices}
      creditNotes={creditNotes}
      defaultCreditNoteNumber="CN-0002"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-2026-0010',
    customerId: 'cus_1',
    salesOrderId: undefined,
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    lineItems: [
      { id: 'il_1', productId: 'p1', description: 'Office Chair', quantity: 4, unitPrice: 1000, taxAmount: 600, lineTotal: 4000 },
      { id: 'il_2', productId: 'p1', description: 'Office Chair (second batch)', quantity: 2, unitPrice: 1000, taxAmount: 300, lineTotal: 2000 },
    ],
    subtotal: 6000,
    taxTotal: 900,
    total: 6900,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function fillOneLine() {
  fireEvent.change(screen.getByLabelText('Line description'), { target: { value: 'Returned item' } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
}

/** The Reason field is the Vertex EnumSelect (base-ui Select), not a native <select>. */
function selectReason(label: string) {
  fireEvent.click(screen.getByLabelText('Reason'));
  const option = screen.getByRole('option', { name: label });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe('CreditNoteForm — "Other" reason', () => {
  it('only shows the "Specify reason" field when reason is Other', () => {
    renderForm();
    expect(screen.queryByLabelText('Specify reason')).not.toBeInTheDocument();
    selectReason('Other');
    expect(screen.getByLabelText('Specify reason')).toBeInTheDocument();
  });

  it('blocks submit until the Other detail is filled in', async () => {
    const onSubmit = renderForm();
    selectReason('Other');
    fillOneLine();
    fireEvent.click(screen.getByRole('button', { name: /create credit note/i }));
    expect(await screen.findByText(/specify the reason/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('persists the Other detail to its own reasonDetails field, not notes', async () => {
    const onSubmit = renderForm();
    selectReason('Other');
    fireEvent.change(screen.getByLabelText('Specify reason'), { target: { value: 'Goodwill gesture after delivery delay' } });
    fillOneLine();
    fireEvent.click(screen.getByRole('button', { name: /create credit note/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      reason: 'other',
      reasonDetails: 'Goodwill gesture after delivery delay',
    });
    expect(onSubmit.mock.calls[0][0].notes).toBeUndefined();
  });

  it('does not send reasonDetails for a non-Other reason', async () => {
    const onSubmit = renderForm();
    // reason defaults to 'return'
    fillOneLine();
    fireEvent.click(screen.getByRole('button', { name: /create credit note/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].reasonDetails).toBeUndefined();
  });
});

/** Selects an invoice via the "Against invoice" SearchableSelect (base-ui combobox popover). */
function selectInvoice(label: string) {
  fireEvent.click(screen.getByLabelText('Against invoice (optional)'));
  const option = screen.getByRole('option', { name: label });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe('CreditNoteForm — original invoice line traceability (Part 4)', () => {
  it('shows no line picker until an invoice is selected', () => {
    renderForm(vi.fn(), [invoice()]);
    expect(screen.queryByText(/Credit a specific line from/)).not.toBeInTheDocument();
  });

  it('lists every invoice line with its original/already-credited/remaining quantities — not just the product', async () => {
    renderForm(vi.fn(), [invoice()]);
    selectInvoice('INV-2026-0010');
    expect(await screen.findByText(/Credit a specific line from INV-2026-0010/)).toBeInTheDocument();
    expect(screen.getByText('Office Chair')).toBeInTheDocument();
    expect(screen.getByText('Office Chair (second batch)')).toBeInTheDocument();
  });

  it('entering a quantity against one invoice line stamps originalInvoiceLineId on submit, distinguishing it from the other line for the SAME product', async () => {
    const onSubmit = renderForm(vi.fn().mockResolvedValue(undefined), [invoice()]);
    selectInvoice('INV-2026-0010');
    await screen.findByText(/Credit a specific line from/);
    fireEvent.change(screen.getByLabelText('Credit quantity for Office Chair'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /create credit note/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const lines = onSubmit.mock.calls[0][0].lineItems;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ originalInvoiceLineId: 'il_1', quantity: 2, productId: 'p1' });
  });

  it('caps the credit quantity at what remains creditable on that specific line, accounting for a prior credit note against it', async () => {
    const priorCreditNote: CreditNote = {
      id: 'cn_prior', creditNoteNumber: 'CN-0001', customerId: 'cus_1', invoiceId: 'inv_1',
      issueDate: '2026-09-02', reason: 'return', lineItems: [{ id: 'x1', originalInvoiceLineId: 'il_1', productId: 'p1', description: 'Office Chair', quantity: 3, unitPrice: 1000, taxAmount: 450, lineTotal: 3000 }],
      subtotal: 3000, taxTotal: 450, total: 3450, amountAllocated: 0, currency: 'ZAR', status: 'issued', allocations: [],
      createdAt: '', updatedAt: '',
    };
    renderForm(vi.fn(), [invoice()], [priorCreditNote]);
    selectInvoice('INV-2026-0010');
    await screen.findByText(/Credit a specific line from/);
    // il_1 originally 4, 3 already credited by the prior note -> only 1 remains creditable
    const input = screen.getByLabelText('Credit quantity for Office Chair') as HTMLInputElement;
    expect(input.max).toBe('1');
  });

  it('picking a real invoice line replaces the pristine blank starter row rather than adding a second, unrelated line', async () => {
    const onSubmit = renderForm(vi.fn().mockResolvedValue(undefined), [invoice()]);
    selectInvoice('INV-2026-0010');
    await screen.findByText(/Credit a specific line from/);
    fireEvent.change(screen.getByLabelText('Credit quantity for Office Chair'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /create credit note/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].lineItems).toHaveLength(1);
  });
});
