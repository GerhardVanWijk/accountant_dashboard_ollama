import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency } from '@/utils/formatFinancial';
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
 * this period's GL data (see cashFlowStatementService.ts's module doc
 * comment on working-capital scope) — it is not silently assumed away.
 */
export function ReconciliationCheck({ statement }: ReconciliationCheckProps) {
  const toneClass = statement.reconciles
    ? 'border-positive/40 bg-positive/10 text-positive'
    : 'border-negative/40 bg-negative/10 text-negative';

  return (
    <div className={`rounded-md border p-md ${toneClass}`} role="status">
      <div className="flex items-center gap-xs text-sm font-semibold">
        <Icon name={statement.reconciles ? 'reconciliation' : 'error'} size={16} />
        {statement.reconciles ? 'Reconciles to actual cash movement' : 'Does not reconcile — investigate'}
      </div>
      <div className="mt-sm grid grid-cols-1 gap-sm tabular-nums sm:grid-cols-3">
        <div>
          <p className="text-xs text-text-secondary">Net Cash Movement (Operating + Investing + Financing)</p>
          <FinancialNumber value={statement.netCashMovement} format={formatCurrency} showFlash={false} className="text-lg" />
        </div>
        <div>
          <p className="text-xs text-text-secondary">Actual Cash and Bank Movement</p>
          <FinancialNumber value={statement.actualCashMovement} format={formatCurrency} showFlash={false} className="text-lg" />
        </div>
        <div>
          <p className="text-xs text-text-secondary">Variance</p>
          <FinancialNumber value={statement.variance} format={formatCurrency} showFlash={false} className="text-lg" />
        </div>
      </div>
    </div>
  );
}
