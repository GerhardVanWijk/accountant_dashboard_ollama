import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock, Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useEmp501Report } from '../hooks/useEmp501Report';
import { getSarsTaxYear } from '../utils/sarsTaxYear';

/**
 * Bi-annual EMP501 reconciliation — a full SARS tax year's (1 March-end
 * February) monthly PAYE/UIF/SDL totals side by side, so a shortfall in
 * any one month is visible before the submission. Route `/payroll/emp501`.
 * Real `useEmp501Report()`/`emp501Service` output only — see that
 * service's doc comment: this computes the figures an employer must
 * prepare, it does not submit anything to SARS. Re-skinned onto v0's
 * PageHeader/SectionCard/FigureBlock (M13); no PAYE/UIF/SDL math here.
 */
export function Emp501Page() {
  const [taxYearStartYear, setTaxYearStartYear] = useState(getSarsTaxYear().start.getUTCFullYear());
  const taxYear = useMemo(() => getSarsTaxYear(new Date(Date.UTC(taxYearStartYear, 5, 1))), [taxYearStartYear]);

  const { report, loading, error, refetch } = useEmp501Report(taxYear);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="EMP501 reconciliation"
        description={`Monthly PAYE/UIF/SDL totals across the ${taxYear.label} SARS tax year, from real posted payroll runs.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTaxYearStartYear((y) => y - 1)}>
              <ChevronLeft data-icon="inline-start" />
              Prior Year
            </Button>
            <span className="text-sm font-medium">{taxYear.label}</span>
            <Button variant="outline" size="sm" onClick={() => setTaxYearStartYear((y) => y + 1)}>
              Next Year
              <ChevronRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" size="sm" onClick={refetch}>
              Refresh
            </Button>
          </div>
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Computing EMP501 reconciliation…</span>
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
              <FigureBlock label="PAYE" value={formatCurrency(report.totals.paye)} />
              <FigureBlock label="UIF (Employee + Employer)" value={formatCurrency(report.totals.uifEmployee + report.totals.uifEmployer)} />
              <FigureBlock label="SDL" value={formatCurrency(report.totals.sdl)} />
              <FigureBlock label="Total Statutory Liability" value={formatCurrency(report.totals.statutoryLiability)} tone="warning" />
            </div>
          </SectionCard>

          <SectionCard>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Month</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">PAYE</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">UIF - Employee</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">UIF - Employer</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">SDL</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Liability</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((month) => (
                    <tr key={month.monthStart} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-2.5">{month.monthLabel}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        <Amount value={month.paye} plain className="text-sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        <Amount value={month.uifEmployee} plain className="text-sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        <Amount value={month.uifEmployer} plain className="text-sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        <Amount value={month.sdl} plain className="text-sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">
                        <Amount value={month.statutoryLiability} plain className="text-sm font-semibold" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted-foreground">{month.runCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
