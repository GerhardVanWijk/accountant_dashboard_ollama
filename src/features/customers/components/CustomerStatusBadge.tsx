import type { ActiveStatus } from '@/types';
import { StatusBadge as V0StatusBadge } from '@/components/app/status-badge';
import { Badge } from '@/components/ui/shadcn/badge';

export interface CustomerStatusBadgeProps {
  status: ActiveStatus;
  className?: string;
}

/** Active/Inactive badge, built on the shared v0 StatusBadge. */
export function CustomerStatusBadge({ status, className }: CustomerStatusBadgeProps) {
  return <V0StatusBadge status={status} className={className} />;
}

/** Small pill flagging a customer as on credit hold — a separate credit-control flag, not the account status itself. */
export function CreditHoldBadge({ className }: { className?: string }) {
  return (
    <Badge className={className ? `bg-status-warning/15 text-status-warning ${className}` : 'bg-status-warning/15 text-status-warning'}>
      Credit Hold
    </Badge>
  );
}
