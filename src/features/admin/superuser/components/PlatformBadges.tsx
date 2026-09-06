import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import type { SubscriptionManagement } from '../types';

const PLAN_TONE: Record<string, string> = {
  starter: 'bg-status-info-muted text-status-info',
  growth: 'bg-status-positive-muted text-status-positive',
  premium: 'bg-primary/10 text-primary',
};

/** Plan chip — Starter / Growth / Premium / Unmanaged. */
export function PlanBadge({ planCode, className }: { planCode: string | null; className?: string }) {
  if (!planCode) {
    return <Badge className={cn('bg-muted text-muted-foreground', className)}>Unmanaged</Badge>;
  }
  const label = planCode.charAt(0).toUpperCase() + planCode.slice(1);
  return <Badge className={cn(PLAN_TONE[planCode] ?? 'bg-muted text-muted-foreground', className)}>{label}</Badge>;
}

const SUB_STATUS: Record<string, { tone: string; label: string }> = {
  active: { tone: 'bg-status-positive-muted text-status-positive', label: 'Active' },
  trialing: { tone: 'bg-status-info-muted text-status-info', label: 'Trialing' },
  pending: { tone: 'bg-status-warning-muted text-status-warning', label: 'Pending' },
  past_due: { tone: 'bg-status-warning-muted text-status-warning', label: 'Past due' },
  suspended: { tone: 'bg-status-negative-muted text-status-negative', label: 'Suspended' },
  cancelled: { tone: 'bg-muted text-muted-foreground', label: 'Cancelled' },
  expired: { tone: 'bg-muted text-muted-foreground', label: 'Expired' },
};

export function SubscriptionStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <Badge className={cn('bg-muted text-muted-foreground', className)}>No subscription</Badge>;
  const s = SUB_STATUS[status] ?? { tone: 'bg-muted text-muted-foreground', label: status };
  return <Badge className={cn(s.tone, className)}>{s.label}</Badge>;
}

/** Client access status — Active / Suspended. */
export function ClientStatusBadge({ active, className }: { active: boolean; className?: string }) {
  return active ? (
    <Badge className={cn('bg-status-positive-muted text-status-positive', className)}>Active</Badge>
  ) : (
    <Badge className={cn('bg-status-negative-muted text-status-negative', className)}>Suspended</Badge>
  );
}

const MGMT: Record<SubscriptionManagement, { tone: string; label: string }> = {
  unmanaged: { tone: 'bg-muted text-muted-foreground', label: 'Unmanaged' },
  manual: { tone: 'bg-status-warning-muted text-status-warning', label: 'Manual / superuser override' },
  provider: { tone: 'bg-status-info-muted text-status-info', label: 'Provider managed' },
};

/** How a subscription is administered — the commercial-readiness distinction (spec §18). */
export function ManagementBadge({ management, className }: { management: SubscriptionManagement; className?: string }) {
  const m = MGMT[management];
  return <Badge className={cn(m.tone, className)}>{m.label}</Badge>;
}
