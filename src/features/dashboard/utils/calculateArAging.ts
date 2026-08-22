import type { Customer, Invoice } from '@/types';
import { calculateAgingForCustomer } from '@/features/customers/utils/calculateAging';
import { invoicesToOpenItems } from '@/features/customers/mock-data/openItems';
import { emptyFleetAgingBuckets, type FleetAgingBuckets } from '../types/aging.types';

/**
 * Fleet-wide Accounts-Receivable aging, aggregated across every
 * customer. There is no aggregate-across-all-customers function in the
 * customers feature — only calculateAgingForCustomer, which buckets one
 * customer at a time — so this dashboard-owned util sums that per-customer
 * result across the whole customer list into the shared FleetAgingBuckets
 * shape (see ../types/aging.types.ts). Customers' and Suppliers' per-entity
 * AgingBuckets share the same current/days30/days60/days90Plus key names
 * as of 2026-08-22 (docs/KNOWN_ISSUES.md) — this mapping just renames into
 * FleetAgingBuckets' bucket30/bucket60/bucket90Plus, it no longer needs to
 * paper over two different naming conventions.
 *
 * Pure aggregation only — no I/O; callers fetch `customers`/`invoices`
 * themselves (e.g. via customerService.getCustomers()/invoiceService.
 * getInvoices() in ../hooks/useDashboardData.ts). `invoices` are real
 * Invoice records (Wave 1b) — converted to open items once, up front, via
 * `invoicesToOpenItems`.
 */
export function calculateArAgingForCustomers(
  customers: Customer[],
  invoices: Invoice[],
  asOf: Date = new Date(),
): FleetAgingBuckets {
  const totals = emptyFleetAgingBuckets();
  const openItems = invoicesToOpenItems(invoices);

  for (const customer of customers) {
    const customerItems = openItems.filter((item) => item.customerId === customer.id);
    const buckets = calculateAgingForCustomer(customer.id, asOf, customerItems);
    totals.current += buckets.current;
    totals.bucket30 += buckets.days30;
    totals.bucket60 += buckets.days60;
    totals.bucket90Plus += buckets.days90Plus;
    totals.total += buckets.total;
  }

  return totals;
}
