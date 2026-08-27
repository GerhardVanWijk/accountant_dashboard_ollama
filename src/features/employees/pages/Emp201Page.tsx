import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock, Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
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
    <SectionCard
      title={label}
      actions={
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', check.isReconciled ? 'bg-status-positive/15 text-status-positive' : 'bg-destructive/15 text-destructive')}>
          {check.isReconciled ? 'Reconciled' : 'Variance detected'}
        </span>
      }
    >
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">GL Posted This Period</dt>
          <dd className="mt-1">
            <Amount value={check.controlAccountMovement} plain className="text-sm" />
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Return Total</dt>
          <dd className="mt-1">
            <Amount value={check.reportTotal} plain className="text-sm" />
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Variance</dt>
          <dd className="mt-1">
            <Amount value={check.variance} plain className={cn('text-sm', !check.isReconciled && 'font-semibold text-destructive')} />
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}

/**
 * Monthly EMP201-shaped statutory payroll return for a chosen month — real
 * `useEmp201Report()`/`emp201Service` output: PAYE, UIF (employee +
 * employer), and SDL from real posted payroll runs, plus a reconciliation
 * against what was actually posted to each of the four payroll liability
 * control accounts. Deliberately NOT labelled with official SARS EMP201
 * field numbers, and does not submit anything to SARS — see
 * `emp201Service.ts`'s doc comment. Route `/payroll/emp201`. Re-skinned
 * onto v0's PageHeader/SectionCard/FigureBlock (M13); no PAYE/UIF/SDL math
 * performed here.
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="EMP201 monthly return"
        description="PAYE/UIF/SDL summary for the selected period, from real posted payroll runs."
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Period</span>
              <input
                type="month"
                aria-label="EMP201 period"
                value={monthInputValue(periodStart)}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <Button variant="outline" onClick={refetch}>
              Refresh
            </Button>
          </div>
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Computing EMP201 return…</span>
        </div>
      )}
      {!loading && error && (
        <SectionCard>
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
          <Button variant="outline" className="mt-3" onClick={refetch}>
            Retry
          </Button>
        </SectionCard>
      )}

      {!loading && !error && report && (
        <>
          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock label="PAYE" value={formatCurrency(report.paye)} />
              <FigureBlock label="UIF (Employee + Employer)" value={formatCurrency(report.totalUif)} />
              <FigureBlock label="SDL" value={formatCurrency(report.sdl)} />
              <FigureBlock label="Statutory Liability Due" value={formatCurrency(report.statutoryLiability)} tone="warning" />
            </div>
          </SectionCard>

          <SectionCard title="Detail">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">UIF - Employee</dt>
                <dd className="mt-1">
                  <Amount value={report.uifEmployee} plain className="text-sm" />
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">UIF - Employer</dt>
                <dd className="mt-1">
                  <Amount value={report.uifEmployer} plain className="text-sm" />
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Employees Paid</dt>
                <dd className="figure mt-1 text-sm tabular-nums">{report.employeeCount}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Payroll Runs Posted</dt>
                <dd className="figure mt-1 text-sm tabular-nums">{report.runCount}</dd>
              </div>
            </dl>
          </SectionCard>

          {reconciliation && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-semibold">GL Reconciliation</h2>
                <p className="text-sm text-muted-foreground">
                  Confirms what was actually posted to the PAYE/UIF/SDL control accounts this period matches this
                  return (each statutory type reconciled separately, never combined).
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
