import { describe, expect, it } from 'vitest';
import { classifyMatches } from './matching';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return {
    id: 'c1',
    side: 'bank',
    kind: 'bank_transaction',
    date: '2026-08-14',
    description: 'Test',
    amountCents: 10000,
    ...overrides,
  };
}

describe('classifyMatches', () => {
  it('confirms an exact bank/ledger match — same amount, same date, matching reference', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 10000, date: '2026-08-14', reference: 'INV-1', description: 'Payment' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 10000, date: '2026-08-14', reference: 'INV-1', description: 'Payment' })];

    const result = classifyMatches(bank, books);

    expect(result.confirmed).toHaveLength(1);
    expect(result.probable).toHaveLength(0);
    expect(result.unmatchedBank).toHaveLength(0);
    expect(result.unmatchedBooks).toHaveLength(0);
  });

  it('classifies a same-amount, different-date pair as probable (date-offset timing)', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 5000, date: '2026-08-15' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 5000, date: '2026-08-14' })];

    const result = classifyMatches(bank, books);

    expect(result.confirmed).toHaveLength(0);
    expect(result.probable).toHaveLength(1);
    expect(result.probable[0].daysApart).toBe(1);
  });

  it('leaves an item with no matching amount unmatched on both sides', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 10000 })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 9999 })];

    const result = classifyMatches(bank, books);

    expect(result.unmatchedBank.map((c) => c.id)).toEqual(['b1']);
    expect(result.unmatchedBooks.map((c) => c.id)).toEqual(['k1']);
  });

  it('does not match across the date tolerance window', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 5000, date: '2026-08-30' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 5000, date: '2026-08-01' })];

    const result = classifyMatches(bank, books, 7);

    expect(result.confirmed).toHaveLength(0);
    expect(result.probable).toHaveLength(0);
    expect(result.unmatchedBank).toHaveLength(1);
    expect(result.unmatchedBooks).toHaveLength(1);
  });
});
