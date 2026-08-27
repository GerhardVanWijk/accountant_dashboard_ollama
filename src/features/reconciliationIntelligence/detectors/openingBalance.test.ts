import { describe, expect, it } from 'vitest';
import { detectOpeningBalanceProblem } from './openingBalance';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-07-15', description: 'Item', amountCents: 35218, ...overrides };
}

describe('detectOpeningBalanceProblem', () => {
  it('reports the discrepancy predates the period when every contributing item is dated before the window', () => {
    const items = [candidate({ id: 'a', date: '2026-07-15' })];

    const issues = detectOpeningBalanceProblem('2026-08-01', 35218, items);

    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('opening_balance_discrepancy');
    expect(issues[0].explanation).toContain('2026-08-01');
  });

  it('does not fire when a contributing item falls inside the current period', () => {
    const items = [candidate({ id: 'a', date: '2026-08-14' })];

    expect(detectOpeningBalanceProblem('2026-08-01', 35218, items)).toEqual([]);
  });

  it('does not fire with no contributing items', () => {
    expect(detectOpeningBalanceProblem('2026-08-01', 35218, [])).toEqual([]);
  });
});
