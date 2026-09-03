import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Account } from '@/types';
import { selectEnumOption, selectSearchableOption } from '../../../../tests/helpers/selectEnumOption';
import { AccountForm } from './AccountForm';

afterEach(cleanup);

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_x',
    code: '1000',
    name: 'Cash and Bank',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const chart: Account[] = [
  makeAccount({ id: 'acc_assets_parent', code: '1000', name: 'Current Assets', type: 'asset' }),
  makeAccount({ id: 'acc_assets_2', code: '1100', name: 'Accounts Receivable', type: 'asset' }),
  makeAccount({ id: 'acc_liab', code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit' }),
];

function renderForm(props: Partial<React.ComponentProps<typeof AccountForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <AccountForm accounts={chart} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />,
  );
  return { onSubmit };
}

describe('AccountForm — Vertex select migration', () => {
  it('renders master type / normal balance as EnumSelect and parent as SearchableSelect (no native <select>)', () => {
    const { container } = render(
      <AccountForm accounts={chart} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByLabelText('Master type')).toHaveAttribute('role', 'combobox');
    expect(screen.getByLabelText('Normal balance')).toHaveAttribute('role', 'combobox');
    expect(screen.getByLabelText(/parent account/i)).toHaveAttribute('role', 'combobox');
  });

  it('shows an existing account\'s type + normal balance as the selected values', () => {
    renderForm({ initialValues: makeAccount({ type: 'liability', normalBalance: 'credit' }) });
    expect(screen.getByLabelText('Master type')).toHaveTextContent('Liabilities');
    expect(screen.getByLabelText('Normal balance')).toHaveTextContent('Credit');
  });

  it('picking a master type re-defaults the normal balance and clears the parent', () => {
    renderForm();
    selectEnumOption('Master type', 'Liabilities');
    expect(screen.getByLabelText('Normal balance')).toHaveTextContent('Credit');
  });

  it('round-trips a parent GL account through the SearchableSelect and submits its id', async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText('Account code'), { target: { value: '1150' } });
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Petty Cash' } });
    selectSearchableOption(/parent account/i, 'Accounts Receivable');
    fireEvent.click(screen.getByRole('button', { name: /save account/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ parentAccountId: 'acc_assets_2', type: 'asset' });
  });

  it('only offers parent accounts of the currently-selected master type', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText(/parent account/i));
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels.some((l) => l?.includes('Accounts Receivable'))).toBe(true);
    expect(labels.some((l) => l?.includes('Accounts Payable'))).toBe(false);
  });
});
