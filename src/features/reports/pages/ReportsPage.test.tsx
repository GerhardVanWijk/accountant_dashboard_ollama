import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from './ReportsPage';

/**
 * The Report Library is a pure navigation page — no data fetching, no
 * loading/error states of its own — so its test only needs to confirm
 * every real report is linked and no favourites/scheduling UI (not backed
 * by any real persistence) was fabricated.
 */
describe('ReportsPage', () => {
  it('links to every real report, grouped by category', () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();

    const expectedLinks: Array<[string, string]> = [
      ['Income Statement', '/reports/income-statement'],
      ['Balance Sheet', '/reports/balance-sheet'],
      ['Cash Flow Statement', '/reports/cash-flow'],
      ['Trial Balance', '/accounting/trial-balance'],
      ['General Ledger', '/accounting/ledger'],
      ['Accounts Receivable Aging', '/reports/customer-aging'],
      ['Accounts Payable Aging', '/reports/supplier-aging'],
      ['VAT Report', '/tax/vat-return'],
    ];

    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
    }
  });

  it('does not fabricate favourites, scheduling, or last-run history', () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/favourite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last run/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scheduled/i)).not.toBeInTheDocument();
  });
});
