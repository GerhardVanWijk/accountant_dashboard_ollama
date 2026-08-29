import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Button } from '@/components/ui/shadcn/button';
import { FormFooter } from './FormFooter';
import { FormError, RequiredMark } from './FormError';
import { FormSection, FormEmptyState } from './FormBody';
import { ConfirmDialog } from './ConfirmDialog';

describe('FormFooter', () => {
  it('renders a server error as an alert above the actions', () => {
    render(
      <FormFooter error="Could not save customer.">
        <Button type="submit">Save</Button>
      </FormFooter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save customer.');
  });

  it('keeps the destructive action separate (left) from the primary action', () => {
    render(
      <FormFooter destructiveAction={<Button variant="destructive">Delete</Button>}>
        <Button variant="outline">Cancel</Button>
        <Button type="submit">Save</Button>
      </FormFooter>,
    );
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toHaveClass('text-destructive');
    expect(del.parentElement?.className).toContain('sm:mr-auto');
  });
});

describe('FormError / RequiredMark', () => {
  it('FormError is a dark-mode-safe alert', () => {
    render(<FormError>Something went wrong</FormError>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert.className).toContain('text-destructive');
  });

  it('FormError renders nothing when empty', () => {
    const { container } = render(<FormError>{null}</FormError>);
    expect(container).toBeEmptyDOMElement();
  });

  it('RequiredMark carries a screen-reader word, not colour alone', () => {
    render(<RequiredMark />);
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });
});

describe('FormSection', () => {
  it('is a real fieldset/legend', () => {
    render(
      <FormSection title="Billing address">
        <input aria-label="Line 1" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'Billing address' })).toBeInstanceOf(HTMLFieldSetElement);
  });
});

describe('FormEmptyState', () => {
  it('shows a title and description', () => {
    render(<FormEmptyState title="Not found" description="This record could not be loaded." />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.getByText('This record could not be loaded.')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('runs onConfirm and supports destructive styling', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete role?"
        description="This cannot be undone."
        confirmLabel="Delete role"
        destructive
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete role' });
    expect(confirm).toHaveClass('text-destructive');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while pending', () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Confirm" pending onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
