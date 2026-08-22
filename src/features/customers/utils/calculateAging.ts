import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { ID } from '@/types';
import { getOpenItemsForCustomer, type OpenItem } from '../mock-data/openItems';

/**
 * Accounts-receivable aging buckets. Per docs/DO_NOT_BREAK.md this math
 * must never happen inside JSX — components consume the already-computed
 * result of this function.
 *
 * Bucket convention (simplified 4-bucket model, matching the Customer Hub
 * spec of "Current / 30 / 60 / 90+ Days" — same key names as Suppliers'
 * AgingBuckets, src/features/suppliers/utils/calculateAging.ts, converged
 * 2026-08-22 per docs/KNOWN_ISSUES.md; both independently used different
 * names for this same concept before):
 *  - current:   not yet due (dueDate is today or later)
 *  - days30: 1-30 days past due
 *  - days60: 31-60 days past due
 *  - days90Plus: 61+ days past due (the "90+" bucket — the catch-all for
 *    anything seriously overdue in this simplified model)
 */
export interface AgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
  total: number;
}

function emptyBuckets(): AgingBuckets {
  return { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };
}

/**
 * Buckets the outstanding (unpaid) amount of every open item into
 * Current/1-30/31-60/61+ relative to `asOf` (defaults to now). Fully paid
 * items (amountOutstanding <= 0) are excluded.
 */
export function calculateAging(items: OpenItem[], asOf: Date = new Date()): AgingBuckets {
  const buckets = emptyBuckets();

  for (const item of items) {
    if (item.amountOutstanding <= 0) continue;

    const daysPastDue = differenceInCalendarDays(asOf, parseISO(item.dueDate));

    if (daysPastDue <= 0) {
      buckets.current += item.amountOutstanding;
    } else if (daysPastDue <= 30) {
      buckets.days30 += item.amountOutstanding;
    } else if (daysPastDue <= 60) {
      buckets.days60 += item.amountOutstanding;
    } else {
      buckets.days90Plus += item.amountOutstanding;
    }
    buckets.total += item.amountOutstanding;
  }

  return buckets;
}

/** Aging buckets for a single customer, looked up from the mock open items dataset. */
export function calculateAgingForCustomer(
  customerId: ID,
  asOf: Date = new Date(),
  source: OpenItem[] = getOpenItemsForCustomer(customerId),
): AgingBuckets {
  return calculateAging(source, asOf);
}

/** Sum of every overdue bucket (everything except "current"). */
export function getOverdueTotal(buckets: AgingBuckets): number {
  return buckets.days30 + buckets.days60 + buckets.days90Plus;
}

/**
 * True when a customer has any open (outstanding) item in `items` — used
 * by customerService as the accounts-receivable guard against
 * hard-deleting a customer with linked financial history. Callers should
 * pass real open items derived from `invoiceService` via
 * `invoicesToOpenItems` (mock-data/openItems.ts), not the temporary mock
 * dataset.
 */
export function hasOpenItems(customerId: ID, items: OpenItem[]): boolean {
  return items.some((item) => item.customerId === customerId && item.amountOutstanding > 0);
}
