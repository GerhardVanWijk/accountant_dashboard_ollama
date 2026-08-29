import { describe, expect, it } from 'vitest';
import { detectAmountMismatch, isDigitTransposition } from './amountMismatch';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return {
    id: 'c1',
    side: 'bank',
    kind: 'bank_transaction',
    date: '2026-08-14',
    description: 'Bank Charges',
    amountCents: 10000,
    ...overrides,
  };
}

describe('isDigitTransposition', () => {
  it('detects an adjacent digit swap — R1,254.30 vs R1,245.30', () => {
    expect(isDigitTransposition(125430, 124530)).toBe(true);
  });

  it('does not flag a difference that is not a transposition', () => {
    expect(isDigitTransposition(10000, 10016)).toBe(false);
  });
});

describe('detectAmountMismatch', () => {
  it('flags R0.16 discrepancy between bank fee and books entry — the worked example', () => {
    // Bank: BANK CHARGES R47.66. Books: Bank Charges R47.50.
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: -4766, date: '2026-08-14', description: 'BANK CHARGES', reference: 'FEE001' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: -4750, date: '2026-08-14', description: 'Bank Charges', reference: 'FEE001' })];

    const issues = detectAmountMismatch(bank, books, { targetUnexplainedCents: 16 });

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('amount_mismatch');
    expect(Math.round(Math.abs(issues[0].effectAmount) * 100)).toBe(16);
    expect(issues[0].confidence).toBeGreaterThanOrEqual(90);
    expect(issues[0].evidence.some((e) => e.label.includes('exactly equals the unexplained'))).toBe(true);

    // structured evidence, not just the prose sentence
    const data = issues[0].evidenceData!;
    expect(data.detectorType).toBe('amount_mismatch');
    expect(data.amountDifferenceCents).toBe(-16);
    expect(data.explainsVarianceExactly).toBe(true);
    expect(data.dateDifferenceDays).toBe(0);
    expect(data.candidateSourceId).toBe('k1');
    // the "explains whole variance" factor is present even when it were unmet — full scorecard
    expect(data.factors!.map((f) => f.key)).toContain('explains_whole_variance');
  });

  it('classifies a same-length transposed amount as transposition_error, not a generic mismatch', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 125430, date: '2026-08-10', description: 'Supplier payment', reference: 'PAY9' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 124530, date: '2026-08-10', description: 'Supplier payment', reference: 'PAY9' })];

    const issues = detectAmountMismatch(bank, books);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('transposition_error');
  });

  it('does not pair unrelated transactions with no plausibility signal', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 10000, date: '2026-08-01', description: 'ABC Ltd', reference: 'X1' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 55000, date: '2026-08-01', description: 'ZZZ Traders', reference: 'Y9' })];

    const issues = detectAmountMismatch(bank, books);

    expect(issues).toHaveLength(0);
  });
});
