import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatCurrency } from '@/lib/app/format';
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
 * Capital Gains Tax — route `/tax/capital-gains`. A read-only
 * reconciliation report: computes the TAXABLE capital gain on fixed-asset
 * disposals in a chosen period, shown side by side with the ACCOUNTING
 * gain/loss already posted by assetDisposalService, so the two are never
 * conflated. Posts nothing to the GL. Re-skinned onto v0's
 * PageHeader/SectionCard (M7); data/mutation wiring unchanged.
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Capital Gains Tax"
        description="Taxable capital gains on fixed-asset disposals, separate from the accounting gain/loss already posted to the GL."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Period start</span>
              <Input type="date" aria-label="Period start" value={startInput} max={endInput} onChange={(e) => setStartInput(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Period end</span>
              <Input type="date" aria-label="Period end" value={endInput} min={startInput} onChange={(e) => setEndInput(e.target.value)} />
            </label>
            <Button variant="outline" onClick={resetToCurrentTaxYear}>
              Current Tax Year
            </Button>
            <Button variant="outline" onClick={refetch}>
              Refresh
            </Button>
          </div>
        }
      />

      {busy && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Computing Capital Gains Tax report…</span>
        </div>
      )}
      {!busy && error && (
        <SectionCard>
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
          <Button variant="outline" className="mt-3" onClick={refetch}>
            Retry
          </Button>
        </SectionCard>
      )}

      {!busy && !error && report && (
        <>
          {report.configWarnings.map((warning, i) => (
            <p key={i} role="alert" className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-sm text-status-warning">
              {warning}
            </p>
          ))}

          {report.unresolvedDisposalCount > 0 && (
            <p role="alert" className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-sm text-status-warning">
              {report.unresolvedDisposalCount} disposal{report.unresolvedDisposalCount === 1 ? '' : 's'} in this period could not be matched to a Fixed Asset record and{' '}
              {report.unresolvedDisposalCount === 1 ? 'was' : 'were'} excluded from this report.
            </p>
          )}

          <SectionCard>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock
                label="Net Capital Gain / Loss"
                value={formatCurrency(report.netCapitalGainLoss)}
                hint={report.netCapitalLossForPeriod > 0 ? `Net capital loss of ${formatCurrency(report.netCapitalLossForPeriod)} for the period — not carried forward by this app` : undefined}
              />
              <FigureBlock
                label={`Annual Exclusion ${report.annualExclusionEligible ? 'Applied' : '(N/A)'}`}
                value={formatCurrency(report.annualExclusionApplied)}
                hint={report.annualExclusionEligible ? `Of ${formatCurrency(report.annualExclusionAvailable)} available` : undefined}
              />
              <FigureBlock label="Inclusion Rate" value={`${report.inclusionRatePercent}%`} hint={ENTITY_BUCKET_LABELS[report.entityTypeBucket]} />
              <FigureBlock label="Taxable Capital Gain" value={formatCurrency(report.taxableCapitalGain)} />
            </div>
          </SectionCard>

          <SectionCard>
            {report.disposals.length === 0 ? (
              <Empty>
                <EmptyTitle>No disposals in this period</EmptyTitle>
                <EmptyDescription>Choose a different period, or dispose of a fixed asset to see it reconciled here.</EmptyDescription>
              </Empty>
            ) : (
              <CapitalGainsTable disposals={report.disposals} onSellingCostsChange={(disposalId, sellingCosts) => setSellingCosts(disposalId, sellingCosts)} />
            )}
          </SectionCard>

          <SectionCard title="Simplifications & Open Gaps">
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {report.simplificationNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
