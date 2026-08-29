import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { CustomerFormValues } from '../utils/customerFormSchema';
import { CustomerFormModal } from './CustomerFormModal';

const defaults: CustomerFormValues = {
  customerNumber: 'CUS-0001',
  name: 'Acme Traders',
  email: '',
  phone: '',
  status: 'active',
  notes: '',
  contacts: [],
  billingAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
  shippingAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
  shippingSameAsBilling: true,
  taxNumber: '',
  taxStatus: 'taxable',
  currency: 'ZAR',
  paymentTerms: 'Net30',
  creditLimit: 0,
  defaultDiscountPercent: 0,
  creditHold: false,
};

function shell() {
  return document.querySelector('[data-slot="form-shell"]') as HTMLElement;
}

describe('CustomerFormModal (P3D migration — flagship tab-resize fix)', () => {
  it('keeps one stable surface size across all four tabs', () => {
    render(
      <CustomerFormModal title="Edit Acme Traders" mode="edit" defaultValues={defaults} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    const sizeClass = shell().className;

    for (const tab of ['Contacts', 'Billing & shipping', 'Financial settings', 'General info']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(shell().className).toBe(sizeClass);
      expect(shell().style.height).toBe('');
    }
  });

  it('the footer Save button stays mounted on every tab', () => {
    render(
      <CustomerFormModal title="New customer" mode="create" defaultValues={defaults} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Financial settings' }));
    expect(screen.getByRole('button', { name: 'Create customer' })).toBeInTheDocument();
  });

  it('prompts before closing once a field has been edited', () => {
    const onClose = vi.fn();
    render(
      <CustomerFormModal title="Edit Acme Traders" mode="edit" defaultValues={defaults} onSubmit={vi.fn()} onClose={onClose} />,
    );

    // clean → closes straight away is covered in FormShell.test; here: make it dirty
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Acme Traders (Pty) Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a clean form closes with no prompt', () => {
    const onClose = vi.fn();
    render(
      <CustomerFormModal title="Edit Acme Traders" mode="edit" defaultValues={defaults} onSubmit={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
