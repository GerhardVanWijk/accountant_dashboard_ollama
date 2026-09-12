import { useEffect, useState } from 'react';
import type { RelatedPartyTransaction } from '@/types/relatedParty';
import { reconcileRelatedPartyDisclosures, sourceDocumentLookup, type RelatedPartyDisclosureReconciliationRow } from '../services';

export interface UseRelatedPartyDisclosureReconciliationResult {
  mismatches: RelatedPartyDisclosureReconciliationRow[];
  loading: boolean;
}

/**
 * Surfaces linked related-party disclosures whose recorded amount no
 * longer matches their source record RIGHT NOW (Tax & Compliance
 * integrity audit continuation, 2026-09-12, §11) — never silently
 * continues aggregating a stale retyped figure. Only ever returns rows
 * that are NOT matched; a clean register returns an empty array.
 */
export function useRelatedPartyDisclosureReconciliation(transactions: RelatedPartyTransaction[]): UseRelatedPartyDisclosureReconciliationResult {
  const [mismatches, setMismatches] = useState<RelatedPartyDisclosureReconciliationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const linked = transactions.filter((t) => t.sourceDocumentType && t.sourceDocumentId);
    if (linked.length === 0) {
      setMismatches([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    reconcileRelatedPartyDisclosures(linked, sourceDocumentLookup)
      .then((rows) => {
        if (!cancelled) setMismatches(rows.filter((r) => !r.isMatched));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [transactions]);

  return { mismatches, loading };
}
