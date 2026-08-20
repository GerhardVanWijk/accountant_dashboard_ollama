/**
 * Normalized aging shape shared by the dashboard's AR/AP widgets.
 *
 * Customers' AgingBuckets (src/features/customers/utils/calculateAging.ts)
 * uses current/days1to30/days31to60/days61Plus, while Suppliers'
 * AgingBuckets (src/features/suppliers/utils/calculateAging.ts) uses
 * current/days30/days60/days90Plus — two independently-built shapes with
 * different bucket key names. Rather than fixing that underlying
 * inconsistency (out of scope for dashboard-bee), both are normalized
 * into this one shape by ../utils/calculateArAging.ts and
 * ../utils/calculateApAging.ts before reaching any dashboard component.
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
