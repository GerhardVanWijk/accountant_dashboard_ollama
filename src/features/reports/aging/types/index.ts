/**
 * Shared shapes for the Aging Reports (Customer Aging / Supplier Aging).
 *
 * Deliberately a local, structural copy of the bucket shape already used by
 * `src/features/customers/utils/calculateAging.ts` (`AgingBuckets`) and
 * `src/features/suppliers/utils/calculateAging.ts` (`AgingBuckets`) — both
 * are `{ current, days30, days60, days90Plus, total }`, so either is
 * structurally assignable here without this feature importing a type from
 * (or otherwise coupling to) the Customers/Suppliers feature folders.
 */
export interface AgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
  total: number;
}

/** One row of an aging report summary table — one customer or supplier. */
export interface AgingReportRow {
  id: string;
  name: string;
  buckets: AgingBuckets;
}
