import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import type { ReportingFramework } from '@/types';
import { usePublicInterestScore } from '../hooks/usePublicInterestScore';
import { Modal } from '../components/Modal';
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
 * Public Interest Score — route `/compliance/public-interest-score`
 * (SA_ACCOUNTING_MASTER_SPEC.md §3, §116 Phase 11 "Compliance"). Calculates
 * a Companies Regulations 2011 reg 26(2) score from real posted GL/Employee
 * data, and SUGGESTS an audit/independent-review requirement and reporting
 * framework — see `complianceDeterminations.ts`'s doc comment for exactly
 * what is/isn't verified. Never changes `Company.reportingFramework`
 * automatically; a differing suggestion surfaces as a warning with a real
 * override action, not a silent change (§3).
 */
export function PublicInterestScorePage() {
  const { company, financialYears, history, latest, loading, error, refetch, calculateScore, applyReportingFramework } =
    usePublicInterestScore();
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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Public Interest Score</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Companies Regulations 2011 reg 26(2) score, and audit/reporting-framework suggestions. /compliance/public-interest-score
          </p>
        </div>
        <Button onClick={() => setCalculateOpen(true)} disabled={loading || financialYears.length === 0}>
          Calculate New Score
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="rounded-md border border-border bg-positive/10 px-md py-sm text-sm text-positive">
          {actionMessage}
        </p>
      )}

      <p role="note" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
        This calculation and its suggestions are cross-checked against secondary summaries of the Companies
        Regulations, 2011 (not a single verified primary-source quote — see the source citation on each calculation)
        and do not replace professional/accounting review before relying on them for a statutory filing
        (SA_ACCOUNTING_MASTER_SPEC.md §110/§111).
      </p>

      {loading && <Spinner label="Loading Public Interest Score data…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        <>
          {!latest ? (
            <Card>
              <EmptyState
                title="No score calculated yet"
                message="Calculate a Public Interest Score for a financial year to see the audit/review and reporting-framework suggestions."
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Public Interest Score</p>
                  <p className="mt-xs text-2xl font-semibold tabular-nums">{latest.totalScore}</p>
                  <p className="mt-xs text-xs text-text-muted">{financialYearName(latest.financialYearId)}</p>
                </Card>
                <Card>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Assurance Requirement</p>
                  <p className="mt-xs text-lg font-semibold text-text-primary">{ASSURANCE_LABELS[latest.suggestedAssuranceLevel]}</p>
                </Card>
                <Card>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Suggested Framework</p>
                  <p className="mt-xs text-lg font-semibold text-text-primary">{FRAMEWORK_LABELS[latest.suggestedReportingFramework]}</p>
                  {latest.reportingFrameworkConfidence === 'requires_professional_review' && (
                    <p className="mt-xs text-xs text-warning-financial">Requires professional review</p>
                  )}
                </Card>
                <Card>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Current Framework</p>
                  <p className="mt-xs text-lg font-semibold text-text-primary">
                    {company ? FRAMEWORK_LABELS[company.reportingFramework] : '—'}
                  </p>
                </Card>
              </div>

              {latest.frameworkDiffersFromCurrent && (
                <div className="flex flex-col gap-sm rounded-md border border-warning bg-warning/10 px-md py-md sm:flex-row sm:items-center sm:justify-between">
                  <p role="alert" className="text-sm text-warning-financial">
                    The suggested reporting framework ({FRAMEWORK_LABELS[latest.suggestedReportingFramework]}) differs from the
                    company&apos;s current framework ({company ? FRAMEWORK_LABELS[company.reportingFramework] : '—'}). This is a
                    warning only — nothing changes automatically (§3).
                  </p>
                  <Button variant="secondary" onClick={() => setFrameworkFormOpen(true)}>
                    Review &amp; Change Framework
                  </Button>
                </div>
              )}

              <Card className="flex flex-col gap-md">
                <h2 className="text-sm font-semibold text-text-primary">Score Breakdown</h2>
                <dl className="grid grid-cols-2 gap-md sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wide">Employees (avg.)</dt>
                    <dd className="mt-xs font-mono tabular-nums">
                      {latest.components.averageEmployees.toFixed(1)} → {latest.employeePoints} pt
                      {latest.employeePoints === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wide">Turnover</dt>
                    <dd className="mt-xs font-mono tabular-nums">
                      <FinancialNumber value={latest.components.turnover} format={formatCurrency} showFlash={false} /> →{' '}
                      {latest.turnoverPoints} pt{latest.turnoverPoints === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wide">3rd-Party Liabilities</dt>
                    <dd className="mt-xs font-mono tabular-nums">
                      <FinancialNumber value={latest.components.thirdPartyLiabilities} format={formatCurrency} showFlash={false} /> →{' '}
                      {latest.thirdPartyLiabilityPoints} pt{latest.thirdPartyLiabilityPoints === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wide">Shareholders/Members</dt>
                    <dd className="mt-xs font-mono tabular-nums">
                      {latest.components.shareholdersOrMembersCount} → {latest.shareholderPoints} pt
                      {latest.shareholderPoints === 1 ? '' : 's'}
                    </dd>
                  </div>
                </dl>
                <div className={cn('rounded-md border border-border bg-background px-md py-sm text-sm text-text-secondary')}>
                  <p>{latest.assuranceLevelReason}</p>
                  <p className="mt-xs">{latest.reportingFrameworkReason}</p>
                </div>
              </Card>

              <div>
                <h2 className="mb-sm text-lg font-semibold text-text-primary">History</h2>
                <PublicInterestScoreHistoryTable history={history} financialYearName={financialYearName} />
              </div>
            </>
          )}
        </>
      )}

      {calculateOpen && (
        <Modal title="Calculate New Score" onClose={() => setCalculateOpen(false)}>
          <CalculateScoreForm financialYears={financialYears} onSubmit={handleCalculate} onCancel={() => setCalculateOpen(false)} />
        </Modal>
      )}

      {frameworkFormOpen && company && latest && (
        <Modal title="Change Reporting Framework" onClose={() => setFrameworkFormOpen(false)}>
          <ReportingFrameworkOverrideForm
            currentFramework={company.reportingFramework}
            suggestedFramework={latest.suggestedReportingFramework}
            onSubmit={handleApplyFramework}
            onCancel={() => setFrameworkFormOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
