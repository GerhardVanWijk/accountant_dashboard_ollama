/**
 * Bounded, indexed subset-sum search — the performance-sensitive core
 * behind both grouped matching (detectors/groupMatching.ts, "one bank
 * deposit = many receipts") and the combination difference search
 * (detectors/combinationSearch.ts, "these 3 unrelated items happen to sum
 * to exactly the unexplained variance"). Deliberately NOT a general
 * O(2^n) power-set search — per the spec's own performance requirement,
 * this only ever looks for singles, pairs, and (pool-size-permitting)
 * triples, each via amount-indexed lookups rather than brute-force
 * enumeration:
 *   - size 1: direct hashmap lookup, O(1).
 *   - size 2: for each item, one hashmap lookup for the complement, O(n).
 *   - size 3: for each pair, one hashmap lookup for the complement, O(n^2)
 *     — only attempted when the pool is small enough to be "computationally
 *     reasonable" (MAX_POOL_FOR_TRIPLES), matching the spec's explicit
 *     instruction not to brute-force triples over thousands of records.
 */

const MAX_POOL_FOR_TRIPLES = 150;

export interface IndexedCandidate {
  amountCents: number;
}

export interface SubsetSumMatch {
  indexes: number[];
  sumCents: number;
}

function buildAmountIndex(items: IndexedCandidate[]): Map<number, number[]> {
  const index = new Map<number, number[]>();
  items.forEach((item, i) => {
    const bucket = index.get(item.amountCents);
    if (bucket) bucket.push(i);
    else index.set(item.amountCents, [i]);
  });
  return index;
}

/**
 * Finds every combination of 1, 2, or (pool-size-permitting) 3 distinct
 * items from `items` whose amounts sum to exactly `targetCents`. Returns at
 * most `maxResults` matches, smallest combinations first (a single-item
 * explanation beats a 3-item one when both exist, per the spec's own
 * priority order).
 */
export function findSubsetsSumming(items: IndexedCandidate[], targetCents: number, maxResults: number = 10): SubsetSumMatch[] {
  if (targetCents === 0 || items.length === 0) return [];

  const index = buildAmountIndex(items);
  const results: SubsetSumMatch[] = [];

  // Size 1
  const singles = index.get(targetCents) ?? [];
  for (const i of singles) {
    results.push({ indexes: [i], sumCents: targetCents });
    if (results.length >= maxResults) return results;
  }

  // Size 2
  for (let i = 0; i < items.length; i++) {
    const complement = targetCents - items[i].amountCents;
    const matches = index.get(complement);
    if (!matches) continue;
    for (const j of matches) {
      if (j <= i) continue;
      results.push({ indexes: [i, j], sumCents: targetCents });
      if (results.length >= maxResults) return results;
    }
  }

  // Size 3 — only when the pool is small enough to keep O(n^2) bounded.
  if (items.length <= MAX_POOL_FOR_TRIPLES) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const partial = items[i].amountCents + items[j].amountCents;
        const complement = targetCents - partial;
        const matches = index.get(complement);
        if (!matches) continue;
        for (const k of matches) {
          if (k <= j) continue;
          results.push({ indexes: [i, j, k], sumCents: targetCents });
          if (results.length >= maxResults) return results;
        }
      }
    }
  }

  return results;
}
