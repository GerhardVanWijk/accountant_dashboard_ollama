import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useDeferredTax } from '../hooks/useDeferredTax';
import { TemporaryDifferencesTable } from '../components/TemporaryDifferencesTable';
import { findMostRecentPostedBefore } from '../services/deferredTaxCalculations';

/** Deferred Tax — route `/tax/deferred-tax`. Re-skinned onto v0's PageHeader/SectionCard (M7); data/mutation wiring unchanged. */
export function DeferredTaxPage() {
  const { financialYears, company, computations, loading, error, refetch, createComputation, updateItems, deleteComputation, postComputation } = useDeferredTax();
  const navigate = useNavigate();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const selectedComputation = computations.find((c) => c.financialYearId === activeFinancialYearId);

  const priorComputation = selectedComputation && company ? findMostRecentPostedBefore(computations, company.id, selectedComputation.asOfDate, selectedComputation.id) : undefined;
  const previewMovement = selectedComputation ? selectedComputation.netDeferredTaxLiability - (priorComputation?.netDeferredTaxLiability ?? 0) : 0;

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

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading deferred tax data…</span>
      </div>
    );
  }
  if (error) {
    return (
      <SectionCard>
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <Button variant="outline" className="mt-3" onClick={refetch}>
          Retry
        </Button>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deferred Tax"
        description="Temporary differences, Deferred Tax Assets/Liabilities, and the period movement."
        actions={
          sortedFinancialYears.length > 0 ? (
            <NativeSelect aria-label="Financial Year" value={activeFinancialYearId ?? ''} onChange={(e) => setSelectedFinancialYearId(e.target.value)}>
              {sortedFinancialYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-4 py-2.5 text-sm text-status-positive">
          {statusMessage}
        </p>
      )}

      <p role="note" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-4 py-2.5 text-sm text-status-warning">
        Not calculated as accounting profit × tax rate — every figure below is a real temporary difference (carrying amount vs. tax base). A Deferred Tax Asset only counts once you
        confirm it&apos;s probable future taxable profit will be available to use it — that judgment is never made automatically. Requires professional/accounting review before relying
        on it for a statutory filing.
      </p>

      {sortedFinancialYears.length === 0 && (
        <Empty>
          <EmptyTitle>No financial years yet</EmptyTitle>
          <EmptyDescription>A FinancialYear must exist before deferred tax can be computed.</EmptyDescription>
        </Empty>
      )}

      {selectedFinancialYear && !selectedComputation && (
        <SectionCard>
          <Empty>
            <EmptyTitle>No deferred tax computation yet for {selectedFinancialYear.name}</EmptyTitle>
            <EmptyDescription>Create one to pull in the Fixed Asset Tax Register's temporary differences and add any others (provisions, assessed losses).</EmptyDescription>
            <Button
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await createComputation(selectedFinancialYear.id);
                }, `Created a draft deferred tax computation for ${selectedFinancialYear.name}.`)
              }
            >
              Create Deferred Tax Computation
            </Button>
          </Empty>
        </SectionCard>
      )}

      {selectedComputation && (
        <>
          <SectionCard
            title={`${selectedComputation.financialYearLabel} — ${selectedComputation.status === 'draft' ? 'Draft' : 'Posted'}`}
            description={`As of ${formatDate(selectedComputation.asOfDate)} · ${selectedComputation.taxRatePercent}% rate (${selectedComputation.taxConfigTaxYearLabel})`}
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <FigureBlock label="Deferred Tax Liability" value={formatCurrency(selectedComputation.totalDeferredTaxLiability)} />
              <FigureBlock label="Deferred Tax Asset" value={formatCurrency(selectedComputation.totalDeferredTaxAsset)} />
              <FigureBlock label="Net Position" value={formatCurrency(selectedComputation.netDeferredTaxLiability)} tone="warning" />
              <FigureBlock
                label={selectedComputation.status === 'draft' ? 'Movement Preview' : 'Movement Posted'}
                value={formatCurrency(selectedComputation.status === 'draft' ? previewMovement : (selectedComputation.movementAmount ?? 0))}
                hint={priorComputation ? `vs. ${priorComputation.financialYearLabel} (posted)` : 'vs. R0.00 (first computation for this company)'}
                tone="warning"
              />
            </div>
          </SectionCard>

          <SectionCard title="Temporary Differences">
            <TemporaryDifferencesTable
              key={selectedComputation.id}
              items={selectedComputation.items}
              taxRatePercent={selectedComputation.taxRatePercent}
              editable={selectedComputation.status === 'draft'}
              onSave={async (items) => {
                await updateItems(selectedComputation.id, items);
                setStatusMessage('Temporary differences saved and the deferred tax position recomputed.');
              }}
            />
          </SectionCard>

          {selectedComputation.status === 'draft' ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="text-destructive"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await deleteComputation(selectedComputation.id);
                  }, 'Draft deferred tax computation deleted.')
                }
              >
                Delete Draft
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await postComputation(selectedComputation.id);
                  }, `Posted the deferred tax movement for ${selectedComputation.financialYearLabel}.`)
                }
              >
                Post Movement
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Posted{selectedComputation.postedAt ? ` on ${new Date(selectedComputation.postedAt).toLocaleDateString()}` : ''}
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
