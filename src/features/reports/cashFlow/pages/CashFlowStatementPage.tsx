import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useCashFlowStatement } from '../hooks/useCashFlowStatement';
import { CashFlowSectionTable } from '../components/CashFlowSectionTable';
import { ReconciliationCheck } from '../components/ReconciliationCheck';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Statement of Cash Flows — route `/reports/cash-flow`. Real
 * `computeCashFlowStatement()` data throughout — INDIRECT method only
 * (SA_ACCOUNTING_MASTER_SPEC.md §42); no comparative/YoY column and no
 * direct-method presentation, matching the underlying service's explicitly
 * documented scope (out of scope "per dispatch" in
 * `cashFlowStatementService.ts` — not a gap introduced by this UI pass).
 * Re-skinned onto v0's PageHeader/SectionCard/FigureBlock (M9).
 */
export function CashFlowStatementPage() {
  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const { financialYears, statement, loading, error, refetch } = useCashFlowStatement(selectedFinancialYearId);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);
  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const activeFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statement of cash flows"
        description="Operating, investing and financing activities — indirect method (§42)."
        actions={
          sortedFinancialYears.length > 0 ? (
            <Field className="w-44">
              <FieldLabel htmlFor="cashFlowFinancialYear">Financial year</FieldLabel>
              <select id="cashFlowFinancialYear" className={selectClassName} value={activeFinancialYearId ?? ''} onChange={(e) => setSelectedFinancialYearId(e.target.value)}>
                {sortedFinancialYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : undefined
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading cash flow statement…</p>
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
            <EmptyDescription>A financial year must exist before a Statement of Cash Flows can be produced.</EmptyDescription>
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && statement && activeFinancialYear && (
        <>
          <SectionCard title={activeFinancialYear.name} description={`${formatDate(activeFinancialYear.startDate)} – ${formatDate(activeFinancialYear.endDate)}`}>
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Net profit (period)" value={formatCurrency(statement.netProfit)} />
              <FigureBlock label="Net cash movement" value={formatCurrency(statement.netCashMovement)} />
              <FigureBlock label="Actual cash and bank movement" value={formatCurrency(statement.actualCashMovement)} />
            </div>
          </SectionCard>

          <SectionCard>
            <CashFlowSectionTable title="Operating Activities" section={statement.operating} />
            <CashFlowSectionTable title="Investing Activities" section={statement.investing} />
            <CashFlowSectionTable title="Financing Activities" section={statement.financing} />

            <div className="mt-3 grid grid-cols-[1fr_auto] items-baseline gap-2 border-t-2 border-foreground/30 py-2 font-semibold">
              <span>Net Increase / (Decrease) in Cash</span>
              <Amount value={statement.netCashMovement} statement className="text-sm font-semibold" />
            </div>
          </SectionCard>

          <SectionCard title="Reconciliation check">
            <ReconciliationCheck statement={statement} />
          </SectionCard>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Not built (out of scope): comparative/prior-year columns, cash flow forecasting, and a direct-method
        presentation — this statement is indirect-method only (§42).
      </p>
    </div>
  );
}
