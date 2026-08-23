import type { ID } from '@/types';
import type { RelatedParty, RelatedPartyRelationshipType, RelatedPartyTransaction } from '@/types/relatedParty';

/** One row per related party with at least one transaction — the shape §88's "available for financial statement disclosure" requirement calls for. */
export interface RelatedPartyDisclosureSummaryRow {
  relatedPartyId: ID;
  name: string;
  relationshipType: RelatedPartyRelationshipType;
  transactionCount: number;
  totalAmount: number;
}

/**
 * Pure computation, no async/repository access — same "computeX is pure"
 * idiom as computeCapitalGainsReport() in capitalGainsService.ts.
 * Related parties with zero transactions are omitted: this is a
 * disclosure summary of ACTIVITY, not a duplicate of the register itself.
 */
export function buildRelatedPartyDisclosureSummary(
  parties: RelatedParty[],
  transactions: RelatedPartyTransaction[],
): RelatedPartyDisclosureSummaryRow[] {
  const partiesById = new Map<ID, RelatedParty>(parties.map((p) => [p.id, p]));
  const rowsByPartyId = new Map<ID, RelatedPartyDisclosureSummaryRow>();

  for (const transaction of transactions) {
    const party = partiesById.get(transaction.relatedPartyId);
    if (!party) continue;

    const existing = rowsByPartyId.get(party.id);
    if (existing) {
      existing.transactionCount += 1;
      existing.totalAmount += transaction.amount;
    } else {
      rowsByPartyId.set(party.id, {
        relatedPartyId: party.id,
        name: party.name,
        relationshipType: party.relationshipType,
        transactionCount: 1,
        totalAmount: transaction.amount,
      });
    }
  }

  return Array.from(rowsByPartyId.values());
}
