import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Input } from '@/components/ui/shadcn/input';
import { FormGrid, FormField, CheckboxField } from './FormGrid';
import { FormPageLayout } from './FormPageLayout';

describe('FormGrid', () => {
  it('is a 1 → sm:2 responsive grid by default', () => {
    render(
      <FormGrid>
        <div>a</div>
      </FormGrid>,
    );
    const grid = document.querySelector('[data-slot="form-grid"]')!;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).not.toContain('lg:grid-cols-3');
  });

  it('columns={3} adds the large-screen third column for dense short-field rows', () => {
    render(
      <FormGrid columns={3}>
        <div>a</div>
      </FormGrid>,
    );
    expect(document.querySelector('[data-slot="form-grid"]')!.className).toContain('lg:grid-cols-3');
  });

  it('columns={1} never splits', () => {
    render(
      <FormGrid columns={1}>
        <div>a</div>
      </FormGrid>,
    );
    const grid = document.querySelector('[data-slot="form-grid"]')!;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).not.toContain('sm:grid-cols-2');
  });
});

describe('FormField', () => {
  it('wires the label to the control and renders the required marker + hint', () => {
    render(
      <FormField label="Customer name" htmlFor="name" required hint="As it appears on invoices">
        <Input id="name" />
      </FormField>,
    );
    expect(screen.getByLabelText('Customer name', { exact: false })).toBe(screen.getByRole('textbox'));
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
    expect(screen.getByText('As it appears on invoices')).toBeInTheDocument();
  });

  it('renders a single field error below the control', () => {
    render(
      <FormField label="Email" htmlFor="email" error={{ message: 'Enter a valid email' }}>
        <Input id="email" />
      </FormField>,
    );
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
  });

  it('span="full" makes the field span every column', () => {
    render(
      <FormField label="Notes" htmlFor="notes" span="full">
        <Input id="notes" />
      </FormField>,
    );
    expect(document.querySelector('[data-slot="form-field"]')!.className).toContain('col-span-full');
  });
});

describe('CheckboxField', () => {
  it('is a horizontal checkbox + label row and reports boolean changes', () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckboxField
        id="active"
        checked={false}
        onCheckedChange={onCheckedChange}
        label="Active"
        description="Inactive customers are hidden from pickers"
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Active' });
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Inactive customers are hidden from pickers')).toBeInTheDocument();
  });
});

describe('FormPageLayout', () => {
  it('centers the form in a max-w-4xl column for a standard entity form', () => {
    render(
      <MemoryRouter>
        <FormPageLayout title="Add supplier" description="Create a vendor">
          <div>form</div>
        </FormPageLayout>
      </MemoryRouter>,
    );
    const root = document.querySelector('[data-slot="form-page-layout"]')!;
    expect(root.className).toContain('mx-auto');
    expect(root.className).toContain('max-w-4xl');
  });

  it('size="document" widens to max-w-6xl for a line-item form', () => {
    render(
      <MemoryRouter>
        <FormPageLayout title="New invoice" size="document">
          <div>form</div>
        </FormPageLayout>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-slot="form-page-layout"]')!.className).toContain('max-w-6xl');
  });

  it('renders a back link when backTo is set', () => {
    render(
      <MemoryRouter>
        <FormPageLayout title="Create delivery" backTo="/sales/orders/1" backLabel="Back to order">
          <div>form</div>
        </FormPageLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Back to order' })).toHaveAttribute('href', '/sales/orders/1');
  });
});
