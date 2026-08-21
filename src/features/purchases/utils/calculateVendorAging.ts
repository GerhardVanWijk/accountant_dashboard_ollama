import type { Bill, ID } from '@/types';

/**
 * AP aging buckets — same bucket shape suppliers-bee's (temporary, mock)
 * `calculateAging.ts` already uses (`{current, days30, days60, days90Plus,
 * total}`), so a future integration pass can re-point Suppliers at these
 * real numbers by swapping the import, not by reshaping consumers.
 * See docs/KNOWN_ISSUES.md.
 */
export interface VendorAgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
  total: number;
}

const EMPTY_BUCKETS: VendorAgingBuckets = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

/**
 * Buckets one supplier's outstanding bills into Current / 1-30 / 31-60 / 90+
 * days overdue, based on each bill's due date relative to `asOf`. Pure
 * function — no I/O, no JSX — safe to unit test and to call from a page or
 * report service.
 *
 * Unlike suppliers-bee's mock dataset (where every "open bill" carries its
 * full original amount), real Bill records can be partially paid — so each
 * bucket accumulates the bill's remaining OUTSTANDING balance
 * (`total - amountPaid`), not its original total. That is the true AP
 * exposure an aging report needs to show.
 */
export function calculateVendorAging(
  supplierId: ID,
  bills: Bill[],
  asOf: Date = new Date(),
): VendorAgingBuckets {
  const buckets: VendorAgingBuckets = { ...EMPTY_BUCKETS };

  bills
    .filter((bill) => bill.supplierId === supplierId && bill.status !== 'void')
    .forEach((bill) => {
      const outstanding = bill.total - bill.amountPaid;
      if (outstanding <= 0) return;

      const dueDate = new Date(bill.dueDate);
      const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        buckets.current += outstanding;
      } else if (daysOverdue <= 30) {
        buckets.days30 += outstanding;
      } else if (daysOverdue <= 60) {
        buckets.days60 += outstanding;
      } else {
        buckets.days90Plus += outstanding;
      }
      buckets.total += outstanding;
    });

  return buckets;
}

/** One row of the aggregated Vendor Aging report — one supplier's buckets. */
export interface VendorAgingRow {
  supplierId: ID;
  buckets: VendorAgingBuckets;
}

/**
 * Aggregates every supplier that appears in `bills` into one aging row
 * each, in a single pass. Suppliers with no outstanding bills never appear
 * (nothing to age), matching how a real AP aging report only lists open
 * balances.
 */
export function calculateAllVendorAging(bills: Bill[], asOf: Date = new Date()): VendorAgingRow[] {
  const supplierIds = Array.from(new Set(bills.map((bill) => bill.supplierId)));
  return supplierIds
    .map((supplierId) => ({ supplierId, buckets: calculateVendorAging(supplierId, bills, asOf) }))
    .filter((row) => row.buckets.total > 0);
}
