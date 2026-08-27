import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/shadcn/empty';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency } from '@/lib/app/format';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { useIncomeTax } from '../hooks/useIncomeTax';
import { AdjustmentsTable } from '../components/AdjustmentsTable';
import { SbcEligibilityForm } from '../components/SbcEligibilityForm';

const selectClassName = 'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Income Tax — route `/tax/income-tax` (docs/ROUTES.md). Re-skinned onto v0's PageHeader/SectionCard/Dialog (M7); data/mutation wiring unchanged. */
export function IncomeTaxPage() {
  const {
    financialYears,
    company,
    computations,
    loading,
    error,
    refetch,
    createComputation,
    updateAdjustments,
    deleteComputation,
    postComputation,
    setSbcEligibility,
  } = useIncomeTax();
  const navigate = useNavigate();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sbcModalOpen, setSbcModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const selectedComputation = computations.find((c) => c.financialYearId === activeFinancialYearId);

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
        <span className="text-sm">Loading income tax data…</span>
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
        title="Income Tax"
        description="Corporate income tax computation, SBC eligibility, and the accounting-profit-to-taxable-income reconciliation."
        actions={
          sortedFinancialYears.length > 0 ? (
            <select
              aria-label="Financial Year"
              className={selectClassName}
              value={activeFinancialYearId ?? ''}
              onChange={(e) => setSelectedFinancialYearId(e.target.value)}
            >
              {sortedFinancialYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
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

      <SectionCard
        title="SBC (Small Business Corporation) Eligibility"
        description={`Manually confirmed by an accountant only — not auto-determined. ${company?.isSbcEligible ? 'Currently flagged eligible' : 'Currently not flagged eligible'}${company?.sbcEligibilityReason ? `: "${company.sbcEligibilityReason}"` : '.'}`}
        actions={
          <Button variant="outline" onClick={() => setSbcModalOpen(true)}>
            {company?.isSbcEligible ? 'Change' : 'Flag as SBC-eligible'}
          </Button>
        }
        bodyClassName="hidden"
      >
        {null}
      </SectionCard>

      {sortedFinancialYears.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion />
            </EmptyMedia>
            <EmptyTitle>No financial years yet</EmptyTitle>
            <EmptyDescription>A FinancialYear must exist before income tax can be computed.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {selectedFinancialYear && !selectedComputation && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No tax computation yet for {selectedFinancialYear.name}</EmptyTitle>
              <EmptyDescription>Create one to compute accounting profit, suggested tax adjustments, taxable income, and the resulting tax liability.</EmptyDescription>
            </EmptyHeader>
            <Button
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await createComputation(selectedFinancialYear.id);
                }, `Created a draft tax computation for ${selectedFinancialYear.name}.`)
              }
            >
              Create Tax Computation
            </Button>
          </Empty>
        </SectionCard>
      )}

      {selectedComputation && (
        <>
          <SectionCard
            title={`${selectedComputation.financialYearLabel} — ${selectedComputation.status === 'draft' ? 'Draft' : 'Posted'}`}
            description={`Tax year of assessment: ${selectedComputation.taxConfigTaxYearLabel} · ${selectedComputation.isSbcEligible ? 'SBC brackets applied' : 'Standard corporate rate applied'}`}
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <FigureBlock label="Accounting Profit" value={formatCurrency(selectedComputation.accountingProfit)} />
              <FigureBlock label="Net Adjustments" value={formatCurrency(selectedComputation.taxableIncome - selectedComputation.accountingProfit)} />
              <FigureBlock label="Taxable Income" value={formatCurrency(selectedComputation.taxableIncome)} />
              <FigureBlock label="Tax Liability" value={formatCurrency(selectedComputation.taxLiability)} tone="warning" />
            </div>
          </SectionCard>

          <SectionCard title="Tax Adjustments">
            <AdjustmentsTable
              key={selectedComputation.id}
              adjustments={selectedComputation.adjustments}
              editable={selectedComputation.status === 'draft'}
              onSave={async (adjustments) => {
                await updateAdjustments(selectedComputation.id, adjustments);
                setStatusMessage('Adjustments saved and taxable income/tax liability recomputed.');
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
                  }, 'Draft tax computation deleted.')
                }
              >
                Delete Draft
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await postComputation(selectedComputation.id);
                  }, `Posted income tax for ${selectedComputation.financialYearLabel}.`)
                }
              >
                Post Tax Computation
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
                ' — no journal entry (nil tax liability).'
              )}{' '}
              A posted computation is immutable; there is no reversal path yet.
            </p>
          )}
        </>
      )}

      <Dialog open={sbcModalOpen} onOpenChange={setSbcModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>SBC Eligibility</DialogTitle>
          </DialogHeader>
          <SbcEligibilityForm
            currentValue={company?.isSbcEligible ?? false}
            onCancel={() => setSbcModalOpen(false)}
            onSubmit={async (isEligible, reason) => {
              await runAction(async () => {
                await setSbcEligibility(isEligible, SYSTEM_USER_ID, reason);
              }, 'SBC eligibility updated.');
              setSbcModalOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
