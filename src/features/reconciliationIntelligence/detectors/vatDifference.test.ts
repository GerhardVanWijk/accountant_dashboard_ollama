import { describe, expect, it } from 'vitest';
import { detectVatDifferences } from './vatDifference';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 100000, ...overrides };
}

describe('detectVatDifferences', () => {
  it('flags a books entry recorded VAT-exclusive against a bank amount that is VAT-inclusive at 15%', () => {
    // R1,000.00 exclusive vs R1,150.00 inclusive of 15% VAT.
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 115000, date: '2026-08-14', description: 'Supplier invoice' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 100000, date: '2026-08-14', description: 'Supplier invoice' })];

    const issues = detectVatDifferences(bank, books, [15]);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('vat_difference');
    expect(issues[0].evidence.some((e) => e.label.includes('15%'))).toBe(true);
  });

  it('does not flag a pair whose difference matches no supplied VAT rate', () => {
    const bank = [candidate({ id: 'b1', side: 'bank', amountCents: 100000, date: '2026-08-14' })];
    const books = [candidate({ id: 'k1', side: 'books', amountCents: 100500, date: '2026-08-14' })];

    expect(detectVatDifferences(bank, books, [15])).toHaveLength(0);
  });
});
