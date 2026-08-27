import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';
import type { CashFlowStatement } from '../services';

export interface ReconciliationCheckProps {
  statement: CashFlowStatement;
}

/**
 * Surfaces the internal correctness signal plainly rather than burying it in
 * a test: Operating + Investing + Financing (netCashMovement) is compared,
 * side by side, against the independently-computed net movement on Cash and
 * Bank (actualCashMovement) for the same period. A variance means the three
 * classified sections above did not capture every real cash movement in
 * this period's GL data — it is not silently assumed away. Re-skinned onto
 * v0's visual language (M9); the comparison itself is unchanged.
 */
export function ReconciliationCheck({ statement }: ReconciliationCheckProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-4 py-3',
        statement.reconciles ? 'border-status-positive-outline bg-status-positive-surface' : 'border-destructive/30 bg-destructive/10',
      )}
    >
      <div className={cn('flex items-center gap-2 text-sm font-semibold', statement.reconciles ? 'text-status-positive' : 'text-destructive')}>
        {statement.reconciles ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <TriangleAlert className="size-4" aria-hidden="true" />}
        {statement.reconciles ? 'Reconciles to actual cash movement' : 'Does not reconcile — investigate'}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Net Cash Movement (Operating + Investing + Financing)</p>
          <Amount value={statement.netCashMovement} statement className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Actual Cash and Bank Movement</p>
          <Amount value={statement.actualCashMovement} statement className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Variance</p>
          <Amount value={statement.variance} statement className="text-lg font-semibold" />
        </div>
      </div>
    </div>
  );
}
