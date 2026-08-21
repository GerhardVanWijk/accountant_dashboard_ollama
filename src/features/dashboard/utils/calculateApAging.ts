import type { Bill, Supplier } from '@/types';
import {
  calculateAging as calculateSupplierAging,
  billsToOpenBills,
} from '@/features/suppliers/utils/calculateAging';
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
 * Pure aggregation only — no I/O; callers fetch `suppliers`/`bills`
 * themselves (e.g. via supplierService.getSuppliers()/billService.getBills()
 * in ../hooks/useDashboardData.ts). `bills` are real Bill records (Wave 1b) —
 * converted per-supplier via `billsToOpenBills` before bucketing.
 */
export function calculateApAgingForSuppliers(
  suppliers: Supplier[],
  bills: Bill[],
  asOf: Date = new Date(),
): FleetAgingBuckets {
  const totals = emptyFleetAgingBuckets();
  const openBills = billsToOpenBills(bills);

  for (const supplier of suppliers) {
    const buckets = calculateSupplierAging(supplier.id, asOf, openBills);
    totals.current += buckets.current;
    totals.bucket30 += buckets.days30;
    totals.bucket60 += buckets.days60;
    totals.bucket90Plus += buckets.days90Plus;
    totals.total += buckets.total;
  }

  return totals;
}
