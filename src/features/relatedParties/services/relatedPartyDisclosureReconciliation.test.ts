import { describe, expect, it } from 'vitest';
import type { RelatedPartyTransaction } from '@/types/relatedParty';
import type { SourceDocumentLookup } from './relatedPartyTransactionService';
import { reconcileRelatedPartyDisclosures } from './relatedPartyDisclosureReconciliation';

function makeTransaction(overrides: Partial<RelatedPartyTransaction> = {}): RelatedPartyTransaction {
  return {
    id: 'rpt_1',
    relatedPartyId: 'rp_1',
    transactionDate: '2026-03-15',
    natureOfTransaction: 'Sale of goods',
    amount: 54321,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('reconcileRelatedPartyDisclosures', () => {
  it('skips a Manual/Other transaction (no source to check against)', async () => {
    const lookup: SourceDocumentLookup = { resolve: async () => ({ amount: 999, date: '2026-01-01', reference: 'x' }) };
    const rows = await reconcileRelatedPartyDisclosures([makeTransaction()], lookup);
    expect(rows).toHaveLength(0);
  });

  it('matches cleanly when the source record still shows the same amount', async () => {
    const linked = makeTransaction({ sourceDocumentType: 'invoice', sourceDocumentId: 'inv_1', amount: 54321 });
    const lookup: SourceDocumentLookup = { resolve: async () => ({ amount: 54321, date: '2026-03-15', reference: 'INV-0042' }) };

    const rows = await reconcileRelatedPartyDisclosures([linked], lookup);
    expect(rows).toHaveLength(1);
    expect(rows[0].isMatched).toBe(true);
    expect(rows[0].variance).toBeCloseTo(0, 2);
  });

  it('surfaces a mismatch when the source record has since changed (e.g. a credit note reduced the invoice)', async () => {
    const linked = makeTransaction({ sourceDocumentType: 'invoice', sourceDocumentId: 'inv_1', amount: 54321 });
    const lookup: SourceDocumentLookup = { resolve: async () => ({ amount: 40000, date: '2026-03-15', reference: 'INV-0042' }) };

    const rows = await reconcileRelatedPartyDisclosures([linked], lookup);
    expect(rows[0].isMatched).toBe(false);
    expect(rows[0].currentSourceAmount).toBe(40000);
    expect(rows[0].recordedAmount).toBe(54321);
    expect(rows[0].variance).toBeCloseTo(-14321, 2);
  });

  it('surfaces the full amount as variance when the source record can no longer be resolved at all', async () => {
    const linked = makeTransaction({ sourceDocumentType: 'invoice', sourceDocumentId: 'inv_deleted', amount: 54321 });
    const lookup: SourceDocumentLookup = { resolve: async () => undefined };

    const rows = await reconcileRelatedPartyDisclosures([linked], lookup);
    expect(rows[0].isMatched).toBe(false);
    expect(rows[0].currentSourceAmount).toBeUndefined();
    expect(rows[0].variance).toBe(54321);
  });
});
