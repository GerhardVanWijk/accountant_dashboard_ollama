import type { ActiveStatus } from '@/types';
import { cn } from '@/utils/cn';

export interface CustomerStatusBadgeProps {
  status: ActiveStatus;
  className?: string;
}

/** Small pill showing Active/Inactive — accent-filled surfaces always use text-on-accent. */
export function CustomerStatusBadge({ status, className }: CustomerStatusBadgeProps) {
  const isActive = status === 'active';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-sm py-xs text-xs font-medium',
        isActive ? 'bg-success text-on-accent' : 'bg-border text-text-secondary',
        className,
      )}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

/** Small pill flagging a customer as on credit hold. */
export function CreditHoldBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-warning px-sm py-xs text-xs font-medium text-on-accent',
        className,
      )}
    >
      Credit Hold
    </span>
  );
}
