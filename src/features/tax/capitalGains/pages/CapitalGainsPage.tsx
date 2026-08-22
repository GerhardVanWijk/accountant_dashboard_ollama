import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useCapitalGainsReport } from '../hooks/useCapitalGainsReport';
import { CapitalGainsTable } from '../components/CapitalGainsTable';
import type { CgtEntityTypeBucket } from '@/types';

const ENTITY_BUCKET_LABELS: Record<CgtEntityTypeBucket, string> = {
  natural_person_like: 'Natural person (sole proprietor / partnership)',
  company: 'Company',
  trust: 'Trust',
};

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfSarsTaxYear(today: Date): Date {
  const year = today.getUTCMonth() >= 2 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 2, 1, 0, 0, 0, 0));
}

/** Day 0 of March (next year) is the last day of February — leap-year safe. */
function endOfSarsTaxYear(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear() + 1, 2, 0, 23, 59, 59, 999));
}

function startOfDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

/**
 * Capital Gains Tax (SA_ACCOUNTING_MASTER_SPEC.md §55) — route
 * `/tax/capital-gains`. A read-only reconciliation report: computes the
 * TAXABLE capital gain on fixed-asset disposals in a chosen period,
 * shown side by side with the ACCOUNTING gain/loss already posted by
 * assetDisposalService, so the two are never conflated. Posts nothing to
 * the GL.
 */
export function CapitalGainsPage() {
  const { company, loading: companyLoading } = useCompany();

  const defaultStart = useMemo(() => startOfSarsTaxYear(new Date()), []);
  const defaultEnd = useMemo(() => endOfSarsTaxYear(defaultStart), [defaultStart]);

  const [startInput, setStartInput] = useState(dateInputValue(defaultStart));
  const [endInput, setEndInput] = useState(dateInputValue(defaultEnd));

  const periodStart = useMemo(() => startOfDay(startInput), [startInput]);
  const periodEnd = useMemo(() => endOfDay(endInput), [endInput]);

  const { report, loading, error, refetch, setSellingCosts } = useCapitalGainsReport(periodStart, periodEnd, company?.legalEntityType);

  const resetToCurrentTaxYear = () => {
    setStartInput(dateInputValue(defaultStart));
    setEndInput(dateInputValue(defaultEnd));
  };

  const busy = companyLoading || loading;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Capital Gains Tax</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Taxable capital gains on fixed-asset disposals, separate from the accounting gain/loss already posted
            to the GL. /tax/capital-gains
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-sm">
          <label className="flex flex-col gap-xs text-sm">
            <span className="text-xs text-text-secondary">Period start</span>
            <input
              type="date"
              aria-label="Period start"
              className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={startInput}
              max={endInput}
              onChange={(e) => setStartInput(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="text-xs text-text-secondary">Period end</span>
            <input
              type="date"
              aria-label="Period end"
              className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={endInput}
              min={startInput}
              onChange={(e) => setEndInput(e.target.value)}
            />
          </label>
          <Button variant="ghost" onClick={resetToCurrentTaxYear}>
            Current Tax Year
          </Button>
          <Button variant="ghost" onClick={refetch}>
            Refresh
          </Button>
        </div>
      </div>

      {busy && <Spinner label="Computing Capital Gains Tax report…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && report && (
        <>
          {report.configWarnings.length > 0 && (
            <div className="flex flex-col gap-xs">
              {report.configWarnings.map((warning, i) => (
                <p
                  key={i}
                  role="alert"
                  className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial"
                >
                  {warning}
                </p>
              ))}
            </div>
          )}

          {report.unresolvedDisposalCount > 0 && (
            <p role="alert" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
              {report.unresolvedDisposalCount} disposal{report.unresolvedDisposalCount === 1 ? '' : 's'} in this period could not be
              matched to a Fixed Asset record and {report.unresolvedDisposalCount === 1 ? 'was' : 'were'} excluded from this report.
            </p>
          )}

          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Net Capital Gain / Loss</p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.netCapitalGainLoss} format={formatCurrency} showFlash={false} />
              </p>
              {report.netCapitalLossForPeriod > 0 && (
                <p className="mt-xs text-xs text-text-muted">
                  Net capital loss of <FinancialNumber value={report.netCapitalLossForPeriod} format={formatCurrency} showFlash={false} />{' '}
                  for the period — not carried forward by this app (see gaps below).
                </p>
              )}
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Annual Exclusion {report.annualExclusionEligible ? 'Applied' : '(N/A)'}
              </p>
              <p className="mt-xs text-xl font-semibold tabular-nums">
                <FinancialNumber value={report.annualExclusionApplied} format={formatCurrency} showFlash={false} />
              </p>
              {report.annualExclusionEligible && (
                <p className="mt-xs text-xs text-text-muted">
                  Of <FinancialNumber value={report.annualExclusionAvailable} format={formatCurrency} showFlash={false} /> available
                </p>
              )}
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Inclusion Rate</p>
              <p className="mt-xs text-xl font-semibold tabular-nums text-text-primary">{report.inclusionRatePercent}%</p>
              <p className="mt-xs text-xs text-text-muted">{ENTITY_BUCKET_LABELS[report.entityTypeBucket]}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Taxable Capital Gain</p>
              <p className="mt-xs text-xl font-semibold tabular-nums text-text-primary">{formatCurrency(report.taxableCapitalGain)}</p>
            </Card>
          </div>

          <Card>
            {report.disposals.length === 0 ? (
              <EmptyState title="No disposals in this period" message="Choose a different period, or dispose of a fixed asset to see it reconciled here." />
            ) : (
              <CapitalGainsTable
                disposals={report.disposals}
                onSellingCostsChange={(disposalId, sellingCosts) => setSellingCosts(disposalId, sellingCosts)}
              />
            )}
          </Card>

          <Card className={cn('text-sm text-text-secondary')}>
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Simplifications &amp; Open Gaps</h2>
            <ul className="list-inside list-disc space-y-xs">
              {report.simplificationNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
