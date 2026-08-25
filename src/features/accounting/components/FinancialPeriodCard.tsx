import { CircleCheck, CircleDot, Lock, PencilLine } from 'lucide-react';
import type { AccountingPeriod, AccountingPeriodStatus } from '@/types';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';

const periodMeta: Record<AccountingPeriodStatus, { icon: typeof Lock; note: string }> = {
  open: { icon: PencilLine, note: 'Available for posting' },
  soft_closed: { icon: PencilLine, note: 'Soft closed — reopen to post' },
  closed: { icon: CircleCheck, note: 'Reconciled — reopen to adjust' },
  locked: { icon: Lock, note: 'Locked after sign-off' },
};

export interface FinancialPeriodCardProps {
  period: AccountingPeriod;
  /** True if this period's date range contains today — derived via the
   * existing findPeriodForDate() lookup, not a stored field. */
  isCurrent: boolean;
  onClose: () => void;
  onLock: () => void;
  onReopen: () => void;
  busy: boolean;
}

/** One accounting period, re-skinned onto v0's card language. Actions map 1:1 to AccountingPeriodService's real transitions — no client-side status logic. */
export function FinancialPeriodCard({ period, isCurrent, onClose, onLock, onReopen, busy }: FinancialPeriodCardProps) {
  const meta = periodMeta[period.status];
  const Icon = meta.icon;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        isCurrent ? 'border-brand/40 bg-brand-muted/20' : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isCurrent ? (
            <CircleDot className="size-4 text-brand" aria-hidden="true" />
          ) : (
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <h3 className="font-medium">{period.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isCurrent && (
            <span className="rounded-full bg-info/15 px-2 py-0.5 text-xs font-medium text-info">Current</span>
          )}
          <StatusBadge status={period.status} />
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          {formatDate(period.startDate)} &ndash; {formatDate(period.endDate)}
        </span>
        <span>{meta.note}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {period.status === 'open' && (
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              Close period
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={onLock}>
              Lock period
            </Button>
          </>
        )}
        {period.status !== 'open' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onReopen}>
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}
