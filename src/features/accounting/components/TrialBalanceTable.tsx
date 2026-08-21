import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import type { TrialBalance } from '../services';

export interface TrialBalanceTableProps {
  trialBalance: TrialBalance;
}

/** Renders journalEntryService.computeTrialBalance() — no math happens here. */
export function TrialBalanceTable({ trialBalance }: TrialBalanceTableProps) {
  const { rows, totalDebits, totalCredits, balanced } = trialBalance;

  return (
    <div className="flex flex-col gap-md">
      <div
        role="status"
        className={cn(
          'flex items-center gap-sm rounded-md border px-md py-sm text-sm font-medium',
          balanced ? 'border-success bg-success/20 text-positive' : 'border-danger bg-danger/20 text-negative',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 rounded-full', balanced ? 'bg-positive' : 'bg-negative')}
        />
        {balanced ? 'Balanced — total debits equal total credits.' : 'Out of balance — investigate before reporting.'}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="grid grid-cols-[100px_1fr_140px_140px] gap-2 border-b border-border bg-background px-md py-sm tabular-nums text-xs font-semibold uppercase tracking-wide text-text-secondary">
          <FinancialTableCell type="label">Code</FinancialTableCell>
          <FinancialTableCell type="label">Account</FinancialTableCell>
          <FinancialTableCell type="number">Debit</FinancialTableCell>
          <FinancialTableCell type="number">Credit</FinancialTableCell>
        </div>
        {rows.map((row) => (
          <div
            key={row.accountId}
            className="grid grid-cols-[100px_1fr_140px_140px] gap-2 border-b border-border px-md py-sm tabular-nums text-sm last:border-0"
          >
            <FinancialTableCell type="label" className="font-mono">
              {row.code}
            </FinancialTableCell>
            <FinancialTableCell type="label">{row.name}</FinancialTableCell>
            <FinancialTableCell type="number">
              {row.debit > 0 ? <FinancialNumber value={row.debit} format={formatCurrency} showFlash={false} /> : '—'}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              {row.credit > 0 ? <FinancialNumber value={row.credit} format={formatCurrency} showFlash={false} /> : '—'}
            </FinancialTableCell>
          </div>
        ))}
        <div className="grid grid-cols-[100px_1fr_140px_140px] gap-2 border-t-2 border-border bg-background px-md py-sm tabular-nums text-sm font-semibold">
          <FinancialTableCell type="label"> </FinancialTableCell>
          <FinancialTableCell type="label">Total</FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totalDebits} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totalCredits} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
        </div>
      </div>
    </div>
  );
}
