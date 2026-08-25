import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReportingFramework } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatCurrency } from '@/lib/app/format';
import { usePublicInterestScore } from '../hooks/usePublicInterestScore';
import { CalculateScoreForm } from '../components/CalculateScoreForm';
import { ReportingFrameworkOverrideForm } from '../components/ReportingFrameworkOverrideForm';
import { PublicInterestScoreHistoryTable } from '../components/PublicInterestScoreHistoryTable';

const ASSURANCE_LABELS = {
  audit_required: 'Audit required',
  independent_review_required: 'Independent review required',
} as const;

const FRAMEWORK_LABELS: Record<ReportingFramework, string> = {
  full_ifrs: 'Full IFRS',
  ifrs_for_smes: 'IFRS for SMEs',
  other_sa_framework: 'Other applicable SA framework',
  grap: 'GRAP',
  not_yet_determined: 'Not yet determined',
};

/**
 * Public Interest Score — route `/compliance/public-interest-score`.
 * Calculates a Companies Regulations 2011 reg 26(2) score from real
 * posted GL/Employee data, and SUGGESTS an audit/independent-review
 * requirement and reporting framework. Never changes
 * `Company.reportingFramework` automatically; a differing suggestion
 * surfaces as a warning with a real override action, not a silent
 * change. Re-skinned onto v0's PageHeader/SectionCard/Dialog (M7);
 * data/mutation wiring unchanged.
 */
export function PublicInterestScorePage() {
  const { company, financialYears, history, latest, loading, error, refetch, calculateScore, applyReportingFramework } = usePublicInterestScore();
  const [calculateOpen, setCalculateOpen] = useState(false);
  const [frameworkFormOpen, setFrameworkFormOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const financialYearName = (financialYearId: string) => financialYears.find((fy) => fy.id === financialYearId)?.name ?? financialYearId;

  const handleCalculate = async (input: Parameters<typeof calculateScore>[0]) => {
    setActionError(null);
    try {
      await calculateScore(input);
      setActionMessage('New Public Interest Score calculated.');
      setCalculateOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to calculate the Public Interest Score.');
    }
  };

  const handleApplyFramework = async (framework: ReportingFramework, reason: string) => {
    setActionError(null);
    try {
      await applyReportingFramework(framework, reason);
      setActionMessage(`Reporting framework changed to ${FRAMEWORK_LABELS[framework]}.`);
      setFrameworkFormOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to change the reporting framework.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Public Interest Score"
        description="Companies Regulations 2011 reg 26(2) score, and audit/reporting-framework suggestions."
        actions={
          <Button onClick={() => setCalculateOpen(true)} disabled={loading || financialYears.length === 0}>
            Calculate New Score
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="rounded-lg border border-positive/40 bg-positive/10 px-4 py-2.5 text-sm text-positive">
          {actionMessage}
        </p>
      )}

      <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
        This calculation and its suggestions are cross-checked against secondary summaries of the Companies Regulations, 2011 (not a single verified primary-source quote — see the
        source citation on each calculation) and do not replace professional/accounting review before relying on them for a statutory filing.
      </p>

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading Public Interest Score data…</span>
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

      {!loading && !error && (
        <>
          {!latest ? (
            <SectionCard>
              <Empty>
                <EmptyTitle>No score calculated yet</EmptyTitle>
                <EmptyDescription>Calculate a Public Interest Score for a financial year to see the audit/review and reporting-framework suggestions.</EmptyDescription>
              </Empty>
            </SectionCard>
          ) : (
            <>
              <SectionCard>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FigureBlock label="Public Interest Score" value={String(latest.totalScore)} hint={financialYearName(latest.financialYearId)} />
                  <FigureBlock label="Assurance Requirement" value={ASSURANCE_LABELS[latest.suggestedAssuranceLevel]} />
                  <FigureBlock
                    label="Suggested Framework"
                    value={FRAMEWORK_LABELS[latest.suggestedReportingFramework]}
                    hint={latest.reportingFrameworkConfidence === 'requires_professional_review' ? 'Requires professional review' : undefined}
                  />
                  <FigureBlock label="Current Framework" value={company ? FRAMEWORK_LABELS[company.reportingFramework] : '—'} />
                </div>
              </SectionCard>

              {latest.frameworkDiffersFromCurrent && (
                <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p role="alert" className="text-sm text-warning">
                    The suggested reporting framework ({FRAMEWORK_LABELS[latest.suggestedReportingFramework]}) differs from the company&apos;s current framework (
                    {company ? FRAMEWORK_LABELS[company.reportingFramework] : '—'}). This is a warning only — nothing changes automatically.
                  </p>
                  <Button variant="outline" onClick={() => setFrameworkFormOpen(true)}>
                    Review &amp; Change Framework
                  </Button>
                </div>
              )}

              <SectionCard title="Score Breakdown">
                <div className="flex flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Employees (avg.)</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {latest.components.averageEmployees.toFixed(1)} → {latest.employeePoints} pt{latest.employeePoints === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Turnover</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {formatCurrency(latest.components.turnover)} → {latest.turnoverPoints} pt{latest.turnoverPoints === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">3rd-Party Liabilities</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {formatCurrency(latest.components.thirdPartyLiabilities)} → {latest.thirdPartyLiabilityPoints} pt{latest.thirdPartyLiabilityPoints === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Shareholders/Members</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {latest.components.shareholdersOrMembersCount} → {latest.shareholderPoints} pt{latest.shareholderPoints === 1 ? '' : 's'}
                      </dd>
                    </div>
                  </dl>
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                    <p>{latest.assuranceLevelReason}</p>
                    <p className="mt-1">{latest.reportingFrameworkReason}</p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="History">
                <PublicInterestScoreHistoryTable history={history} financialYearName={financialYearName} />
              </SectionCard>
            </>
          )}
        </>
      )}

      <Dialog open={calculateOpen} onOpenChange={setCalculateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Calculate New Score</DialogTitle>
          </DialogHeader>
          <CalculateScoreForm financialYears={financialYears} onSubmit={handleCalculate} onCancel={() => setCalculateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={frameworkFormOpen && Boolean(company && latest)} onOpenChange={setFrameworkFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change Reporting Framework</DialogTitle>
          </DialogHeader>
          {company && latest && (
            <ReportingFrameworkOverrideForm
              currentFramework={company.reportingFramework}
              suggestedFramework={latest.suggestedReportingFramework}
              onSubmit={handleApplyFramework}
              onCancel={() => setFrameworkFormOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
