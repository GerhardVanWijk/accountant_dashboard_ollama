import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Bill, Supplier } from '@/types';
import { PaymentForm } from './PaymentForm';

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup_1',
    supplierNumber: 'SUP-0001',
    name: 'Highveld Steel',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill_1',
    billNumber: 'BILL-0001',
    supplierId: 'sup_1',
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * The "Record Payment" wiring from BillDetail (docs/KNOWN_ISSUES.md) opens
 * this same real form pre-aimed at one bill via `presetBillId` — this is
 * the new behavior that makes that possible.
 */
describe('PaymentForm presetBillId', () => {
  it('pre-selects the supplier, amount, and a single allocation for the preset bill', () => {
    const suppliers = [makeSupplier(), makeSupplier({ id: 'sup_2', name: 'Other Supplier' })];
    const bills = [makeBill({ amountPaid: 150 })]; // outstanding = 1000

    render(
      <PaymentForm
        suppliers={suppliers}
        outstandingBills={bills}
        defaultPaymentNumber="PAY-0001"
        presetBillId="bill_1"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Supplier picker is now the shared SupplierCombobox — its trigger shows the name.
    expect(screen.getByRole('combobox', { name: /supplier/i })).toHaveTextContent('Highveld Steel');
    expect(screen.getByLabelText(/payment amount/i)).toHaveValue(1000);
  });

  it('still submits the preset allocation without further user input', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const bills = [makeBill({ amountPaid: 0 })];

    render(
      <PaymentForm
        suppliers={[makeSupplier()]}
        outstandingBills={bills}
        defaultPaymentNumber="PAY-0001"
        presetBillId="bill_1"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'sup_1',
        amount: 1150,
        allocations: [{ billId: 'bill_1', amount: 1150 }],
      }),
    );
  });

  it('leaves the form at its normal defaults when no preset is given', () => {
    render(
      <PaymentForm
        suppliers={[makeSupplier()]}
        outstandingBills={[makeBill()]}
        defaultPaymentNumber="PAY-0001"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/payment amount/i)).toHaveValue(null);
  });
});
