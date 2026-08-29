import { describe, expect, it } from 'vitest';
import { detectCombinations } from './combinationSearch';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  const merged: InvestigationCandidate = { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 1000, ...overrides };
  return { ...merged, bankTransactionId: merged.bankTransactionId ?? merged.id };
}

describe('detectCombinations', () => {
  it('finds a pair of leftover entries that exactly explains the unexplained difference', () => {
    const pool = [
      candidate({ id: 'a', amountCents: 4722, description: 'Bank charge mismatch' }),
      candidate({ id: 'b', amountCents: 16, description: 'Rounding' }),
      candidate({ id: 'noise', amountCents: 99999, description: 'Unrelated' }),
    ];

    const issues = detectCombinations(pool, 4738);

    expect(issues.length).toBeGreaterThan(0);
    const twoItem = issues.find((i) => i.relatedBankTransactionIds.length === 2);
    expect(twoItem).toBeDefined();
  });

  it('finds a triple combination — missing deposit + bank charge mismatch + rounding — explaining R1,247.38', () => {
    const pool = [
      candidate({ id: 'deposit', amountCents: 120000, description: 'Missing deposit' }),
      candidate({ id: 'fee', amountCents: 4722, description: 'Bank charge mismatch' }),
      candidate({ id: 'round', amountCents: 16, description: 'Rounding' }),
      candidate({ id: 'noise', amountCents: 55555, description: 'Unrelated' }),
    ];

    const issues = detectCombinations(pool, 124738);

    const tripleMatch = issues.find((i) => i.relatedBankTransactionIds.length === 3);
    expect(tripleMatch).toBeDefined();
    expect(Math.round(tripleMatch!.effectAmount * 100)).toBe(124738);
  });

  it('returns nothing when the variance is already zero', () => {
    const pool = [candidate({ id: 'a', amountCents: 100 })];
    expect(detectCombinations(pool, 0)).toEqual([]);
  });

  it('the explanation shows the literal arithmetic — "R95.00 (...) + R310.40 (...) = R405.40"', () => {
    const pool = [
      candidate({ id: 'rental', amountCents: -9500, description: 'card machine rental fee', date: '2026-08-08' }),
      candidate({ id: 'sms', amountCents: -31040, description: 'SMS notification fee', date: '2026-08-09' }),
      candidate({ id: 'noise', amountCents: -12345, description: 'Unrelated' }),
    ];

    const [issue] = detectCombinations(pool, -40540);

    expect(issue.explanation).toContain('R95.00 (card machine rental fee, 2026-08-08)');
    expect(issue.explanation).toContain('R310.40 (SMS notification fee, 2026-08-09)');
    expect(issue.explanation).toContain('= R405.40');
    // and the terms are kept as structured data
    expect(issue.evidenceData?.combinationTerms).toEqual([
      { label: 'card machine rental fee, 2026-08-08', amountCents: -9500 },
      { label: 'SMS notification fee, 2026-08-09', amountCents: -31040 },
    ]);
    expect(issue.evidenceData?.combinationTotalCents).toBe(-40540);
    expect(issue.evidenceData?.explainsVarianceExactly).toBe(true);
  });
});
