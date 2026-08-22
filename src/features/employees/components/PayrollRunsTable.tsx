import type { PayrollRun, PayrollRunStatus } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { PAYROLL_RUN_STATUS_LABELS } from '../constants';

const STATUS_STYLES: Record<PayrollRunStatus, string> = {
  draft: 'bg-text-muted/10 text-text-secondary',
  posted: 'bg-positive/10 text-positive',
};

export interface PayrollRunsTableProps {
  runs: PayrollRun[];
  onView: (run: PayrollRun) => void;
  onDelete: (run: PayrollRun) => void;
}

export function PayrollRunsTable({ runs, onView, onDelete }: PayrollRunsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[780px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Run #</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Pay Period</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Pay Date</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Employees</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Net Pay</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const netPay = run.payslips.reduce((sum, p) => sum + p.netPay, 0);
            return (
              <tr key={run.id} className="border-t border-border hover:bg-background">
                <td className="whitespace-nowrap px-md py-sm font-mono text-text-primary">{run.runNumber}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">
                  {run.payPeriodStart} – {run.payPeriodEnd}
                </td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{run.payDate}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums text-text-primary">{run.payslips.length}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums font-semibold">
                  <FinancialNumber value={netPay} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <span className={cn('inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium', STATUS_STYLES[run.status])}>
                    {PAYROLL_RUN_STATUS_LABELS[run.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <div className="flex justify-end gap-sm">
                    <button type="button" onClick={() => onView(run)} className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline">
                      {run.status === 'draft' ? 'Review' : 'View'}
                    </button>
                    {run.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onDelete(run)}
                        className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
