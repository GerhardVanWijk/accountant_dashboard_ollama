import type { Supplier } from '@/types';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { billService } from '@/features/purchases/services';
import {
  billsToOpenBills,
  calculateAging as calculateSupplierAging,
  type MockOpenBill,
} from '@/features/suppliers/utils/calculateAging';
import type { AgingReportRow } from '../types';

/**
 * Pure per-entity loop: one `AgingReportRow` per supplier, using the SAME
 * `openBills` array for every supplier. Unlike the customers' aging util
 * (see customerAgingReportService.ts's doc comment for the discrepancy),
 * suppliers' `calculateAging(supplierId, asOf, bills)` DOES filter its
 * `bills` argument by `supplierId` internally, so the full array can be
 * passed straight through for every supplier without pre-filtering.
 */
export function buildSupplierAgingRows(suppliers: Supplier[], openBills: MockOpenBill[], asOf: Date): AgingReportRow[] {
  return suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    buckets: calculateSupplierAging(supplier.id, asOf, openBills),
  }));
}

/**
 * Fetches every supplier and every posted bill, converts bills to the
 * `MockOpenBill[]` shape the aging math consumes (via the real
 * `billsToOpenBills` adapter — see docs/KNOWN_ISSUES.md), then computes
 * one aging row per supplier. Data-fetching boundary only; the per-entity
 * math lives in `buildSupplierAgingRows` so it can be unit-tested without
 * mocking services.
 */
export async function getSupplierAgingReport(asOf: Date = new Date()): Promise<AgingReportRow[]> {
  const [suppliers, bills] = await Promise.all([supplierService.getSuppliers(), billService.getBills()]);
  const openBills = billsToOpenBills(bills);
  return buildSupplierAgingRows(suppliers, openBills, asOf);
}
