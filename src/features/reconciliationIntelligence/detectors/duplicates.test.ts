import { describe, expect, it } from 'vitest';
import { detectDuplicates } from './duplicates';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  const merged: InvestigationCandidate = {
    id: 'c1',
    side: 'bank',
    kind: 'bank_transaction',
    date: '2026-08-14',
    description: 'Invoice payment ABC Traders',
    amountCents: 500000,
    reference: 'INV-2041',
    ...overrides,
  };
  return { ...merged, bankTransactionId: merged.bankTransactionId ?? merged.id };
}

describe('detectDuplicates', () => {
  it('flags two same-amount, same-reference entries a day apart as a likely duplicate', () => {
    const pool = [
      candidate({ id: 'a', date: '2026-08-14' }),
      candidate({ id: 'b', date: '2026-08-15' }),
    ];

    const issues = detectDuplicates(pool);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('duplicate_transaction');
    expect(issues[0].relatedBankTransactionIds).toEqual(expect.arrayContaining(['a', 'b']));

    const data = issues[0].evidenceData!;
    expect(data.detectorType).toBe('duplicate_transaction');
    expect(data.dateDifferenceDays).toBe(1);
    expect(data.factors!.some((f) => f.key === 'reference_match' && f.met)).toBe(true);
  });

  it('does not flag two same-amount entries with unrelated references/descriptions', () => {
    const pool = [
      candidate({ id: 'a', reference: 'INV-1', description: 'ABC Traders' }),
      candidate({ id: 'b', reference: 'INV-2', description: 'XYZ Suppliers' }),
    ];

    const issues = detectDuplicates(pool);

    expect(issues).toHaveLength(0);
  });

  it('does not flag entries too far apart in date', () => {
    const pool = [
      candidate({ id: 'a', date: '2026-08-01' }),
      candidate({ id: 'b', date: '2026-08-20' }),
    ];

    const issues = detectDuplicates(pool);

    expect(issues).toHaveLength(0);
  });
});
