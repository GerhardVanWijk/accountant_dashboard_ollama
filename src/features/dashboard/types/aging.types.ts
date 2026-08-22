/**
 * Normalized aging shape shared by the dashboard's AR/AP widgets.
 *
 * Customers' and Suppliers' AgingBuckets
 * (src/features/customers/utils/calculateAging.ts,
 * src/features/suppliers/utils/calculateAging.ts) were originally built
 * independently (parallel Wave 1 dispatch) with different bucket key
 * names for the same concept — converged onto one shared
 * current/days30/days60/days90Plus convention 2026-08-22
 * (docs/KNOWN_ISSUES.md). Still normalized into this dashboard-local
 * `bucket30`/`bucket60`/`bucket90Plus` shape by ../utils/calculateArAging.ts
 * and ../utils/calculateApAging.ts, since a fleet-wide aggregate is its own
 * concept distinct from either entity's per-record aging, not because the
 * two source shapes disagree anymore.
 */
export interface FleetAgingBuckets {
  current: number;
  bucket30: number;
  bucket60: number;
  bucket90Plus: number;
  total: number;
}

export function emptyFleetAgingBuckets(): FleetAgingBuckets {
  return { current: 0, bucket30: 0, bucket60: 0, bucket90Plus: 0, total: 0 };
}
