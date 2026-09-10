import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { Account, TaxRate } from '@/types';
import type { AllocationInput } from '../services';
import { AllocationRows } from './AllocationRows';

afterEach(cleanup);

const glAccounts: Account[] = [
  { id: 'gl_6100', code: '6100', name: 'Office Expenses', type: 'expense', normalBalance: 'debit', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'gl_4000', code: '4000', name: 'Sales', type: 'revenue', normalBalance: 'credit', isActive: true, createdAt: '', updatedAt: '' },
];

const taxRates: TaxRate[] = [
  {
    id: 'tax_std',
    code: 'STD',
    name: 'Standard 15%',
    rate: 15,
    treatment: 'standard_rated',
    appliesTo: 'both',
    isActive: true,
    effectiveFrom: '2018-04-01',
    jurisdiction: 'ZA',
    sourceReference: 'test',
    createdAt: '',
    updatedAt: '',
  },
];

function row(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return { glAccountId: '', description: '', netAmount: 0, taxRateId: undefined, ...overrides };
}

function renderRows(allocations: AllocationInput[], grossAmount: number, onChange = vi.fn()) {
  render(
    <AllocationRows
      allocations={allocations}
      onChange={onChange}
      glAccounts={glAccounts}
      taxRates={taxRates}
      grossAmount={grossAmount}
    />,
  );
  return onChange;
}

function summary() {
  return screen.getByText('Transaction amount').closest('div')!.parentElement as HTMLElement;
}

describe('AllocationRows', () => {
  it('uses the "Allocation" heading and "Add allocation" action', () => {
    renderRows([row()], 0);
    expect(screen.getByRole('heading', { name: 'Allocation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add allocation' })).toBeInTheDocument();
  });

  it('adds and removes allocation lines through onChange', () => {
    const onChange = renderRows([row({ netAmount: 100 })], 100);

    fireEvent.click(screen.getByRole('button', { name: 'Add allocation' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ netAmount: 100 }), expect.objectContaining({ netAmount: 0 })]);

    cleanup();
    const onChange2 = renderRows([row({ netAmount: 100 }), row({ netAmount: 25 })], 125);
    fireEvent.click(screen.getByRole('button', { name: 'Remove allocation line 2' }));
    expect(onChange2).toHaveBeenLastCalledWith([expect.objectContaining({ netAmount: 100 })]);
  });

  it('shows a balanced state when allocations equal the transaction amount', () => {
    renderRows([row({ glAccountId: 'gl_6100', netAmount: 5000 })], 5000);
    expect(within(summary()).getByText('Balanced')).toBeInTheDocument();
    expect(within(summary()).queryByText(/needs allocation/)).not.toBeInTheDocument();
  });

  it('shows the shortfall when under-allocated', () => {
    renderRows([row({ glAccountId: 'gl_6100', netAmount: 4500 })], 5000);
    expect(within(summary()).getByText('R 500,00 still needs allocation')).toBeInTheDocument();
  });

  it('shows the excess when over-allocated', () => {
    renderRows([row({ glAccountId: 'gl_6100', netAmount: 5250 })], 5000);
    expect(within(summary()).getByText('R 250,00 over-allocated')).toBeInTheDocument();
  });

  it('folds per-line VAT into the allocated total', () => {
    // 4000 net + 15% VAT = 4600 -> balances a 4600 transaction.
    renderRows([row({ glAccountId: 'gl_6100', netAmount: 4000, taxRateId: 'tax_std' })], 4600);
    expect(within(summary()).getByText('Balanced')).toBeInTheDocument();
  });
});
