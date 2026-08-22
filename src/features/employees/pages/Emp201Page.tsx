import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { useEmp201Report } from '../hooks/useEmp201Report';
import type { PayrollControlAccountCheck } from '../services';

function monthInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0));
}

function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

function ReconciliationCard({ label, check }: { label: string; check: PayrollControlAccountCheck }) {
  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <span
          className={cn(
            'rounded-full px-sm py-0.5 text-xs font-semibold',
            check.isReconciled ? 'bg-positive/10 text-positive' : 'bg-danger/10 text-danger',
          )}
        >
          {check.isReconciled ? 'Reconciled' : 'Variance detected'}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-sm text-sm">
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">GL Posted This Period</dt>
          <dd className="mt-xs font-mono tabular-nums">
            <FinancialNumber value={check.controlAccountMovement} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">Return Total</dt>
          <dd className="mt-xs font-mono tabular-nums">
            <FinancialNumber value={check.reportTotal} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted uppercase tracking-wide">Variance</dt>
          <dd className={cn('mt-xs font-mono tabular-nums', !check.isReconciled && 'text-danger font-semibold')}>
            <FinancialNumber value={check.variance} format={formatCurrency} showFlash={false} />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/**
 * Monthly EMP201-shaped statutory payroll return for a chosen month — PAYE,
 * UIF (employee + employer), and SDL from real posted payroll runs, plus a
 * reconciliation against what was actually posted to each of the four
 * payroll liability control accounts. Deliberately NOT labelled with
 * official SARS EMP201 field numbers — see emp201Service.ts's doc comment.
 * Route `/payroll/emp201` (docs/ROUTES.md).
 */
export function Emp201Page() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const periodStart = useMemo(() => startOfMonth(year, month), [year, month]);
  const periodEnd = useMemo(() => endOfMonth(year, month), [year, month]);

  const { report, reconciliation, loading, error, refetch } = useEmp201Report(periodStart, periodEnd);

  function handleMonthChange(value: string) {
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return;
    setYear(y);
    setMonth(m - 1);
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">EMP201 Monthly Return</h1>
          <p className="mt-xs text-sm text-text-secondary">PAYE/UIF/SDL summary for the selected period, from real posted payroll runs.</p>
        </div>
        <div className="flex items-center gap-sm">
          <label className="flex flex-col gap-xs text-sm">
            <span className="sr-only">Period</span>
            <input
              type="month"
              aria-label="EMP201 period"
              className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={monthInputValue(periodStart)}
              onChange={(e) => handleMonthChange(e.target.value)}
            />
          </label>
          <Button variant="ghost" onClick={refetch}>
            Refresh
          </Button>
        </div>
      </div>

      {loading && <Spinner label="Computing EMP201 return…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">PAYE</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.paye} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">UIF (Employee + Employer)</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.totalUif} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">SDL</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.sdl} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Statutory Liability Due</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.statutoryLiability} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
          </div>

          <Card>
            <h3 className="mb-sm text-sm font-semibold text-text-primary">Detail</h3>
            <dl className="grid grid-cols-2 gap-md text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">UIF - Employee</dt>
                <dd className="mt-xs font-mono tabular-nums">
                  <FinancialNumber value={report.uifEmployee} format={formatCurrency} showFlash={false} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">UIF - Employer</dt>
                <dd className="mt-xs font-mono tabular-nums">
                  <FinancialNumber value={report.uifEmployer} format={formatCurrency} showFlash={false} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Employees Paid</dt>
                <dd className="mt-xs font-mono tabular-nums">{report.employeeCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Payroll Runs Posted</dt>
                <dd className="mt-xs font-mono tabular-nums">{report.runCount}</dd>
              </div>
            </dl>
          </Card>

          {reconciliation && (
            <div>
              <h2 className="mb-sm text-lg font-semibold text-text-primary">GL Reconciliation</h2>
              <p className="mb-md text-sm text-text-secondary">
                Confirms what was actually posted to the PAYE/UIF/SDL control accounts this period matches this
                return (SA_ACCOUNTING_MASTER_SPEC.md §58/§60 — each statutory type reconciled separately, never
                combined).
              </p>
              <div className="grid grid-cols-1 gap-md md:grid-cols-2">
                <ReconciliationCard label="PAYE" check={reconciliation.paye} />
                <ReconciliationCard label="UIF - Employee" check={reconciliation.uifEmployee} />
                <ReconciliationCard label="UIF - Employer" check={reconciliation.uifEmployer} />
                <ReconciliationCard label="SDL" check={reconciliation.sdl} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
