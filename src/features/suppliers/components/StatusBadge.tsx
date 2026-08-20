import type { ActiveStatus } from '@/types';
import { cn } from '@/utils/cn';

export interface StatusBadgeProps {
  status: ActiveStatus;
  onHold?: boolean;
}

/**
 * Small pill badge for a supplier's account standing. On-hold takes
 * visual precedence over active/inactive since it's the more urgent
 * signal for accounts-payable staff scanning the list.
 */
export function StatusBadge({ status, onHold }: StatusBadgeProps) {
  if (onHold) {
    return (
      <span className="inline-flex items-center rounded-full bg-warning px-sm py-xs text-xs font-medium text-on-accent">
        On Hold
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-sm py-xs text-xs font-medium text-on-accent',
        status === 'active' ? 'bg-success' : 'bg-border text-text-secondary',
      )}
    >
      {status === 'active' ? 'Active' : 'Inactive'}
    </span>
  );
}
