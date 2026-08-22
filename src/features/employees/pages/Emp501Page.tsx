import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatCurrency } from '@/utils/formatFinancial';
import { useEmp501Report } from '../hooks/useEmp501Report';
import { getSarsTaxYear } from '../utils/sarsTaxYear';

/**
 * Bi-annual EMP501 reconciliation — a full SARS tax year's (1 March-end
 * February, §59) monthly PAYE/UIF/SDL totals side by side, so a shortfall
 * in any one month is visible before the submission. Route
 * `/payroll/emp501` (docs/ROUTES.md). See emp501Service.ts's doc comment —
 * this computes the figures an employer must prepare, it does not submit
 * anything to SARS.
 */
export function Emp501Page() {
  const [taxYearStartYear, setTaxYearStartYear] = useState(getSarsTaxYear().start.getUTCFullYear());
  const taxYear = useMemo(() => getSarsTaxYear(new Date(Date.UTC(taxYearStartYear, 5, 1))), [taxYearStartYear]);

  const { report, loading, error, refetch } = useEmp501Report(taxYear);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">EMP501 Reconciliation</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Monthly PAYE/UIF/SDL totals across the {taxYear.label} SARS tax year, from real posted payroll runs.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <Button variant="ghost" onClick={() => setTaxYearStartYear((y) => y - 1)}>
            ◀ Prior Year
          </Button>
          <span className="text-sm font-medium text-text-primary">{taxYear.label}</span>
          <Button variant="ghost" onClick={() => setTaxYearStartYear((y) => y + 1)}>
            Next Year ▶
          </Button>
          <Button variant="ghost" onClick={refetch}>
            Refresh
          </Button>
        </div>
      </div>

      {loading && <Spinner label="Computing EMP501 reconciliation…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">PAYE</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.totals.paye} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">UIF (Employee + Employer)</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.totals.uifEmployee + report.totals.uifEmployer} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">SDL</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.totals.sdl} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Total Statutory Liability</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.totals.statutoryLiability} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-background">
                  <tr>
                    <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Month</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">PAYE</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">UIF - Employee</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">UIF - Employer</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">SDL</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Liability</th>
                    <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((month) => (
                    <tr key={month.monthStart} className="border-t border-border/50">
                      <td className="whitespace-nowrap px-md py-sm text-text-primary">{month.monthLabel}</td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                        <FinancialNumber value={month.paye} format={formatCurrency} showFlash={false} />
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                        <FinancialNumber value={month.uifEmployee} format={formatCurrency} showFlash={false} />
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                        <FinancialNumber value={month.uifEmployer} format={formatCurrency} showFlash={false} />
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                        <FinancialNumber value={month.sdl} format={formatCurrency} showFlash={false} />
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums font-semibold">
                        <FinancialNumber value={month.statutoryLiability} format={formatCurrency} showFlash={false} />
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums text-text-secondary">{month.runCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
