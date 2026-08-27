import { describe, expect, it } from 'vitest';
import { detectGroupMatches } from './groupMatching';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  const merged: InvestigationCandidate = { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 100000, ...overrides };
  return { ...merged, bankTransactionId: merged.bankTransactionId ?? merged.id };
}

describe('detectGroupMatches', () => {
  it('matches one bank deposit to several customer receipts (one-to-many)', () => {
    // R10,000 deposit = R4,000 + R3,500 + R2,500 receipts.
    const bank = [candidate({ id: 'deposit', side: 'bank', amountCents: 1000000, date: '2026-08-10' })];
    const books = [
      candidate({ id: 'r1', side: 'books', amountCents: 400000, date: '2026-08-10', description: 'Receipt 1' }),
      candidate({ id: 'r2', side: 'books', amountCents: 350000, date: '2026-08-10', description: 'Receipt 2' }),
      candidate({ id: 'r3', side: 'books', amountCents: 250000, date: '2026-08-10', description: 'Receipt 3' }),
    ];

    const issues = detectGroupMatches(bank, books);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('grouped_match');
    expect(issues[0].relatedBankTransactionIds).toEqual(expect.arrayContaining(['deposit', 'r1', 'r2', 'r3']));
  });

  it('matches several bank debit-order instalments to one supplier bill payment (many-to-one)', () => {
    const bank = [
      candidate({ id: 'i1', side: 'bank', amountCents: -50000, date: '2026-08-01', description: 'Instalment 1' }),
      candidate({ id: 'i2', side: 'bank', amountCents: -50000, date: '2026-08-02', description: 'Instalment 2' }),
    ];
    const books = [candidate({ id: 'bill', side: 'books', amountCents: -100000, date: '2026-08-01', description: 'Bill payment' })];

    const issues = detectGroupMatches(bank, books);

    expect(issues).toHaveLength(1);
    expect(issues[0].relatedBankTransactionIds).toEqual(expect.arrayContaining(['i1', 'i2', 'bill']));
  });
});
