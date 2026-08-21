import { format } from 'date-fns';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Icon } from '@/components/ui/Icon';
import type { BankReconciliation } from '../types';
import { formatZAR } from '../utils/formatZAR';

export interface ReconciliationHistoryProps {
  history: BankReconciliation[];
}

/**
 * Immutable reconciliation-history list — every row here is a finalized
 * BankReconciliation snapshot (docs/LEDGER_ARCHITECTURE.md-style append-
 * only pattern: IBankReconciliationRepository has no update()/delete()),
 * shown with its finalize audit timestamp. Nothing in this UI can edit a
 * past reconciliation.
 */
export function ReconciliationHistory({ history }: ReconciliationHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-lg text-center text-sm text-text-muted">
        No finalized reconciliations yet for this account.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[120px_130px_130px_130px_100px_1fr] gap-3 border-b border-border bg-background px-4 py-3 text-xs font-semibold text-text-secondary">
          <span>Statement Date</span>
          <span className="text-right">Statement Balance</span>
          <span className="text-right">GL Cashbook Balance</span>
          <span className="text-right">Variance</span>
          <span>Cleared Items</span>
          <span>Finalized</span>
        </div>
        {history.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[120px_130px_130px_130px_100px_1fr] gap-3 border-b border-border/50 px-4 py-3 text-sm tabular-nums"
          >
            <span className="text-text-primary">{format(new Date(r.statementDate), 'dd MMM yyyy')}</span>
            <span className="text-right">
              <FinancialNumber value={r.statementBalance} format={formatZAR} showFlash={false} />
            </span>
            <span className="text-right">
              <FinancialNumber value={r.glCashbookBalance} format={formatZAR} showFlash={false} />
            </span>
            <span className="text-right text-positive">
              <Icon name="reconciliation" size={12} className="mr-1 inline" />
              <FinancialNumber value={r.variance} format={formatZAR} showFlash={false} className="text-positive" />
            </span>
            <span className="text-text-secondary">{r.clearedTransactionIds.length}</span>
            <span className="text-xs text-text-secondary">
              {format(new Date(r.finalizedAt), "dd MMM yyyy 'at' HH:mm")} by {r.finalizedByUserId}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
