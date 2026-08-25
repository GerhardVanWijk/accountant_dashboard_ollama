import { Circle, Package, Truck, Users, type LucideIcon } from 'lucide-react';

import { formatRelative } from '@/lib/app/format';
import type { ActivityItem } from '@/features/dashboard/utils/buildRecentActivity';

/**
 * Adapted from accounting-v0-frontend/components/app/dashboard/activity-feed.tsx.
 * v0's ActivityEvent keyed its icon off a `type` (invoice/payment/expense/
 * journal/bank/document) and carried `amount`/`actor` — none of which the
 * real activity feed provides. This app has no audit-log module yet (see
 * src/features/dashboard/utils/buildRecentActivity.ts's own doc comment):
 * "recent activity" is genuinely derived from real customer/supplier/
 * product createdAt/updatedAt timestamps, not from invoices/payments/
 * journals/bank feeds, and it doesn't know who made the change. Rather
 * than invent an amount or an actor, this renders exactly what's real —
 * icon (from the same 'customers'/'suppliers'/'products' keys
 * src/config/icons.ts already uses), title, description, relative time.
 */
/**
 * Partial, not a full Record<IconName, ...>: ActivityItem['icon'] is typed
 * as the app-wide IconName union (src/config/icons.ts), but
 * buildRecentActivity.ts only ever actually produces 'customers'/
 * 'suppliers'/'products' at runtime — Circle is a defensive fallback, not
 * a real case.
 */
const iconFor: Partial<Record<ActivityItem['icon'], LucideIcon>> = {
  customers: Users,
  suppliers: Truck,
  products: Package,
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item, index) => {
        const Icon = iconFor[item.icon] ?? Circle;

        return (
          <li
            key={item.id}
            className={
              index === 0
                ? 'flex gap-3 py-3'
                : 'flex gap-3 border-t border-border py-3'
            }
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium text-pretty">{item.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                {item.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRelative(item.timestamp)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
