import type { Bill, ID, Supplier } from '@/types';
import { calculateAging, mockOpenBills, billsToOpenBills, type MockOpenBill } from './calculateAging';

export interface SupplierFinancialSummary {
  /** Sum of every open bill owed to this supplier (== aging total). */
  totalPayable: number;
  /** Portion of totalPayable that is past its due date (30/60/90+ buckets). */
  overdueBalance: number;
  /** Sum of this supplier's bills issued in the current calendar year. */
  ytdPurchases: number;
  /** Remaining credit headroom against the supplier's credit limit. */
  creditBalance: number;
}

/**
 * Computes the Supplier Detail hub's financial summary cards (Total
 * Payable, Overdue Balance, YTD Purchases, Credit Balance). Pure
 * service/util-layer function — per docs/DO_NOT_BREAK.md this
 * calculation must never live inside a component/JSX.
 *
 * `bills` should be this supplier's real Bill records (via
 * `billService.getBillsBySupplier`), converted by the caller is NOT
 * required — pass raw `Bill[]` and this function adapts them internally.
 * Falls back to the (temporary) mock open-bills dataset only when no real
 * bills are supplied, for backward compatibility with existing callers.
 */
export function calculateFinancialSummary(
  supplier: Supplier,
  asOf: Date = new Date(),
  bills?: Bill[],
): SupplierFinancialSummary {
  const openBills: MockOpenBill[] = bills ? billsToOpenBills(bills) : mockOpenBills;
  const aging = calculateAging(supplier.id, asOf, openBills);
  const totalPayable = aging.total;
  const overdueBalance = aging.days30 + aging.days60 + aging.days90Plus;

  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const ytdPurchases = openBills
    .filter((bill) => bill.supplierId === supplier.id && new Date(bill.issueDate) >= yearStart)
    .reduce((sum, bill) => sum + bill.amount, 0);

  const creditBalance =
    supplier.creditLimit != null ? Math.max(supplier.creditLimit - totalPayable, 0) : 0;

  return { totalPayable, overdueBalance, ytdPurchases, creditBalance };
}

/**
 * Fleet-wide summary for the Supplier List page's stat row (Phase 3
 * visual-fidelity audit — v0's SuppliersPage has a 4-tile FigureBlock row
 * this app's list page was missing). `bills` should be real Bill records
 * from `useBills()` (Purchases module) — the same real data
 * SupplierDetailPage already converts via `billsToOpenBills` for its own
 * aging figures, never the (temporary) mock bills dataset.
 *
 * `totalPayable` sums the real stored `Supplier.balance` field (matching
 * v0's own `suppliers.reduce((sum, s) => sum + s.balance, 0)` exactly).
 * v0's 4th tile ("Average terms" in days) has no real equivalent — the
 * actual domain only has a categorical `paymentTerms` enum
 * (Net14/Net30/EOM), not a numeric day count, and averaging one in would
 * mean inventing a conversion. Substituted with `onHoldCount` (the real
 * `onHold` flag) instead, mirroring the Customer fleet summary's
 * `onHoldCount` for the same reason.
 */
export interface SupplierFleetSummary {
  totalPayable: number;
  /** Sum of every supplier's overdue (30/60/90+ bucket) bills — v0's "Due for release". */
  totalOutstanding: number;
  activeCount: number;
  onHoldCount: number;
  /** Per-supplier outstanding total, for the SupplierTable's optional Outstanding column. */
  outstandingBySupplierId: Map<ID, number>;
}

export function calculateFleetSummary(
  suppliers: Supplier[],
  bills: Bill[],
  asOf: Date = new Date(),
): SupplierFleetSummary {
  const totalPayable = suppliers.reduce((sum, s) => sum + s.balance, 0);
  const activeCount = suppliers.filter((s) => s.status === 'active').length;
  const onHoldCount = suppliers.filter((s) => s.onHold).length;

  const openBills = billsToOpenBills(bills);
  const outstandingBySupplierId = new Map<ID, number>();
  let totalOutstanding = 0;
  for (const supplier of suppliers) {
    const buckets = calculateAging(supplier.id, asOf, openBills);
    const overdue = buckets.days30 + buckets.days60 + buckets.days90Plus;
    outstandingBySupplierId.set(supplier.id, overdue);
    totalOutstanding += overdue;
  }

  return { totalPayable, totalOutstanding, activeCount, onHoldCount, outstandingBySupplierId };
}
