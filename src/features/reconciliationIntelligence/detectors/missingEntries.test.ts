import { describe, expect, it } from 'vitest';
import { detectMissingEntries } from './missingEntries';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return {
    id: 'c1',
    side: 'bank',
    kind: 'bank_transaction',
    date: '2026-08-01',
    description: 'Item',
    amountCents: -1000,
    ...overrides,
  };
}

describe('detectMissingEntries', () => {
  it('flags a bank fee with no accounting entry as missing_ledger_side, high severity once stale', () => {
    const unmatchedBank = [candidate({ id: 'b1', date: '2026-08-01', description: 'MONTHLY SERVICE FEE', amountCents: -8500 })];

    const issues = detectMissingEntries(unmatchedBank, [], '2026-08-27', 7);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('missing_ledger_side');
    expect(issues[0].severity).toBe('high');
  });

  it('flags a books entry never seen on the bank as missing_bank_side', () => {
    const unmatchedBooks = [candidate({ id: 'k1', side: 'books', kind: 'bank_transaction', date: '2026-08-01', description: 'Supplier EFT', amountCents: -20000 })];

    const issues = detectMissingEntries([], unmatchedBooks, '2026-08-27', 7);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('missing_bank_side');
  });

  it('treats a recent, still-outstanding books item as a normal, auto-resolvable timing difference — not urgent', () => {
    const unmatchedBooks = [candidate({ id: 'k1', side: 'books', kind: 'bank_transaction', date: '2026-08-25', description: 'Cheque issued', amountCents: -3000 })];

    const issues = detectMissingEntries([], unmatchedBooks, '2026-08-27', 7);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('low');
    expect(issues[0].autoResolutionSafe).toBe(true);
  });
});
