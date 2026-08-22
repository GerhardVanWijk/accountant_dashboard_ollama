import type { Customer } from '@/types';
import { customerService } from '@/features/customers/services/customerService';
import { invoiceService } from '@/services';
import { getOpenItemsForCustomer, invoicesToOpenItems, type OpenItem } from '@/features/customers/mock-data/openItems';
import { calculateAgingForCustomer } from '@/features/customers/utils/calculateAging';
import type { AgingReportRow } from '../types';

/**
 * Pure per-entity loop: one `AgingReportRow` per customer, using the
 * SAME `openItems` array for every customer (not a pre-filtered subset) —
 * `calculateAgingForCustomer` is called once per customer.
 *
 * Found while building this report: `calculateAgingForCustomer` used to
 * only filter by `customerId` via its third parameter's *default value*
 * (`getOpenItemsForCustomer(customerId)`) — passing an explicit `source`
 * array covering every customer, as this report must to reuse one fetch,
 * bypassed that filtering entirely and would have silently given every
 * customer the fleet-wide total. Fixed at the source 2026-08-22
 * (`calculateAgingForCustomer` now always filters internally via
 * `getOpenItemsForCustomer`, regardless of who called it or how). The
 * explicit `getOpenItemsForCustomer(customer.id, openItems)` call below is
 * therefore now redundant with that internal fix — kept anyway as
 * defense-in-depth/documentation of intent, since it's a correct no-op,
 * not because it's still load-bearing.
 */
export function buildCustomerAgingRows(customers: Customer[], openItems: OpenItem[], asOf: Date): AgingReportRow[] {
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    buckets: calculateAgingForCustomer(customer.id, asOf, getOpenItemsForCustomer(customer.id, openItems)),
  }));
}

/**
 * Fetches every customer and every posted invoice, converts invoices to
 * the `OpenItem[]` shape the aging math consumes (via the real
 * `invoicesToOpenItems` adapter — see docs/KNOWN_ISSUES.md), then computes
 * one aging row per customer. This is the data-fetching boundary; the
 * per-entity math itself lives in `buildCustomerAgingRows` so it can be
 * unit-tested without mocking services.
 */
export async function getCustomerAgingReport(asOf: Date = new Date()): Promise<AgingReportRow[]> {
  const [customers, invoices] = await Promise.all([customerService.getCustomers(), invoiceService.getInvoices()]);
  const openItems = invoicesToOpenItems(invoices);
  return buildCustomerAgingRows(customers, openItems, asOf);
}
