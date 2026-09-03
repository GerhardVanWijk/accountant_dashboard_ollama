import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock, Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { EnumSelect } from '@/components/app/combobox';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useEcl } from '../hooks/useEcl';
import { EclBucketTable } from '../components/EclBucketTable';
import { findMostRecentPostedEclBefore } from '../services/eclCalculations';

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
        </SectionCard>
      )}

      {!loading && !error && selectedComputation && (
        <>
          <SectionCard
            title={`${selectedComputation.financialYearLabel} — ${selectedComputation.status === 'draft' ? 'Draft' : 'Posted'}`}
            description={`As of ${formatDate(selectedComputation.asOfDate)}`}
          >
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Gross receivables" value={formatCurrency(selectedComputation.totalGrossReceivable)} />
              <FigureBlock label="Expected credit loss provision" value={formatCurrency(selectedComputation.totalExpectedCreditLoss)} tone="warning" />
              <div className="flex flex-col gap-1">
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
              editable={selectedComputation.status === 'draft'}
              onSave={async (buckets) => {
                await updateBuckets(selectedComputation.id, buckets);
                setStatusMessage('Loss rates saved and the provision recomputed.');
              }}
            />
          </SectionCard>

          {selectedComputation.status === 'draft' ? (
            <div className="flex justify-end gap-2">
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
        </>
      )}
    </div>
  );
}
