import { Card } from '@/components/ui/Card';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import type { SubledgerReconciliation } from '../services/subledgerReconciliation';

interface SubledgerReconciliationCardProps {
  label: string;
  reconciliation: SubledgerReconciliation;
}

/**
 * One control-account-vs-subledger comparison — Accounts Receivable or
 * Accounts Payable — per SA_ACCOUNTING_MASTER_SPEC.md §17/§18/§70/§71.
 * A non-zero variance is a real discrepancy between the GL and the
 * subledger, never hidden or silently corrected (§40's suspense-account
 * principle applied here: surface it, don't paper over it).
 */
export function SubledgerReconciliationCard({ label, reconciliation }: SubledgerReconciliationCardProps) {
  const { controlAccountBalance, subledgerTotal, variance, isReconciled } = reconciliation;

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <span
          className={cn(
            'rounded-full px-sm py-0.5 text-xs font-semibold',
            isReconciled ? 'bg-positive/10 text-positive' : 'bg-danger/10 text-danger',
          )}
        >
          {isReconciled ? 'Reconciled' : 'Variance detected'}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-sm text-sm">
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">GL Control Account</dt>
          <dd className="mt-xs font-mono tabular-nums">
            <FinancialNumber value={controlAccountBalance} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">Subledger Total</dt>
          <dd className="mt-xs font-mono tabular-nums">
            <FinancialNumber value={subledgerTotal} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">Variance</dt>
          <dd className={cn('mt-xs font-mono tabular-nums', !isReconciled && 'text-danger font-semibold')}>
            <FinancialNumber value={variance} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
      </dl>
    </Card>
  );
}
