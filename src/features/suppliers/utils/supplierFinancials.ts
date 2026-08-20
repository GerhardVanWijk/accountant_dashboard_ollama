import type { Supplier } from '@/types';
import { calculateAging, mockOpenBills } from './calculateAging';

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
 */
export function calculateFinancialSummary(
  supplier: Supplier,
  asOf: Date = new Date(),
): SupplierFinancialSummary {
  const aging = calculateAging(supplier.id, asOf);
  const totalPayable = aging.total;
  const overdueBalance = aging.days30 + aging.days60 + aging.days90Plus;

  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const ytdPurchases = mockOpenBills
    .filter((bill) => bill.supplierId === supplier.id && new Date(bill.issueDate) >= yearStart)
    .reduce((sum, bill) => sum + bill.amount, 0);

  const creditBalance =
    supplier.creditLimit != null ? Math.max(supplier.creditLimit - totalPayable, 0) : 0;

  return { totalPayable, overdueBalance, ytdPurchases, creditBalance };
}
