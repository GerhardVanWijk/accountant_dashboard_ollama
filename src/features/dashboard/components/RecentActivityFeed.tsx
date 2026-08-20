import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { ActivityItem } from '../utils/buildRecentActivity';

export interface RecentActivityFeedProps {
  items: ActivityItem[];
}

/**
 * Recent activity list. `items` is the already-sorted/limited output of
 * ../utils/buildRecentActivity.ts (real customer/supplier/product
 * createdAt/updatedAt timestamps — see that file's doc comment for why
 * this stands in for a real audit log).
 */
export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  return (
    <Card>
      <h3 className="mb-md flex items-center gap-sm text-base font-semibold text-text-primary">
        <Icon name="audit" size={18} className="text-primary" />
        Recent Activity
      </h3>

      {items.length === 0 ? (
        <EmptyState
          title="No recent activity"
          message="Activity across customers, suppliers, and products will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-md">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-sm">
              <Icon name={item.icon} size={16} className="mt-xs shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                <p className="text-xs text-text-secondary">{item.description}</p>
              </div>
              <span className="shrink-0 text-xs text-text-muted">
                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
