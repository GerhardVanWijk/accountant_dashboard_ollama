import { describe, expect, it } from 'vitest';
import { detectRounding } from './rounding';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  const merged: InvestigationCandidate = { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 3, ...overrides };
  return { ...merged, bankTransactionId: merged.bankTransactionId ?? merged.id };
}

describe('detectRounding', () => {
  it('finds accumulated rounding across several tiny entries that exactly equals R0.16', () => {
    // Invoice 1021: +R0.03, Invoice 1054: +R0.05, Bank fee 481: +R0.08 -> R0.16.
    const pool = [
      candidate({ id: 'inv1021', amountCents: 3, description: 'Invoice 1021' }),
      candidate({ id: 'inv1054', amountCents: 5, description: 'Invoice 1054' }),
      candidate({ id: 'fee481', amountCents: 8, description: 'Bank fee 481' }),
      candidate({ id: 'noise', amountCents: 5000, description: 'Unrelated large item' }),
    ];

    const issues = detectRounding(pool, 16);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('rounding_variance');
    expect(Math.round(issues[0].effectAmount * 100)).toBe(16);
    expect(issues[0].relatedBankTransactionIds).toEqual(expect.arrayContaining(['inv1021', 'inv1054', 'fee481']));

    const data = issues[0].evidenceData!;
    expect(data.detectorType).toBe('rounding_variance');
    expect(data.explainsVarianceExactly).toBe(true);
    expect(data.combinationTotalCents).toBe(16);
    expect(data.combinationTerms).toHaveLength(3);
  });

  it('is not triggered when the unexplained amount itself is large', () => {
    const pool = [candidate({ id: 'a', amountCents: 3 })];
    expect(detectRounding(pool, 50000)).toEqual([]);
  });
});
