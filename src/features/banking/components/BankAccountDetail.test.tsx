import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { BankAccount } from '@/types';
import { formatCurrency } from '@/lib/app/format';
import { BankAccountDetail } from './BankAccountDetail';

afterEach(cleanup);

/**
 * `formatCurrency` groups digits with non-breaking / narrow spaces, so exact
 * string matching against `getByText` is brittle — compare with all
 * whitespace stripped instead.
 */
const isMoney = (value: number) => {
  const want = formatCurrency(value).replace(/\s/g, '');
  return (content: string) => content.replace(/\s/g, '') === want;
};

function makeAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'ba_1',
    name: 'FNB Cheque',
    bankName: 'First National Bank',
    accountNumber: '62812341059',
    accountType: 'checking',
    currency: 'ZAR',
    openingBalance: 0,
    currentBalance: 313080.92,
    glAccountId: 'gl_1000',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('BankAccountDetail', () => {
  it('renders the balance as a full-width hero plus a 2-column metadata grid', () => {
    render(<BankAccountDetail account={makeAccount()} glAccountCode="1000" lastReconciledDate="2026-09-30" />);

    expect(screen.getByText('Current balance')).toBeInTheDocument();
    expect(screen.getByText(isMoney(313080.92))).toBeInTheDocument();
    expect(screen.getByText('••••1059')).toBeInTheDocument();
    expect(screen.getByText('ZAR')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // The old three-column figure strip is gone — no sm:grid-cols-3 anywhere.
    expect(document.querySelector('.sm\\:grid-cols-3')).toBeNull();
  });

  it('keeps large and negative balances readable without a neighbouring value beside them', () => {
    const { container } = render(
      <BankAccountDetail
        account={makeAccount({ currentBalance: -1250000000.5 })}
        glAccountCode={undefined}
        lastReconciledDate={undefined}
      />,
    );
    const hero = screen.getByText(isMoney(-1250000000.5));
    expect(hero).toBeInTheDocument();
    // Hero sits in its own full-width column, not a grid cell shared with the account number.
    expect(hero.closest('.grid')).toBeNull();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(container.textContent).toContain('—'); // ledger account falls back to an em dash
  });

  it('does not mask an already-short account number', () => {
    render(<BankAccountDetail account={makeAccount({ accountNumber: '1059' })} glAccountCode="1000" lastReconciledDate={undefined} />);
    expect(screen.getByText('1059')).toBeInTheDocument();
    expect(screen.queryByText('••••1059')).not.toBeInTheDocument();
  });
});
