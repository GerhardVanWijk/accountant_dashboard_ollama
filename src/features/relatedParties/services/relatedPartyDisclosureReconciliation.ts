import type { ID } from '@/types';
import type { RelatedPartySourceDocumentType, RelatedPartyTransaction } from '@/types/relatedParty';
import type { SourceDocumentLookup } from './relatedPartyTransactionService';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. Same convention as vatReportService.ts's VAT_VARIANCE_EPSILON. */
const VARIANCE_EPSILON = 0.005;

export interface RelatedPartyDisclosureReconciliationRow {
  transactionId: ID;
  relatedPartyId: ID;
  sourceDocumentType: RelatedPartySourceDocumentType;
  sourceDocumentId: ID;
  /** What is currently stored on the disclosure — derived from the source at link/edit time, per relatedPartyTransactionService.ts's resolveSource(). */
  recordedAmount: number;
  /** The source record's amount RIGHT NOW. `undefined` if the source record can no longer be resolved at all (e.g. deleted). */
  currentSourceAmount: number | undefined;
  /** currentSourceAmount - recordedAmount. Equals recordedAmount (the full drift) when the source can no longer be resolved. */
  variance: number;
  isMatched: boolean;
}

/**
 * Related-Party Disclosure integrity check (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §11): compares every LINKED
 * transaction's stored `amount` against its source record's amount RIGHT
 * NOW. `createTransaction()`/`updateTransaction()` derive `amount` from
 * the source at write time (§10), so a mismatch here means the SOURCE
 * has changed SINCE (a credit note, an edit, a void) without the
 * disclosure being refreshed to match — a real drift, not a duplicate
 * calculation of the same number.
 *
 * Deliberately skips Manual/Other transactions (no `sourceDocumentType`)
 * — there is nothing authoritative to check a manually-entered figure
 * against, and inventing a comparison would be exactly the "fake
 * linkage" §10 already refuses to create.
 */
export async function reconcileRelatedPartyDisclosures(
  transactions: RelatedPartyTransaction[],
  sourceDocumentLookup: SourceDocumentLookup,
): Promise<RelatedPartyDisclosureReconciliationRow[]> {
  const linked = transactions.filter(
    (t): t is RelatedPartyTransaction & { sourceDocumentType: RelatedPartySourceDocumentType; sourceDocumentId: ID } =>
      t.sourceDocumentType !== undefined && t.sourceDocumentId !== undefined,
  );

  const rows: RelatedPartyDisclosureReconciliationRow[] = [];
  for (const t of linked) {
    const resolved = await sourceDocumentLookup.resolve(t.sourceDocumentType, t.sourceDocumentId);
    const currentSourceAmount = resolved?.amount;
    const variance = currentSourceAmount === undefined ? t.amount : Math.round((currentSourceAmount - t.amount + Number.EPSILON) * 100) / 100;
    rows.push({
      transactionId: t.id,
      relatedPartyId: t.relatedPartyId,
      sourceDocumentType: t.sourceDocumentType,
      sourceDocumentId: t.sourceDocumentId,
      recordedAmount: t.amount,
      currentSourceAmount,
      variance,
      isMatched: currentSourceAmount !== undefined && Math.abs(variance) <= VARIANCE_EPSILON,
    });
  }
  return rows;
}
