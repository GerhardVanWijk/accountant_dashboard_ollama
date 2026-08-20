import type { Customer, Supplier, Product } from '@/types';
import type { IconName } from '@/config/icons';

export interface ActivityItem {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  /** ISO-8601 timestamp — the record's updatedAt (or createdAt if never updated). */
  timestamp: string;
}

/**
 * No audit-log module exists yet (a real one is a later phase). Until one
 * does, the Executive Dashboard's "recent activity" feed is derived from
 * real createdAt/updatedAt timestamps already carried by every Customer/
 * Supplier/Product record — genuine data, just a simplified stand-in for
 * a real event-sourced audit trail. Re-point this at a real audit-log
 * service once one ships; the ActivityItem shape it returns shouldn't
 * need to change.
 *
 * Kept out of JSX per docs/DO_NOT_BREAK.md — RecentActivityFeed only
 * renders the already-sorted, already-limited result.
 */
export function buildRecentActivity(
  customers: Customer[],
  suppliers: Supplier[],
  products: Product[],
  limit = 8,
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...customers.map(
      (c): ActivityItem => ({
        id: `customer_${c.id}`,
        icon: 'customers',
        title: c.name,
        description: c.createdAt === c.updatedAt ? 'New customer added' : 'Customer details updated',
        timestamp: c.updatedAt,
      }),
    ),
    ...suppliers.map(
      (s): ActivityItem => ({
        id: `supplier_${s.id}`,
        icon: 'suppliers',
        title: s.name,
        description: s.createdAt === s.updatedAt ? 'New supplier added' : 'Supplier details updated',
        timestamp: s.updatedAt,
      }),
    ),
    ...products.map(
      (p): ActivityItem => ({
        id: `product_${p.id}`,
        icon: 'products',
        title: p.name,
        description: p.createdAt === p.updatedAt ? 'New product added' : 'Product details updated',
        timestamp: p.updatedAt,
      }),
    ),
  ];

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
}
