import { parseISO, startOfYear } from 'date-fns';
import type { Customer } from '@/types';
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
