import { useEffect, useMemo, useState } from 'react';
import type { FinancialYear } from '@/types';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';
import { calculateBalanceSheet } from '../services/calculateBalanceSheet';
import { StatementRow, StatementSectionHeader } from '../components/StatementRow';
import { fieldInput, fieldLabel } from '../components/formStyles';

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
  const containing = financialYears.find(
    (y) => y.startDate.slice(0, 10) <= asOf && y.endDate.slice(0, 10) >= asOf,
  );
  if (containing) return containing;

  const startedOnOrBefore = financialYears
    .filter((y) => y.startDate.slice(0, 10) <= asOf)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return startedOnOrBefore[0];
}

/** Balance Sheet (Statement of Financial Position) — proposed route `/reports/balance-sheet`. */
export function BalanceSheetPage() {
  const { accounts, entries, financialYears, loading, error, refetch } = useFinancialStatementsData();
  const [asOfDate, setAsOfDate] = useState('');

  useEffect(() => {
    if (!asOfDate) setAsOfDate(todayISO());
  }, [asOfDate]);

  const relevantFinancialYear = useMemo(
    () => (asOfDate ? findFinancialYearForDate(financialYears, asOfDate) : undefined),
    [financialYears, asOfDate],
  );

  const balanceSheet = useMemo(() => {
    if (!asOfDate) return null;
    // No FinancialYear starts on/before asOfDate: there is no "current
    // year" to speak of yet, so Current Year Earnings is correctly zero
    // (the period collapses to a single day with itself as both ends).
    const financialYearStartDate = relevantFinancialYear?.startDate.slice(0, 10) ?? asOfDate;
    return calculateBalanceSheet(entries, accounts, asOfDate, financialYearStartDate);
  }, [entries, accounts, asOfDate, relevantFinancialYear]);

  if (loading) {
    return <Spinner label="Loading balance sheet…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-sm">
          <Icon name="reports" className="text-text-secondary" size={22} />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Balance Sheet</h1>
            <p className="mt-xs text-sm text-text-secondary">
              Statement of Financial Position as of a chosen date (SA_ACCOUNTING_MASTER_SPEC.md §42).
              /reports/balance-sheet
            </p>
          </div>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="balanceSheetAsOfDate">
            As Of Date
          </label>
          <input
            id="balanceSheetAsOfDate"
            type="date"
            className={fieldInput}
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>
      </div>

      {financialYears.length === 0 && (
        <EmptyState
          title="No financial years yet"
          message="Current Year Earnings will show as zero until a FinancialYear exists to define the current period."
        />
      )}

      {balanceSheet && (
        <>
          <Card>
            <StatementSectionHeader label="Assets" />
            {balanceSheet.assetLines.length === 0 ? (
              <StatementRow label="No asset balances as of this date" amount={0} indent />
            ) : (
              balanceSheet.assetLines.map((line) => (
                <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent />
              ))
            )}
            {balanceSheet.contraAssetLines.map((line) => (
              <StatementRow
                key={line.accountId}
                label={`Less: ${line.code} — ${line.name}`}
                amount={line.amount}
                indent
                isInverted
              />
            ))}
            <StatementRow label="Total Assets" amount={balanceSheet.totalAssets} isTotal />
          </Card>

          <Card>
            <StatementSectionHeader label="Liabilities" />
            {balanceSheet.liabilityLines.length === 0 ? (
              <StatementRow label="No liability balances as of this date" amount={0} indent />
            ) : (
              balanceSheet.liabilityLines.map((line) => (
                <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent />
              ))
            )}
            <StatementRow label="Total Liabilities" amount={balanceSheet.totalLiabilities} isTotal />

            <StatementSectionHeader label="Equity" />
            <StatementRow label="acc_3000 — Owner's Equity" amount={balanceSheet.ownersEquity} indent />
            <StatementRow label="acc_3900 — Retained Earnings" amount={balanceSheet.retainedEarnings} indent />
            <StatementRow
              label={`Current Year Earnings${relevantFinancialYear ? ` (${relevantFinancialYear.name} to date)` : ''}`}
              amount={balanceSheet.currentYearEarnings}
              indent
            />
            <StatementRow label="Total Equity" amount={balanceSheet.totalEquity} isTotal />

            <StatementRow label="Total Liabilities + Equity" amount={balanceSheet.totalLiabilitiesAndEquity} isTotal />
          </Card>

          <Card className={balanceSheet.isBalanced ? 'border-positive' : 'border-danger'}>
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <span className="text-sm font-semibold text-text-primary">
                Assets = Liabilities + Equity check
              </span>
              <span
                className={`text-sm font-semibold ${balanceSheet.isBalanced ? 'text-positive' : 'text-danger'}`}
                role="status"
              >
                {balanceSheet.isBalanced
                  ? 'Balanced'
                  : `Out of balance by ${balanceSheet.difference.toFixed(2)} — this indicates a data or calculation bug.`}
              </span>
            </div>
          </Card>
        </>
      )}

      <p className="text-xs text-text-secondary">
        Not built (out of scope for this pass): Notes to the Financial Statements (§43), Statement of Changes in
        Equity, year-over-year/comparative columns, budget-vs-actual (no Budget entity exists in this app),
        export/PDF/print.
      </p>
    </div>
  );
}
