import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { useVatReport } from '../hooks/useVatReport';
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
    <div>
      <h3 className="mb-sm text-sm font-semibold text-text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead className="bg-background">
              <tr>
                <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Treatment</th>
                <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Tax Base</th>
                <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">VAT Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.treatment} className="border-t border-border/50">
                  <td className="whitespace-nowrap px-md py-sm text-text-primary">{treatmentLabels[row.treatment]}</td>
                  <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                    <FinancialNumber value={row.taxBase} format={formatCurrency} showFlash={false} />
                  </td>
                  <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                    <FinancialNumber value={row.vatAmount} format={formatCurrency} showFlash={false} />
                  </td>
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
          <dt className="text-xs text-text-muted uppercase tracking-wide">Report Total</dt>
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
 * VAT summary for a chosen month — Output VAT (from posted Invoices, net
 * of issued Credit Notes) and Input VAT (from posted Bills, excluding
 * non-deductible amounts), Net VAT Payable/Refundable, and a
 * reconciliation against what was actually posted to the VAT Output/
 * Input GL control accounts. Deliberately NOT labelled with official
 * SARS VAT201 box numbers — see vatReportService.ts's doc comment on why
 * (SA_ACCOUNTING_MASTER_SPEC.md §110/§111: no unverified official-form
 * claims). Route `/tax/vat-return` (docs/ROUTES.md).
 */
export function VatReturnPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const periodStart = useMemo(() => startOfMonth(year, month), [year, month]);
  const periodEnd = useMemo(() => endOfMonth(year, month), [year, month]);

  const { report, reconciliation, loading, error, refetch } = useVatReport(periodStart, periodEnd);

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
          <h1 className="text-2xl font-semibold text-text-primary">VAT Return</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Output/Input VAT summary for the selected period, from real posted documents.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <label className="flex flex-col gap-xs text-sm">
            <span className="sr-only">Period</span>
            <input
              type="month"
              aria-label="VAT period"
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

      {loading && <Spinner label="Computing VAT report…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Output VAT</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.outputVat.total} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Input VAT (Claimable)</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.inputVat.total} format={formatCurrency} showFlash={false} />
              </p>
              {report.inputVat.nonDeductibleTotal > 0 && (
                <p className="mt-xs text-xs text-text-muted">
                  +<FinancialNumber value={report.inputVat.nonDeductibleTotal} format={formatCurrency} showFlash={false} /> paid but
                  not claimable
                </p>
              )}
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                {report.netVatPayable >= 0 ? 'Net VAT Payable' : 'Net VAT Refundable'}
              </p>
              <p
                className={cn(
                  'mt-xs text-xl font-semibold tabular-nums',
                  report.netVatPayable >= 0 ? 'text-text-primary' : 'text-positive',
                )}
              >
                <FinancialNumber value={Math.abs(report.netVatPayable)} format={formatCurrency} showFlash={false} />
              </p>
            </Card>
          </div>

          {report.unresolvedLineCount > 0 && (
            <p role="alert" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
              {report.unresolvedLineCount} line item{report.unresolvedLineCount === 1 ? '' : 's'} could not be matched to a known tax
              rate and {report.unresolvedLineCount === 1 ? 'was' : 'were'} excluded from this report — check for a deleted or
              incorrectly-referenced tax code.
            </p>
          )}

          <Card className="flex flex-col gap-lg">
            <BreakdownTable title="Output VAT by Treatment" rows={report.outputVat.byTreatment} emptyLabel="No output VAT this period." />
            <BreakdownTable title="Input VAT by Treatment (claimable only)" rows={report.inputVat.byTreatment} emptyLabel="No input VAT this period." />
          </Card>

          {reconciliation && (
            <div>
              <h2 className="mb-sm text-lg font-semibold text-text-primary">GL Reconciliation</h2>
              <p className="mb-md text-sm text-text-secondary">
                Confirms what was actually posted to the VAT Output/Input control accounts this period matches this report.
              </p>
              <div className="grid grid-cols-1 gap-md md:grid-cols-2">
                <ReconciliationCard label="VAT Output" check={reconciliation.outputVat} />
                <ReconciliationCard label="VAT Input" check={reconciliation.inputVat} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
