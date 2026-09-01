import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountingPreview } from './AccountingPreview';
import type { AccountingEffectPreview } from '../types/accountingPreview';

function preview(overrides: Partial<AccountingEffectPreview> = {}): AccountingEffectPreview {
  return {
    lines: [
      { accountId: 'acc-INVENTORY_ADJUSTMENT', debit: 800, credit: 0, source: 'Write-off — Widget' },
      { accountId: 'acc-INVENTORY', debit: 0, credit: 800, source: 'Write-off — Widget' },
    ],
    balanced: true,
    ...overrides,
  };
}

describe('AccountingPreview', () => {
  it('renders every line with its account, debit/credit and source, plus a totals row', () => {
    render(<AccountingPreview preview={preview()} resolveAccountLabel={(id) => `${id} label`} />);
    expect(screen.getByText('acc-INVENTORY_ADJUSTMENT label')).toBeInTheDocument();
    expect(screen.getByText('acc-INVENTORY label')).toBeInTheDocument();
    expect(screen.getAllByText('Write-off — Widget')).toHaveLength(2);
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('falls back to the raw account id when no label resolver is given', () => {
    render(<AccountingPreview preview={preview()} />);
    expect(screen.getByText('acc-INVENTORY')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(<AccountingPreview preview={null} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the error message verbatim, not a generic fallback', () => {
    render(<AccountingPreview preview={null} error="Account mapping missing for category Widgets" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Account mapping missing for category Widgets');
  });

  it('renders nothing before a preview has been requested', () => {
    const { container } = render(<AccountingPreview preview={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a "No GL impact" empty state for a GL-neutral preview (e.g. an immediate transfer)', () => {
    render(<AccountingPreview preview={{ lines: [], balanced: true }} />);
    expect(screen.getByText('No GL impact')).toBeInTheDocument();
    expect(screen.getByText(/does not post a journal entry/i)).toBeInTheDocument();
  });

  it('surfaces an unbalanced preview as a visible warning, never silently', () => {
    render(
      <AccountingPreview
        preview={preview({ lines: [{ accountId: 'acc-X', debit: 100, credit: 0, source: 'x' }], balanced: false })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/unbalanced/i);
  });
});
