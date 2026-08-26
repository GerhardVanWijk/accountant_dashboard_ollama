import { parseISO, startOfYear } from 'date-fns';
import type { Customer, ID } from '@/types';
import { getOpenItemsForCustomer, type OpenItem } from '../mock-data/openItems';
import { calculateAging, getOverdueTotal } from './calculateAging';

/**
 * Financial summary shown on the Customer Hub's four summary cards.
 * Computed here (service/util layer) rather than in JSX, per
 * docs/DO_NOT_BREAK.md.
 */
export interface CustomerFinancialSummary {
  totalOutstanding: number;
  overdueBalance: number;
  /** creditLimit - totalOutstanding. `null` when the customer has no credit limit set. */
  availableCredit: number | null;
  /** Sum of document amounts issued this calendar year (paid or not). */
  ytdSales: number;
}

export function calculateFinancialSummary(
  customer: Pick<Customer, 'id' | 'creditLimit'>,
  asOf: Date = new Date(),
  source: OpenItem[] = getOpenItemsForCustomer(customer.id),
): CustomerFinancialSummary {
  const aging = calculateAging(source, asOf);
  const totalOutstanding = aging.total;
  const overdueBalance = getOverdueTotal(aging);
  const availableCredit = typeof customer.creditLimit === 'number' ? customer.creditLimit - totalOutstanding : null;

  const yearStart = startOfYear(asOf);
  const ytdSales = source
    .filter((item) => {
      const issueDate = parseISO(item.issueDate);
      return issueDate >= yearStart && issueDate <= asOf;
    })
    .reduce((sum, item) => sum + item.amount, 0);

  return { totalOutstanding, overdueBalance, availableCredit, ytdSales };
}

/**
 * Fleet-wide summary for the Customer List page's stat row (Phase 3
 * visual-fidelity audit — v0's CustomersPage has a 4-tile FigureBlock row
 * this app's list page was missing). `openItems` should be real,
 * invoice-derived data (`invoicesToOpenItems(invoices)`, same as
 * CustomerDetailPage already passes into `calculateFinancialSummary`
 * above) — never the mock-data default, so these totals are real AR
 * figures, not fabricated ones.
 *
 * `totalReceivable` sums the real stored `Customer.balance` field
 * (matching v0's own `customers.reduce((sum, c) => sum + c.balance, 0)`
 * exactly). `onHoldCount` counts the real `creditHold` flag — the actual
 * domain has no `'on-hold'` status value the way v0's mock does, so this
 * is the real equivalent concept, not an invented one.
 */
export interface CustomerFleetSummary {
  totalReceivable: number;
  totalOverdue: number;
  activeCount: number;
  onHoldCount: number;
  /** Per-customer overdue total, for the CustomerTable's optional Overdue column. */
  overdueByCustomerId: Map<ID, number>;
}

export function calculateFleetSummary(
  customers: Pick<Customer, 'id' | 'balance' | 'status' | 'creditHold'>[],
  openItems: OpenItem[],
  asOf: Date = new Date(),
): CustomerFleetSummary {
  const totalReceivable = customers.reduce((sum, c) => sum + c.balance, 0);
  const activeCount = customers.filter((c) => c.status === 'active').length;
  const onHoldCount = customers.filter((c) => c.creditHold).length;

  const itemsByCustomer = new Map<ID, OpenItem[]>();
  for (const item of openItems) {
    const list = itemsByCustomer.get(item.customerId);
    if (list) {
      list.push(item);
    } else {
      itemsByCustomer.set(item.customerId, [item]);
    }
  }

  const overdueByCustomerId = new Map<ID, number>();
  for (const [customerId, items] of itemsByCustomer) {
    overdueByCustomerId.set(customerId, getOverdueTotal(calculateAging(items, asOf)));
  }

  return {
    totalReceivable,
    totalOverdue: getOverdueTotal(calculateAging(openItems, asOf)),
    activeCount,
    onHoldCount,
    overdueByCustomerId,
  };
}
