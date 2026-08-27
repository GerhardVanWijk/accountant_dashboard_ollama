import { describe, expect, it } from 'vitest';
import { detectWrongBankAccount } from './wrongBankAccount';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return { id: 'c1', side: 'books', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 75000, ...overrides };
}

describe('detectWrongBankAccount', () => {
  it('finds a matching item on another account\'s bank statement for an unexplained books entry', () => {
    const booksOnThisAccount = [candidate({ id: 'k1', date: '2026-08-14', description: 'Supplier payment' })];
    const otherAccounts = [
      {
        bankAccountId: 'acc_savings',
        bankAccountName: 'Savings Account',
        candidates: [candidate({ id: 'b1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', amountCents: 75000 })],
      },
    ];

    const issues = detectWrongBankAccount(booksOnThisAccount, otherAccounts);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('wrong_bank_account');
    expect(issues[0].explanation).toContain('Savings Account');
  });

  it('finds nothing when no other account has a matching item', () => {
    const booksOnThisAccount = [candidate({ id: 'k1', amountCents: 75000 })];
    const otherAccounts = [{ bankAccountId: 'acc_savings', bankAccountName: 'Savings Account', candidates: [] }];

    expect(detectWrongBankAccount(booksOnThisAccount, otherAccounts)).toHaveLength(0);
  });
});
