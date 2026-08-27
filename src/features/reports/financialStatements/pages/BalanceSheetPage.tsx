import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import type { FinancialYear } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { cn } from '@/lib/utils';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';
import { calculateBalanceSheet } from '../services/calculateBalanceSheet';
import { StatementRow, StatementSectionHeader } from '../components/StatementRow';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The FinancialYear whose Current Year Earnings line covers `asOfDate`:
 * the year that actually contains the date, or failing that (asOfDate
 * falls after every known year's end, e.g. "today" with only a prior-year
 * FinancialYear seeded) the most recent year that had already started by
 * asOfDate. Returns undefined only when no FinancialYear started on or
 * before asOfDate at all.
 */
function findFinancialYearForDate(financialYears: FinancialYear[], asOfDate: string): FinancialYear | undefined {
  const asOf = asOfDate.slice(0, 10);
  const containing = financialYears.find((y) => y.startDate.slice(0, 10) <= asOf && y.endDate.slice(0, 10) >= asOf);
  if (containing) return containing;

  const startedOnOrBefore = financialYears.filter((y) => y.startDate.slice(0, 10) <= asOf).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return startedOnOrBefore[0];
}

/**
 * Balance Sheet (Statement of Financial Position) — route
 * `/reports/balance-sheet`. Every figure comes from
 * `calculateBalanceSheet()` — the real authoritative report service
 * (SA_ACCOUNTING_MASTER_SPEC.md §42); current/non-current classification is
 * not offered because the real Chart of Accounts subType field does not
 * carry it beyond `contra_asset` (already respected below) — inventing a
 * current/non-current split from account codes would be exactly the kind
 * of frontend-invented classification M9 forbids. No comparative/prior-date
 * column either, for the same reason as the Income Statement page.
 * Re-skinned onto v0's PageHeader/SectionCard/Field (M9).
 */
export function BalanceSheetPage() {
  const { accounts, entries, financialYears, loading, error, refetch } = useFinancialStatementsData();
  const [asOfDate, setAsOfDate] = useState('');

  useEffect(() => {
    if (!asOfDate) setAsOfDate(todayISO());
  }, [asOfDate]);

  const relevantFinancialYear = useMemo(() => (asOfDate ? findFinancialYearForDate(financialYears, asOfDate) : undefined), [financialYears, asOfDate]);

  const balanceSheet = useMemo(() => {
    if (!asOfDate) return null;
    const financialYearStartDate = relevantFinancialYear?.startDate.slice(0, 10) ?? asOfDate;
    return calculateBalanceSheet(entries, accounts, asOfDate, financialYearStartDate);
  }, [entries, accounts, asOfDate, relevantFinancialYear]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Balance sheet"
        description="Statement of financial position as of a chosen date (SA_ACCOUNTING_MASTER_SPEC.md §42)."
        actions={
          <Field className="w-40">
            <FieldLabel htmlFor="balanceSheetAsOfDate">As of date</FieldLabel>
            <Input id="balanceSheetAsOfDate" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </Field>
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading balance sheet…</p>
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

      {!loading && !error && financialYears.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyTitle>No financial years yet</EmptyTitle>
            <EmptyDescription>Current Year Earnings will show as zero until a financial year exists to define the current period.</EmptyDescription>
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && balanceSheet && (
        <>
          <SectionCard title="Assets">
            {balanceSheet.assetLines.length === 0 ? (
              <StatementRow label="No asset balances as of this date" amount={0} indent />
            ) : (
              balanceSheet.assetLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent />)
            )}
            {balanceSheet.contraAssetLines.map((line) => (
              <StatementRow key={line.accountId} label={`Less: ${line.code} — ${line.name}`} amount={-line.amount} indent />
            ))}
            <StatementRow label="Total Assets" amount={balanceSheet.totalAssets} isTotal />
          </SectionCard>

          <SectionCard title="Liabilities & Equity">
            <StatementSectionHeader label="Liabilities" />
            {balanceSheet.liabilityLines.length === 0 ? (
              <StatementRow label="No liability balances as of this date" amount={0} indent />
            ) : (
              balanceSheet.liabilityLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent />)
            )}
            <StatementRow label="Total Liabilities" amount={balanceSheet.totalLiabilities} isTotal />

            <StatementSectionHeader label="Equity" />
            <StatementRow label="Owner's Equity" amount={balanceSheet.ownersEquity} indent />
            <StatementRow label="Retained Earnings" amount={balanceSheet.retainedEarnings} indent />
            <StatementRow
              label={`Current Year Earnings${relevantFinancialYear ? ` (${relevantFinancialYear.name} to date)` : ''}`}
              amount={balanceSheet.currentYearEarnings}
              indent
            />
            <StatementRow label="Total Equity" amount={balanceSheet.totalEquity} isTotal />

            <StatementRow label="Total Liabilities + Equity" amount={balanceSheet.totalLiabilitiesAndEquity} isTotal />
          </SectionCard>

          <SectionCard>
            <div
              role="status"
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3',
                balanceSheet.isBalanced ? 'border-status-positive-outline bg-status-positive-surface' : 'border-destructive/30 bg-destructive/10',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {balanceSheet.isBalanced ? (
                  <CheckCircle2 className="size-4 text-status-positive" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
                )}
                Assets = Liabilities + Equity check
              </span>
              <span className={cn('text-sm font-semibold', balanceSheet.isBalanced ? 'text-status-positive' : 'text-destructive')}>
                {balanceSheet.isBalanced ? 'Balanced' : `Out of balance by ${balanceSheet.difference.toFixed(2)} — this indicates a data or calculation bug.`}
              </span>
            </div>
          </SectionCard>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Not built (out of scope): Notes to the Financial Statements (§43), Statement of Changes in Equity,
        year-over-year/comparative columns, current/non-current classification (not carried by the Chart of
        Accounts), budget-vs-actual, export/PDF.
      </p>
    </div>
  );
}
