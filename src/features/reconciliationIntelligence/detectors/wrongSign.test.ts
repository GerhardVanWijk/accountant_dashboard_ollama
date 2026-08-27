import { describe, expect, it } from 'vitest';
import { detectWrongSign } from './wrongSign';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 50000, ...overrides };
}

describe('detectWrongSign', () => {
  it('flags a +R500 vs -R500 pair as a likely debit/credit reversal with double the effect', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 50000, date: '2026-08-14' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: -50000, date: '2026-08-14' })];

    const issues = detectWrongSign(bank, books);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('wrong_sign');
    expect(Math.round(issues[0].effectAmount * 100)).toBe(100000);
  });

  it('does not flag two same-sign entries', () => {
    const bank = [candidate({ id: 'b1', amountCents: 50000 })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 50000 })];

    expect(detectWrongSign(bank, books)).toHaveLength(0);
  });
});
