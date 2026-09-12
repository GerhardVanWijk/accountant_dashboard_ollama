import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { ShieldAlertIcon, WalletCardsIcon } from 'lucide-react';
import { Amount } from '@/components/app/figure';
import { StatTile } from '@/components/app/stat-tile';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { EnumSelect } from '@/components/app/combobox';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useEcl } from '../hooks/useEcl';
import { useEclReconciliation } from '../hooks/useEclReconciliation';
import { EclBucketTable } from '../components/EclBucketTable';
import { findMostRecentPostedEclBefore } from '../services/eclCalculations';

function ReconciliationRow({ label, expected, gl, variance, isReconciled }: { label: string; expected: number; gl: number; variance: number; isReconciled: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', isReconciled ? 'bg-status-positive-muted text-status-positive' : 'bg-status-warning-muted text-status-warning')}>
          {isReconciled ? 'Reconciled' : 'Variance'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Schedule</div>
          <div className="figure tabular-nums">{formatCurrency(expected)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">GL</div>
          <div className="figure tabular-nums">{formatCurrency(gl)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Variance</div>
          <div className={cn('figure tabular-nums', !isReconciled && 'text-status-warning')}>{formatCurrency(variance)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Expected Credit Losses — route `/tax/expected-credit-losses`. Real
 * useEcl()/eclComputationService data throughout — the provision matrix on
 * trade receivables and its period movement (IFRS 9). No `ecl`/`financial
 * instruments` entry exists in the real permission catalog (M11), so this
 * route/its actions stay ungated, same as before. Re-skinned onto v0's
 * PageHeader/SectionCard/FigureBlock (M13); no ECL math performed here —
 * `recalculateBucketLine()`/`findMostRecentPostedEclBefore()` remain the
 * sole calculation sources.
 */
export function EclProvisionPage() {
  const { financialYears, company, computations, loading, error, refetch, createComputation, updateBuckets, deleteComputation, postComputation } = useEcl();
  const navigate = useNavigate();
  const canCreate = useCanAccess('tax', 'create');
  const canUpdate = useCanAccess('tax', 'update');
  const canPost = useCanAccess('tax', 'post');

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const selectedComputation = computations.find((c) => c.financialYearId === activeFinancialYearId);

  const priorComputation = selectedComputation && company ? findMostRecentPostedEclBefore(computations, company.id, selectedComputation.asOfDate, selectedComputation.id) : undefined;
  const previewMovement = selectedComputation ? selectedComputation.totalExpectedCreditLoss - (priorComputation?.totalExpectedCreditLoss ?? 0) : 0;
  const { reconciliation, loading: reconciliationLoading } = useEclReconciliation(selectedComputation);

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    setActionError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await action();
      if (successMessage) setStatusMessage(successMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expected credit losses"
        description="Provision matrix on trade receivables and the period movement (IFRS 9)."
        actions={
          sortedFinancialYears.length > 0 ? (
            <Field className="w-44">
              <FieldLabel htmlFor="eclFinancialYearSelect">Financial year</FieldLabel>
              <EnumSelect
                id="eclFinancialYearSelect"
                value={activeFinancialYearId ?? ''}
                onValueChange={setSelectedFinancialYearId}
                options={sortedFinancialYears.map((year) => ({ value: year.id, label: year.name }))}
              />
            </Field>
          ) : undefined
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
          {statusMessage}
        </p>
      )}

      <p role="note" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-4 py-2.5 text-sm text-status-warning">
        Gross receivables per bucket come from the real Customer Aging Report. Loss rates per bucket are ALWAYS a
        manual entry — this system has no historical default-rate data to derive them from, and does not guess one.
        Requires professional/accounting review before relying on it for a statutory filing.
      </p>

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading expected credit loss data…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && sortedFinancialYears.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyTitle>No financial years yet</EmptyTitle>
            <EmptyDescription>A financial year must exist before expected credit losses can be computed.</EmptyDescription>
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && selectedFinancialYear && !selectedComputation && (
        <SectionCard>
          <Empty>
            <EmptyTitle>No expected credit loss computation yet for {selectedFinancialYear.name}</EmptyTitle>
            <EmptyDescription>Create one to pull in real receivable balances by aging bucket from the Customer Aging Report.</EmptyDescription>
          </Empty>
          {canCreate && (
            <div className="flex justify-center pb-5">
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await createComputation(selectedFinancialYear.id);
                  }, `Created a draft expected credit loss computation for ${selectedFinancialYear.name}.`)
                }
              >
                Create Computation
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {!loading && !error && selectedComputation && (
        <>
          <SectionCard
            title={`${selectedComputation.financialYearLabel} — ${selectedComputation.status === 'draft' ? 'Draft' : 'Posted'}`}
            description={`As of ${formatDate(selectedComputation.asOfDate)}`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile variant="compact" icon={WalletCardsIcon} label="Gross receivables" value={formatCurrency(selectedComputation.totalGrossReceivable)} />
              <StatTile variant="compact" icon={ShieldAlertIcon} label="Expected credit loss provision" value={formatCurrency(selectedComputation.totalExpectedCreditLoss)} tone="warning" />
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2.5 sm:p-3">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{selectedComputation.status === 'draft' ? 'Movement preview' : 'Movement posted'}</span>
                <Amount value={selectedComputation.status === 'draft' ? previewMovement : (selectedComputation.movementAmount ?? 0)} className="text-xl font-semibold" />
                <span className="text-xs text-muted-foreground">{priorComputation ? `vs. ${priorComputation.financialYearLabel} (posted)` : 'vs. R0.00 (first computation for this company)'}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Provision matrix">
            <EclBucketTable
              key={selectedComputation.id}
              buckets={selectedComputation.buckets}
              editable={selectedComputation.status === 'draft' && canUpdate}
              onSave={async (buckets) => {
                await updateBuckets(selectedComputation.id, buckets);
                setStatusMessage('Loss rates saved and the provision recomputed.');
              }}
            />
          </SectionCard>

          {selectedComputation.status === 'draft' ? (
            <div className="flex justify-end gap-2">
              {canUpdate && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await deleteComputation(selectedComputation.id);
                    }, 'Draft expected credit loss computation deleted.')
                  }
                >
                  Delete Draft
                </Button>
              )}
              {canPost && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await postComputation(selectedComputation.id);
                    }, `Posted the expected credit loss movement for ${selectedComputation.financialYearLabel}.`)
                  }
                >
                  Post Movement
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Posted{selectedComputation.postedAt ? ` on ${formatDate(selectedComputation.postedAt)}` : ''}
              {selectedComputation.journalEntryId ? (
                <>
                  {' — '}
                  <RecordLink onClick={() => navigate(`/accounting/journals?record=${selectedComputation.journalEntryId}`)} className="text-xs">
                    view journal entry
                  </RecordLink>
                  .
                </>
              ) : (
                ' — no journal entry (nil movement).'
              )}{' '}
              A posted computation is immutable; there is no reversal path yet.
            </p>
          )}

          {selectedComputation.status === 'posted' && (
            <SectionCard
              title="Allowance ↔ GL Reconciliation"
              description={`As of ${formatDate(selectedComputation.asOfDate)} — independently compares this posted schedule's own allowance total against the real GL balance of the Allowance for Doubtful Debts account on that date. Posting successfully does not by itself mean reconciled.`}
            >
              {reconciliationLoading && <p className="text-sm text-muted-foreground">Reconciling…</p>}
              {!reconciliationLoading && reconciliation && (
                <ReconciliationRow
                  label="Allowance for Doubtful Debts"
                  expected={reconciliation.allowance.expectedAllowance}
                  gl={reconciliation.allowance.glAllowance}
                  variance={reconciliation.allowance.variance}
                  isReconciled={reconciliation.allowance.isReconciled}
                />
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
