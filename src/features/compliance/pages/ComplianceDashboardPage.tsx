import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ReportingFramework } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
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
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', ok ? 'bg-positive/15 text-positive' : 'bg-warning/15 text-warning')}>{ok ? okLabel : badLabel}</span>
  );
}

/**
 * Compliance Dashboard — route `/compliance/dashboard`. Aggregates real
 * status from every module already built (VAT, Income Tax/Provisional
 * Tax, Payroll, the Fixed Asset register, AR/AP subledger reconciliation,
 * Accounting Periods, Public Interest Score) into one screen. Each figure
 * is re-computed live from real posted data by the same functions their
 * own dedicated pages use — this page performs no calculation of its own.
 *
 * Two things are deliberately absent rather than faked: "certificates"
 * (no IRP5/tax-certificate generation exists anywhere in this app) and
 * "annual return support" / a suspense account (neither is modeled in
 * this codebase). Re-skinned onto v0's PageHeader/SectionCard (M7); data
 * wiring unchanged.
 */
export function ComplianceDashboardPage() {
  const { data, loading, error, refetch } = useComplianceDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Compliance Dashboard" description="Live status across VAT, Income Tax, Payroll, Company compliance, and Accounting." />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading compliance status…</span>
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

      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Company" actions={<Link to="/compliance/public-interest-score" className="text-xs font-medium text-brand hover:underline">Public Interest Score →</Link>}>
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Reporting Framework</dt>
                  <dd className="mt-1">{data.company ? FRAMEWORK_LABELS[data.company.reportingFramework] : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Public Interest Score</dt>
                  <dd className="mt-1">{data.latestPiScore ? data.latestPiScore.totalScore : 'Not yet calculated'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Assurance Requirement</dt>
                  <dd className="mt-1">{data.latestPiScore ? (data.latestPiScore.suggestedAssuranceLevel === 'audit_required' ? 'Audit required' : 'Independent review required') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Financial Statements</dt>
                  <dd className="mt-1">
                    <Link to="/reports/income-statement" className="text-brand hover:underline">
                      Income Statement
                    </Link>
                    {' · '}
                    <Link to="/reports/balance-sheet" className="text-brand hover:underline">
                      Balance Sheet
                    </Link>
                  </dd>
                </div>
              </dl>
              {data.latestPiScore?.frameworkDiffersFromCurrent && (
                <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Suggested reporting framework differs from the current one — review on the Public Interest Score page.
                </p>
              )}
              <p className="text-xs text-muted-foreground">Annual return support and audit/review sign-off tracking are not modeled in this system.</p>
            </div>
          </SectionCard>

          <SectionCard title="VAT" actions={<Link to="/tax/vat-return" className="text-xs font-medium text-brand hover:underline">VAT Return →</Link>}>
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Registration</dt>
                  <dd className="mt-1">{data.company?.isVatRegistered ? (data.company.vatRegistrationNumber ?? 'Registered') : 'Not registered'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">This Month</dt>
                  <dd className="figure mt-1 tabular-nums">
                    {data.vatReport ? formatCurrency(Math.abs(data.vatReport.netVatPayable)) : '—'}
                    <span className="ml-1 text-xs text-muted-foreground">{data.vatReport && data.vatReport.netVatPayable >= 0 ? 'payable' : 'refundable'}</span>
                  </dd>
                </div>
              </dl>
              {data.vatReconciliation && (
                <div className="flex gap-2">
                  <StatusPill ok={data.vatReconciliation.outputVat.isReconciled} okLabel="Output reconciled" badLabel="Output variance" />
                  <StatusPill ok={data.vatReconciliation.inputVat.isReconciled} okLabel="Input reconciled" badLabel="Input variance" />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Income Tax" actions={<Link to="/tax/income-tax" className="text-xs font-medium text-brand hover:underline">Income Tax →</Link>}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Financial Year</dt>
                <dd className="mt-1">{data.openFinancialYearName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Provisional Tax</dt>
                <dd className="mt-1">
                  {data.provisionalTaxPeriod ? (
                    <Link to="/tax/provisional-tax" className="text-brand hover:underline">
                      In progress
                    </Link>
                  ) : (
                    'Not yet started'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Estimated Liability</dt>
                <dd className="figure mt-1 tabular-nums">{data.latestTaxComputation ? formatCurrency(data.latestTaxComputation.taxLiability) : 'Not yet computed'}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Status</dt>
                <dd className="mt-1">{data.latestTaxComputation?.status ?? '—'}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Payroll" actions={<Link to="/payroll/emp201" className="text-xs font-medium text-brand hover:underline">EMP201 →</Link>}>
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">PAYE (month)</dt>
                  <dd className="figure mt-1 tabular-nums">{data.emp201 ? formatCurrency(data.emp201.paye) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">UIF (month)</dt>
                  <dd className="figure mt-1 tabular-nums">{data.emp201 ? formatCurrency(data.emp201.totalUif) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">SDL (month)</dt>
                  <dd className="figure mt-1 tabular-nums">{data.emp201 ? formatCurrency(data.emp201.sdl) : '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {data.activeEmployeeCount} active employee{data.activeEmployeeCount === 1 ? '' : 's'}
                </span>
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
              <p className="text-xs text-muted-foreground">
                EMP501, and IRP5/tax-certificate generation, are not summarized here — see the{' '}
                <Link to="/payroll/emp501" className="text-brand hover:underline">
                  EMP501 Reconciliation
                </Link>{' '}
                page (this app has no document-generation capability for certificates).
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Accounting" actions={<Link to="/accounting/trial-balance" className="text-xs font-medium text-brand hover:underline">Trial Balance →</Link>} className="lg:col-span-2">
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Open Periods</dt>
                  <dd className="mt-1">{data.accountingPeriods.filter((p) => p.status === 'open').length}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Closed/Locked Periods</dt>
                  <dd className="mt-1">{data.accountingPeriods.filter((p) => p.status !== 'open').length}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Active Fixed Assets</dt>
                  <dd className="mt-1">{data.fixedAssets.filter((a) => a.status === 'active').length}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Suspense Account</dt>
                  <dd className="mt-1 text-muted-foreground">Not modeled</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {data.arReconciliation && <StatusPill ok={data.arReconciliation.isReconciled} okLabel="Debtors reconciled" badLabel="Debtors variance" />}
                {data.apReconciliation && <StatusPill ok={data.apReconciliation.isReconciled} okLabel="Creditors reconciled" badLabel="Creditors variance" />}
                <Link to="/banking/reconciliation" className="text-xs font-medium text-brand hover:underline">
                  Bank Reconciliation →
                </Link>
                <Link to="/inventory/products" className="text-xs font-medium text-brand hover:underline">
                  Inventory →
                </Link>
                <Link to="/assets/register" className="text-xs font-medium text-brand hover:underline">
                  Fixed Assets →
                </Link>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
