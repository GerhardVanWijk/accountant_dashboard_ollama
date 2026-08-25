import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useVatReport } from '../hooks/useVatReport';
import { VatTransactionsTable } from '../components/VatTransactionsTable';
import type { VatControlAccountCheck, VatTreatmentBreakdown } from '../services/vatReportService';
import { treatmentLabels } from '../utils/treatmentLabels';

function monthInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0));
}

function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

function BreakdownTable({ title, rows, emptyLabel }: { title: string; rows: VatTreatmentBreakdown[]; emptyLabel: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Treatment</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Tax Base</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">VAT Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.treatment} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-2.5">{treatmentLabels[row.treatment]}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.taxBase)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(row.vatAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReconciliationCard({ label, check }: { label: string; check: VatControlAccountCheck }) {
  return (
    <SectionCard
      title={label}
      actions={
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', check.isReconciled ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative')}>
          {check.isReconciled ? 'Reconciled' : 'Variance detected'}
        </span>
      }
    >
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">GL Posted This Period</dt>
          <dd className="mt-1 font-mono tabular-nums">{formatCurrency(check.controlAccountMovement)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Report Total</dt>
          <dd className="mt-1 font-mono tabular-nums">{formatCurrency(check.reportTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Variance</dt>
          <dd className={cn('mt-1 font-mono tabular-nums', !check.isReconciled && 'font-semibold text-negative')}>{formatCurrency(check.variance)}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}

/**
 * VAT summary for a chosen month — re-skinned onto v0's VAT page (M7),
 * same real data underneath: Output VAT (posted Invoices, net of issued
 * Credit Notes), Input VAT (posted Bills, excluding non-deductible
 * amounts), Net VAT Payable/Refundable, a GL reconciliation, and now (new
 * in M7) the real posted documents behind those totals — reusing
 * `vatReportService.listVatTransactions()`, not a second calculation.
 *
 * Deliberately NOT labelled with official SARS VAT201 box numbers or a
 * persisted "period status" (v0's mock has both) — see
 * `vatReportService.ts`'s doc comment: this codebase has no independently-
 * verified VAT201 box mapping, and VAT periods here are date boundaries,
 * not a persisted, submittable entity (no filing/submission concept
 * exists anywhere in this app). Route `/tax/vat-return` (docs/ROUTES.md).
 */
export function VatReturnPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const periodStart = useMemo(() => startOfMonth(year, month), [year, month]);
  const periodEnd = useMemo(() => endOfMonth(year, month), [year, month]);

  const { report, reconciliation, transactions, loading, error, refetch } = useVatReport(periodStart, periodEnd);

  function handleMonthChange(value: string) {
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return;
    setYear(y);
    setMonth(m - 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="VAT"
        description="Output VAT charged on sales less input VAT claimed on purchases, for real posted documents only — not a submitted SARS return."
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Period</span>
              <input
                type="month"
                aria-label="VAT period"
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
          <span className="text-sm">Computing VAT report…</span>
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
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Output VAT" value={formatCurrency(report.outputVat.total)} hint="Charged on sales" />
              <FigureBlock
                label="Input VAT (claimable)"
                value={formatCurrency(report.inputVat.total)}
                hint={report.inputVat.nonDeductibleTotal > 0 ? `+${formatCurrency(report.inputVat.nonDeductibleTotal)} paid but not claimable` : 'Claimed on purchases'}
              />
              <FigureBlock
                label={report.netVatPayable >= 0 ? 'Net VAT payable' : 'Net VAT refundable'}
                value={formatCurrency(Math.abs(report.netVatPayable))}
                hint="Output less input VAT"
                tone={report.netVatPayable >= 0 ? 'warning' : 'positive'}
              />
            </div>
          </SectionCard>

          {report.unresolvedLineCount > 0 && (
            <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
              {report.unresolvedLineCount} line item{report.unresolvedLineCount === 1 ? '' : 's'} could not be matched to a known tax rate and{' '}
              {report.unresolvedLineCount === 1 ? 'was' : 'were'} excluded from this report — check for a deleted or incorrectly-referenced tax code.
            </p>
          )}

          <SectionCard title="VAT by treatment">
            <div className="flex flex-col gap-6">
              <BreakdownTable title="Output VAT" rows={report.outputVat.byTreatment} emptyLabel="No output VAT this period." />
              <BreakdownTable title="Input VAT (claimable only)" rows={report.inputVat.byTreatment} emptyLabel="No input VAT this period." />
            </div>
          </SectionCard>

          {reconciliation && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-semibold">GL Reconciliation</h2>
                <p className="text-sm text-muted-foreground">Confirms what was actually posted to the VAT Output/Input control accounts this period matches this report.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ReconciliationCard label="VAT Output" check={reconciliation.outputVat} />
                <ReconciliationCard label="VAT Input" check={reconciliation.inputVat} />
              </div>
            </div>
          )}

          <SectionCard title="Supporting transactions" description="Every real posted document that contributed VAT this period.">
            <VatTransactionsTable transactions={transactions} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
