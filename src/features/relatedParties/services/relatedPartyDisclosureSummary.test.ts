import { describe, expect, it } from 'vitest';
import { buildRelatedPartyDisclosureSummary } from './relatedPartyDisclosureSummary';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';

function party(overrides: Partial<RelatedParty> = {}): RelatedParty {
  return {
    id: 'rp_1',
    name: 'Jane Director',
    relationshipType: 'director',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function transaction(overrides: Partial<RelatedPartyTransaction> = {}): RelatedPartyTransaction {
  return {
    id: 'txn_1',
    relatedPartyId: 'rp_1',
    transactionDate: '2026-06-01',
    natureOfTransaction: 'Loan advanced',
    amount: 10000,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildRelatedPartyDisclosureSummary', () => {
  it('returns an empty array when there are no transactions', () => {
    expect(buildRelatedPartyDisclosureSummary([party()], [])).toEqual([]);
  });

  it('omits related parties with no transactions', () => {
    const parties = [party({ id: 'rp_1' }), party({ id: 'rp_2', name: 'Silent Co' })];
    const transactions = [transaction({ id: 'txn_1', relatedPartyId: 'rp_1' })];

    const summary = buildRelatedPartyDisclosureSummary(parties, transactions);
    expect(summary).toHaveLength(1);
    expect(summary[0].relatedPartyId).toBe('rp_1');
  });

  it('groups and sums multiple transactions for the same related party', () => {
    const parties = [party()];
    const transactions = [
      transaction({ id: 'txn_1', amount: 10000 }),
      transaction({ id: 'txn_2', amount: 5000, natureOfTransaction: 'Consulting fee' }),
      transaction({ id: 'txn_3', amount: -2000, natureOfTransaction: 'Repayment' }),
    ];

    const summary = buildRelatedPartyDisclosureSummary(parties, transactions);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      relatedPartyId: 'rp_1',
      name: 'Jane Director',
      relationshipType: 'director',
      transactionCount: 3,
      totalAmount: 13000,
    });
  });

  it('produces one row per related party when multiple parties have transactions', () => {
    const parties = [party({ id: 'rp_1' }), party({ id: 'rp_2', name: 'Subsidiary Co', relationshipType: 'subsidiary' })];
    const transactions = [
      transaction({ id: 'txn_1', relatedPartyId: 'rp_1', amount: 1000 }),
      transaction({ id: 'txn_2', relatedPartyId: 'rp_2', amount: 2000 }),
    ];

    const summary = buildRelatedPartyDisclosureSummary(parties, transactions);
    expect(summary).toHaveLength(2);
    expect(summary.find((r) => r.relatedPartyId === 'rp_2')).toMatchObject({ name: 'Subsidiary Co', totalAmount: 2000 });
  });

  it('ignores a transaction whose related party no longer exists in the given list', () => {
    const transactions = [transaction({ relatedPartyId: 'missing' })];
    expect(buildRelatedPartyDisclosureSummary([party()], transactions)).toEqual([]);
  });
});
