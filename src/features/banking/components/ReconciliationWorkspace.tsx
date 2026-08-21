import { useState } from 'react';
import { format } from 'date-fns';
import type { BankAccount } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { formatZAR } from '../utils/formatZAR';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface ReconciliationWorkspaceProps {
  bankAccount: BankAccount;
  onFinalized?: () => void;
}

/**
 * Interactive bank reconciliation workspace: compares Bank Statement
 * Balance vs GL Cashbook Balance, lists outstanding/unpresented payments
 * and uncleared deposits, flags unallocated items, and shows a real-time
 * variance indicator. The Finalize button is disabled client-side whenever
 * variance ≠ 0 or an item still needs allocation — but the real
 * enforcement is in BankReconciliationService.finalizeReconciliation,
 * which independently re-derives the summary and throws before writing
 * anything (docs/HIVE_TASKS.md's Banking entry).
 */
export function ReconciliationWorkspace({ bankAccount, onFinalized }: ReconciliationWorkspaceProps) {
  const {
    statementDate,
    setStatementDate,
    statementBalance,
    setStatementBalance,
    clearedIds,
    toggleCleared,
    summary,
    isLoading,
    isFinalizing,
    error,
    finalize,
  } = useBankReconciliation(bankAccount.id);

  const [notes, setNotes] = useState('');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const outstanding = summary
    ? [...summary.unclearedDeposits, ...summary.unpresentedPayments].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const canFinalize = Boolean(summary?.isBalanced) && (summary?.unallocatedItems.length ?? 1) === 0 && clearedIds.size > 0;

  async function handleFinalize() {
    setFinalizeError(null);
    try {
      await finalize(notes || undefined);
      setNotes('');
      onFinalized?.();
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : 'Could not finalize reconciliation.');
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <Card className="grid grid-cols-1 gap-md md:grid-cols-3">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Statement Date</span>
          <input
            type="date"
            className={inputClass}
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Bank Statement Closing Balance</span>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={statementBalance || ''}
            onChange={(e) => setStatementBalance(parseFloat(e.target.value) || 0)}
          />
        </label>
        <div className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">GL Cashbook Balance</span>
          <div className={`${inputClass} bg-background`}>
            {summary ? <FinancialNumber value={summary.glCashbookBalance} format={formatZAR} showFlash /> : '—'}
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {error.message}
        </p>
      )}

      {isLoading && <p className="text-sm text-text-secondary">Calculating…</p>}

      {summary && (
        <Card
          className={`flex flex-col gap-sm border-2 ${
            summary.isBalanced ? 'border-positive bg-positive/5' : 'border-negative bg-negative/5'
          }`}
        >
          <div className="flex items-center gap-sm">
            <Icon name={summary.isBalanced ? 'reconciliation' : 'error'} className={summary.isBalanced ? 'text-positive' : 'text-negative'} size={22} />
            <span className={`text-lg font-semibold ${summary.isBalanced ? 'text-positive' : 'text-negative'}`}>
              {summary.isBalanced ? 'Balanced — ready to finalize' : 'Out of balance'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-sm text-sm md:grid-cols-4">
            <SummaryStat label="Uncleared Deposits" value={summary.unclearedDepositsTotal} count={summary.unclearedDeposits.length} />
            <SummaryStat label="Unpresented Payments" value={-summary.unpresentedPaymentsTotal} count={summary.unpresentedPayments.length} />
            <SummaryStat label="Adjusted Bank Balance" value={summary.adjustedBankBalance} />
            <SummaryStat label="Variance" value={summary.variance} emphasize />
          </div>
          {summary.unallocatedItems.length > 0 && (
            <p className="rounded-md bg-warning-financial/15 px-sm py-xs text-xs text-warning-financial">
              {summary.unallocatedItems.length} transaction(s) still need a GL allocation before they can be cleared —
              allocate them from the Bank Transactions page first.
            </p>
          )}
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[40px_100px_1.6fr_130px_120px_140px] gap-3 border-b border-border bg-background px-4 py-3 text-xs font-semibold text-text-secondary">
            <span>Clear</span>
            <span>Date</span>
            <span>Description</span>
            <span>Reference</span>
            <span className="text-right">Amount</span>
            <span>Type</span>
          </div>
          {outstanding.map((txn) => {
            const unallocated = txn.allocations.length === 0 && !txn.transferPairId;
            const signed = txn.direction === 'credit' ? -txn.amount : txn.amount;
            return (
              <div
                key={txn.id}
                className="grid grid-cols-[40px_100px_1.6fr_130px_120px_140px] gap-3 border-b border-border/50 px-4 py-3 text-sm tabular-nums"
              >
                <input
                  type="checkbox"
                  aria-label={`Mark ${txn.description} as cleared`}
                  checked={clearedIds.has(txn.id)}
                  disabled={unallocated}
                  onChange={() => toggleCleared(txn.id)}
                  className="h-4 w-4"
                />
                <span className="text-text-secondary">{format(new Date(txn.date), 'dd MMM yy')}</span>
                <span className="text-text-primary">
                  {txn.description}
                  {unallocated && (
                    <span className="ml-2 rounded-full bg-warning-financial/20 px-2 py-0.5 text-xs font-semibold text-warning-financial">
                      Needs allocation
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-text-secondary">{txn.reference ?? '—'}</span>
                <span className="text-right">
                  <FinancialNumber value={signed} format={formatZAR} showFlash={false} />
                </span>
                <span className="text-text-secondary">{txn.direction === 'debit' ? 'Uncleared deposit' : 'Unpresented payment'}</span>
              </div>
            );
          })}
          {outstanding.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              No outstanding items up to this statement date — everything is already cleared.
            </div>
          )}
        </div>
      </div>

      <Card className="flex flex-col gap-sm">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Notes (optional)</span>
          <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {finalizeError && (
          <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
            {finalizeError}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-secondary">
            {canFinalize
              ? `${clearedIds.size} transaction(s) will be marked reconciled.`
              : 'Select cleared items and reach a zero variance to finalize.'}
          </p>
          <Button variant="primary" disabled={!canFinalize || isFinalizing} onClick={() => void handleFinalize()}>
            {isFinalizing ? 'Finalizing…' : 'Finalize Reconciliation'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  count,
  emphasize,
}: {
  label: string;
  value: number;
  count?: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-panel px-sm py-xs">
      <div className="text-xs text-text-muted">
        {label}
        {count !== undefined ? ` (${count})` : ''}
      </div>
      <FinancialNumber
        value={value}
        format={formatZAR}
        showFlash={false}
        className={emphasize ? 'text-base font-semibold' : 'text-sm'}
      />
    </div>
  );
}
