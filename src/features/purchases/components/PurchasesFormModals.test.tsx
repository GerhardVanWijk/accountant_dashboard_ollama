import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { Supplier } from '@/types';
import { BillFormModal } from './BillFormModal';
import { PurchaseOrderFormModal } from './PurchaseOrderFormModal';
import { PaymentFormModal } from './PaymentFormModal';

function supplier(): Supplier {
  return {
    id: 'sup_1',
    supplierNumber: 'SUP-0001',
    name: 'Highveld Steel',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function shell() {
  return document.querySelector('[data-slot="form-shell"]') as HTMLElement;
}

describe('Purchases FormModal layer (P3E — Purchases gains a shared shell)', () => {
  it('BillFormModal opens in the shared shell with a header and anchored footer', () => {
    render(
      <BillFormModal suppliers={[supplier()]} defaultBillNumber="BILL-0002" onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(shell()).toBeInTheDocument();
    expect(shell().className).toContain('sm:max-w-[72rem]'); // size="lg" — shared business-document width
    expect(screen.getByRole('heading', { name: 'New bill' })).toBeInTheDocument();
    // footer button sits outside the scroll region
    const save = screen.getByRole('button', { name: 'Create Bill' });
    expect(save.closest('[data-slot="form-footer"]')).not.toBeNull();
    expect(save.closest('[data-slot="form-body"]')).toBeNull();
  });

  it('the Supplier Payment modal uses the narrower "md" width (document-width audit — no line-item grid, so 72rem was dead space)', () => {
    render(
      <PaymentFormModal
        suppliers={[supplier()]}
        outstandingBills={[]}
        defaultPaymentNumber="PAY-0002"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(shell().className).toContain('sm:max-w-2xl'); // size="md" — 42rem
    expect(shell().className).not.toContain('sm:max-w-[72rem]');
  });

  it('a clean modal closes without a discard prompt; an edited one prompts', () => {
    const onClose = vi.fn();
    render(
      <PurchaseOrderFormModal suppliers={[supplier()]} defaultPoNumber="PO-0002" onSubmit={vi.fn()} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
  });

  it('a purchase-order modal prompts once a field is edited', () => {
    const onClose = vi.fn();
    render(
      <PurchaseOrderFormModal suppliers={[supplier()]} defaultPoNumber="PO-0002" onSubmit={vi.fn()} onClose={onClose} />,
    );

    fireEvent.input(screen.getByLabelText('PO Number'), { target: { value: 'PO-9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
