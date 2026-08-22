import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Customer, Invoice } from '@/types';
import { CustomerReceiptForm } from './CustomerReceiptForm';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_1',
    customerNumber: 'CUST-0001',
    name: 'Acme Traders',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    customerId: 'cust_1',
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * The "Record Payment" wiring from InvoiceDetail (docs/KNOWN_ISSUES.md)
 * opens this same real form pre-aimed at one invoice via `presetInvoiceId`
 * — this is the new behavior that makes that possible.
 */
describe('CustomerReceiptForm presetInvoiceId', () => {
  it('pre-selects the customer, amount, and a single allocation for the preset invoice', () => {
    const customers = [makeCustomer(), makeCustomer({ id: 'cust_2', name: 'Other Customer' })];
    const invoices = [makeInvoice({ amountPaid: 200 })]; // outstanding = 950

    render(
      <CustomerReceiptForm
        customers={customers}
        invoices={invoices}
        defaultReceiptNumber="RCT-0001"
        presetInvoiceId="inv_1"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/customer/i)).toHaveValue('cust_1');
    expect(screen.getByLabelText(/amount received/i)).toHaveValue(950);
    expect(screen.getByText(/INV-0001.*outstanding.*950/i)).toBeInTheDocument();
  });

  it('still submits the preset allocation without further user input', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const invoices = [makeInvoice({ amountPaid: 0 })];

    render(
      <CustomerReceiptForm
        customers={[makeCustomer()]}
        invoices={invoices}
        defaultReceiptNumber="RCT-0001"
        presetInvoiceId="inv_1"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust_1',
        amount: 1150,
        allocations: [{ invoiceId: 'inv_1', amount: 1150 }],
        unallocatedAmount: 0,
      }),
    );
  });

  it('leaves the form at its normal defaults when no preset is given', () => {
    render(
      <CustomerReceiptForm
        customers={[makeCustomer()]}
        invoices={[makeInvoice()]}
        defaultReceiptNumber="RCT-0001"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/amount received/i)).toHaveValue(null);
    expect(screen.getByText(/no allocations/i)).toBeInTheDocument();
  });
});
