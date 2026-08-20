import type { Supplier } from '@/types';
import { calculateAging as calculateSupplierAging } from '@/features/suppliers/utils/calculateAging';
import { emptyFleetAgingBuckets, type FleetAgingBuckets } from '../types/aging.types';

/**
 * Fleet-wide Accounts-Payable aging, aggregated across every supplier.
 * Mirrors ../utils/calculateArAging.ts's approach: suppliers'
 * calculateAging() only buckets one supplier at a time, so this
 * dashboard-owned util sums that per-supplier result across the whole
 * supplier list, normalizing suppliers' bucket key names
 * (current/days30/days60/days90Plus) into the shared FleetAgingBuckets
 * shape (see ../types/aging.types.ts). Imported under an alias
 * (calculateSupplierAging) to avoid colliding with the customers
 * feature's identically-named calculateAging export.
 *
 * Pure aggregation only — no I/O; callers fetch `suppliers` themselves
 * (e.g. via supplierService.getSuppliers() in ../hooks/useDashboardData.ts).
 */
export function calculateApAgingForSuppliers(suppliers: Supplier[], asOf: Date = new Date()): FleetAgingBuckets {
  const totals = emptyFleetAgingBuckets();

  for (const supplier of suppliers) {
    const buckets = calculateSupplierAging(supplier.id, asOf);
    totals.current += buckets.current;
    totals.bucket30 += buckets.days30;
    totals.bucket60 += buckets.days60;
    totals.bucket90Plus += buckets.days90Plus;
    totals.total += buckets.total;
  }

  return totals;
}
