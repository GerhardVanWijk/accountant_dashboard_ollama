import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Customer } from '@/types';
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

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <CreditNoteForm
      customers={[customer()]}
      invoices={[]}
      defaultCreditNoteNumber="CN-0002"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
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
