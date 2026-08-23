import { Link } from 'react-router-dom';
import type { ReportingFramework } from '@/types';
import { Card } from '@/components/ui/Card';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { useComplianceDashboard } from '../hooks/useComplianceDashboard';

const FRAMEWORK_LABELS: Record<ReportingFramework, string> = {
  full_ifrs: 'Full IFRS',
  ifrs_for_smes: 'IFRS for SMEs',
  other_sa_framework: 'Other applicable SA framework',
  grap: 'GRAP',
  not_yet_determined: 'Not yet determined',
};

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className={cn('rounded-full px-sm py-0.5 text-xs font-semibold', ok ? 'bg-positive/10 text-positive' : 'bg-warning/10 text-warning-financial')}>
      {ok ? okLabel : badLabel}
    </span>
  );
}

function CardHeader({ title, linkTo, linkLabel }: { title: string; linkTo: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <Link to={linkTo} className="text-xs font-medium text-primary no-underline hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}

/**
 * Compliance Dashboard — route `/compliance/dashboard`
 * (SA_ACCOUNTING_MASTER_SPEC.md §108, §116 Phase 11). Aggregates real
 * status from every module already built (VAT §5, Income Tax/Provisional
 * Tax §9, Payroll §8, the Fixed Asset register §7, AR/AP subledger
 * reconciliation §2/3, Accounting Periods §1, and the new Public Interest
 * Score §3) into one screen, per §108's own section list. Each figure is
 * re-computed live from real posted data by the same functions their own
 * dedicated pages use — this page performs no calculation of its own
 * (docs/DO_NOT_BREAK.md).
 *
 * Two §108 bullets are deliberately absent rather than faked: "certificates"
 * (no IRP5/tax-certificate generation exists anywhere in this app) and
 * "annual return support" / a suspense account (neither is modeled in this
 * codebase — see docs/SA_SPEC_GAP_ANALYSIS.md's Phase 11 section). Flagged
 * here instead of silently omitted.
 */
export function ComplianceDashboardPage() {
  const { data, loading, error, refetch } = useComplianceDashboard();

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Compliance Dashboard</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Live status across VAT, Income Tax, Payroll, Company compliance, and Accounting. /compliance/dashboard
        </p>
      </div>

      {loading && <Spinner label="Loading compliance status…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
          <Card className="flex flex-col gap-sm">
            <CardHeader title="Company" linkTo="/compliance/public-interest-score" linkLabel="Public Interest Score" />
            <dl className="grid grid-cols-2 gap-sm text-sm">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Reporting Framework</dt>
                <dd className="mt-xs text-text-primary">{data.company ? FRAMEWORK_LABELS[data.company.reportingFramework] : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Public Interest Score</dt>
                <dd className="mt-xs text-text-primary">{data.latestPiScore ? data.latestPiScore.totalScore : 'Not yet calculated'}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Assurance Requirement</dt>
                <dd className="mt-xs text-text-primary">
                  {data.latestPiScore
                    ? data.latestPiScore.suggestedAssuranceLevel === 'audit_required'
                      ? 'Audit required'
                      : 'Independent review required'
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Financial Statements</dt>
                <dd className="mt-xs text-text-primary">
                  <Link to="/reports/income-statement" className="text-primary no-underline hover:underline">
                    Income Statement
                  </Link>
                  {' · '}
                  <Link to="/reports/balance-sheet" className="text-primary no-underline hover:underline">
                    Balance Sheet
                  </Link>
                </dd>
              </div>
            </dl>
            {data.latestPiScore?.frameworkDiffersFromCurrent && (
              <p role="alert" className="rounded-md border border-warning bg-warning/10 px-sm py-xs text-xs text-warning-financial">
                Suggested reporting framework differs from the current one — review on the Public Interest Score page.
              </p>
            )}
            <p className="text-xs text-text-muted">Annual return support and audit/review sign-off tracking are not modeled in this system.</p>
          </Card>

          <Card className="flex flex-col gap-sm">
            <CardHeader title="VAT" linkTo="/tax/vat-return" linkLabel="VAT Return" />
            <dl className="grid grid-cols-2 gap-sm text-sm">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Registration</dt>
                <dd className="mt-xs text-text-primary">
                  {data.company?.isVatRegistered ? data.company.vatRegistrationNumber ?? 'Registered' : 'Not registered'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">This Month</dt>
                <dd className="mt-xs font-mono tabular-nums text-text-primary">
                  {data.vatReport ? (
                    <FinancialNumber value={Math.abs(data.vatReport.netVatPayable)} format={formatCurrency} showFlash={false} />
                  ) : (
                    '—'
                  )}
                  <span className="ml-xs text-xs text-text-muted">
                    {data.vatReport && data.vatReport.netVatPayable >= 0 ? 'payable' : 'refundable'}
                  </span>
                </dd>
              </div>
            </dl>
            {data.vatReconciliation && (
              <div className="flex gap-sm">
                <StatusPill ok={data.vatReconciliation.outputVat.isReconciled} okLabel="Output reconciled" badLabel="Output variance" />
                <StatusPill ok={data.vatReconciliation.inputVat.isReconciled} okLabel="Input reconciled" badLabel="Input variance" />
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-sm">
            <CardHeader title="Income Tax" linkTo="/tax/income-tax" linkLabel="Income Tax" />
            <dl className="grid grid-cols-2 gap-sm text-sm">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Financial Year</dt>
                <dd className="mt-xs text-text-primary">{data.openFinancialYearName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Provisional Tax</dt>
                <dd className="mt-xs text-text-primary">
                  {data.provisionalTaxPeriod ? (
                    <Link to="/tax/provisional-tax" className="text-primary no-underline hover:underline">
                      In progress
                    </Link>
                  ) : (
                    'Not yet started'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Estimated Liability</dt>
                <dd className="mt-xs font-mono tabular-nums text-text-primary">
                  {data.latestTaxComputation ? (
                    <FinancialNumber value={data.latestTaxComputation.taxLiability} format={formatCurrency} showFlash={false} />
                  ) : (
                    'Not yet computed'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Status</dt>
                <dd className="mt-xs text-text-primary">{data.latestTaxComputation?.status ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="flex flex-col gap-sm">
            <CardHeader title="Payroll" linkTo="/payroll/emp201" linkLabel="EMP201" />
            <dl className="grid grid-cols-3 gap-sm text-sm">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">PAYE (month)</dt>
                <dd className="mt-xs font-mono tabular-nums text-text-primary">
                  {data.emp201 ? <FinancialNumber value={data.emp201.paye} format={formatCurrency} showFlash={false} /> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">UIF (month)</dt>
                <dd className="mt-xs font-mono tabular-nums text-text-primary">
                  {data.emp201 ? <FinancialNumber value={data.emp201.totalUif} format={formatCurrency} showFlash={false} /> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">SDL (month)</dt>
                <dd className="mt-xs font-mono tabular-nums text-text-primary">
                  {data.emp201 ? <FinancialNumber value={data.emp201.sdl} format={formatCurrency} showFlash={false} /> : '—'}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-sm">
              <span className="text-xs text-text-muted">{data.activeEmployeeCount} active employee{data.activeEmployeeCount === 1 ? '' : 's'}</span>
              {data.emp201Reconciliation && (
                <StatusPill
                  ok={
                    data.emp201Reconciliation.paye.isReconciled &&
                    data.emp201Reconciliation.uifEmployee.isReconciled &&
                    data.emp201Reconciliation.uifEmployer.isReconciled &&
                    data.emp201Reconciliation.sdl.isReconciled
                  }
                  okLabel="Reconciled"
                  badLabel="Variance detected"
                />
              )}
            </div>
            <p className="text-xs text-text-muted">
              EMP501, and IRP5/tax-certificate generation, are not summarized here — see the{' '}
              <Link to="/payroll/emp501" className="text-primary no-underline hover:underline">
                EMP501 Reconciliation
              </Link>{' '}
              page (this app has no document-generation capability for certificates).
            </p>
          </Card>

          <Card className="flex flex-col gap-sm lg:col-span-2">
            <CardHeader title="Accounting" linkTo="/accounting/trial-balance" linkLabel="Trial Balance" />
            <dl className="grid grid-cols-2 gap-sm text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Open Periods</dt>
                <dd className="mt-xs text-text-primary">{data.accountingPeriods.filter((p) => p.status === 'open').length}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Closed/Locked Periods</dt>
                <dd className="mt-xs text-text-primary">{data.accountingPeriods.filter((p) => p.status !== 'open').length}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Active Fixed Assets</dt>
                <dd className="mt-xs text-text-primary">{data.fixedAssets.filter((a) => a.status === 'active').length}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted uppercase tracking-wide">Suspense Account</dt>
                <dd className="mt-xs text-text-muted">Not modeled</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-sm">
              {data.arReconciliation && <StatusPill ok={data.arReconciliation.isReconciled} okLabel="Debtors reconciled" badLabel="Debtors variance" />}
              {data.apReconciliation && <StatusPill ok={data.apReconciliation.isReconciled} okLabel="Creditors reconciled" badLabel="Creditors variance" />}
              <Link to="/banking/reconciliation" className="text-xs font-medium text-primary no-underline hover:underline">
                Bank Reconciliation →
              </Link>
              <Link to="/inventory/products" className="text-xs font-medium text-primary no-underline hover:underline">
                Inventory →
              </Link>
              <Link to="/assets/register" className="text-xs font-medium text-primary no-underline hover:underline">
                Fixed Assets →
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
