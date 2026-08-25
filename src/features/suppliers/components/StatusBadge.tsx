import type { ActiveStatus } from '@/types';
import { StatusBadge as V0StatusBadge } from '@/components/app/status-badge';

export interface StatusBadgeProps {
  status: ActiveStatus;
  onHold?: boolean;
}

/**
 * Supplier account-standing badge, built on the shared v0 StatusBadge
 * (src/components/app/status-badge.tsx). On-hold takes visual precedence
 * over active/inactive since it's the more urgent signal for
 * accounts-payable staff scanning the list — same precedence the old
 * design-system version of this component used.
 */
export function StatusBadge({ status, onHold }: StatusBadgeProps) {
  return <V0StatusBadge status={onHold ? 'on-hold' : status} />;
}
