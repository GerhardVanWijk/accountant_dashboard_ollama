import { SectionCard } from '@/components/app/page-header';
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
 * Re-skinned onto v0's SectionCard/Badge tokens; the reconciliation math
 * (reconcileAccountsReceivable/Payable) is unchanged. A non-zero variance
 * is a real discrepancy between the GL and the subledger, never hidden or
 * silently corrected.
 */
export function SubledgerReconciliationCard({ label, reconciliation }: SubledgerReconciliationCardProps) {
  const { controlAccountBalance, subledgerTotal, variance, isReconciled } = reconciliation;

  return (
    <SectionCard
      title={label}
      actions={
        <Badge variant="outline" className={cn(isReconciled ? 'text-status-positive' : 'text-status-negative')}>
          {isReconciled ? 'Reconciled' : 'Variance detected'}
        </Badge>
      }
    >
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">GL control account</dt>
          <dd className="mt-1">
            <Amount value={controlAccountBalance} />
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Subledger total</dt>
          <dd className="mt-1">
            <Amount value={subledgerTotal} />
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Variance</dt>
          <dd className={cn('mt-1', !isReconciled && 'font-semibold text-negative')}>
            <Amount value={variance} />
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}
