import type { ID } from '@/types';

/** Round to the cent, avoiding binary-float artefacts (0.1 + 0.2 …). */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** One per-line contribution to be bucketed by its resolved account. */
export interface AccountContribution {
  accountId: ID;
  amount: number;
}

/** A resolved journal-line-worth of value on a single account. */
export interface AccountBucket {
  accountId: ID;
  amount: number;
}

/**
 * Sums per-line `contributions` into one bucket per resolved `accountId`,
 * preserving first-seen order for deterministic journal-line output.
 *
 * When `reconcileTo` is given, the bucket amounts are nudged so they total
 * exactly `reconcileTo` — the whole point of 21.3's "split the journal by
 * resolved account" while still balancing to the cent: the per-line
 * amounts are already rounded, so their sum can drift a cent or two from
 * the document's stored subtotal. The residual is applied to the largest
 * bucket (the least relative distortion), so e.g. a furniture+stationery
 * invoice credits 4010 and 4030 with amounts that still add up to exactly
 * `invoice.subtotal`.
 *
 * Zero-amount buckets are dropped — a `debit 0 / credit 0` journal line is
 * rejected by `JournalEntryService.validateLines()`.
 */
export function bucketByAccount(
  contributions: AccountContribution[],
  reconcileTo?: number,
): AccountBucket[] {
  const order: ID[] = [];
  const sums = new Map<ID, number>();
  for (const { accountId, amount } of contributions) {
    if (!sums.has(accountId)) order.push(accountId);
    sums.set(accountId, roundToCents((sums.get(accountId) ?? 0) + amount));
  }

  let buckets: AccountBucket[] = order.map((accountId) => ({
    accountId,
    amount: roundToCents(sums.get(accountId) ?? 0),
  }));

  if (reconcileTo !== undefined && buckets.length > 0) {
    const total = roundToCents(buckets.reduce((sum, b) => sum + b.amount, 0));
    const residual = roundToCents(reconcileTo - total);
    if (residual !== 0) {
      let largest = 0;
      for (let i = 1; i < buckets.length; i += 1) {
        if (buckets[i].amount > buckets[largest].amount) largest = i;
      }
      buckets[largest] = {
        accountId: buckets[largest].accountId,
        amount: roundToCents(buckets[largest].amount + residual),
      };
    }
  }

  buckets = buckets.filter((b) => b.amount !== 0);
  return buckets;
}
