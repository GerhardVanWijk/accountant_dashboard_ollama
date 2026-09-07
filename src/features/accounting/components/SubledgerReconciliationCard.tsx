import { Amount } from '@/components/app/figure';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import type { SubledgerReconciliation } from '../services/subledgerReconciliation';

interface SubledgerReconciliationCardProps {
  label: string;
  reconciliation: SubledgerReconciliation;
}

/**
 * One control-account-vs-subledger comparison — Accounts Receivable or
 * Accounts Payable — per SA_ACCOUNTING_MASTER_SPEC.md §17/§18/§70/§71.
 * The reconciliation math (reconcileAccountsReceivable/Payable) is
 * unchanged. A non-zero variance is a real discrepancy between the GL and
 * the subledger, never hidden or silently corrected — it gets a coloured
 * card edge, a "Variance detected" badge and a promoted figure.
 */
export function SubledgerReconciliationCard({ label, reconciliation }: SubledgerReconciliationCardProps) {
  const { controlAccountBalance, subledgerTotal, variance, isReconciled } = reconciliation;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card',
        isReconciled ? 'border-border' : 'border-status-negative-outline',
      )}
    >
      <div className={cn('h-1', isReconciled ? 'bg-status-positive' : 'bg-status-negative')} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Badge
          className={cn(
            'gap-1',
            isReconciled
              ? 'bg-status-positive-muted text-status-positive'
              : 'bg-status-negative-muted text-status-negative',
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {isReconciled ? 'Reconciled' : 'Variance detected'}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        <div>
          <dt className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
            GL control account
          </dt>
          <dd className="mt-1 text-sm">
            <Amount value={controlAccountBalance} />
          </dd>
        </div>
        <div>
          <dt className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Subledger total
          </dt>
          <dd className="mt-1 text-sm">
            <Amount value={subledgerTotal} />
          </dd>
        </div>
        <div
          className={cn(
            'col-span-2 rounded-lg px-3 py-2',
            isReconciled ? 'bg-muted/50' : 'bg-status-negative-surface/70',
          )}
        >
          <dt className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">Variance</dt>
          <dd
            className={cn(
              'mt-0.5',
              isReconciled ? 'text-sm text-foreground' : 'text-lg font-bold text-status-negative',
            )}
          >
            <Amount value={variance} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
